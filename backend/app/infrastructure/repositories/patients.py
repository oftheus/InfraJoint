from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.domain.entities import NewPatient, Patient, Sex
from app.domain.errors import ConflictError

# O índice único da migration `patients_sem_duplicado`: (owner_id, nome normalizado,
# birth_date). Violá-lo é erro de fluxo do cliente, não falha interna — traduzir aqui
# é o que evita que ele suba como 500 com nome de índice dentro.
_INDICE_DUPLICATA = "patients_sem_duplicado"
_MENSAGEM_DUPLICATA = (
    "já existe um paciente com este nome e esta data de nascimento no seu cadastro"
)

_COLUMNS = """
    id, owner_id, full_name, birth_date, sex,
    phone, primary_diagnosis, created_at, updated_at
"""

# Nas leituras, o nome do médico dono vai junto. A função é SECURITY DEFINER e só
# responde para admin — para os demais devolve NULL, que é o certo: um médico comum
# só enxerga os próprios pacientes, e um rótulo com o nome dele em toda linha seria
# ruído. Ver a migration `owner_display_name`.
_COLUMNS_COM_DONO = f"{_COLUMNS.rstrip()}, app.owner_display_name(owner_id) AS owner_name"

# Whitelist de colunas editáveis. O nome vem do schema Pydantic do router, mas o SQL
# é montado por interpolação — então a lista precisa existir aqui, na única camada
# que conhece nomes de coluna.
_UPDATABLE = frozenset(
    {
        "full_name",
        "birth_date",
        "sex",
        "phone",
        "primary_diagnosis",
    }
)


def _to_entity(row: asyncpg.Record) -> Patient:
    return Patient(
        id=row["id"],
        owner_id=row["owner_id"],
        full_name=row["full_name"],
        birth_date=row["birth_date"],
        sex=Sex(row["sex"]) if row["sex"] else None,
        phone=row["phone"],
        primary_diagnosis=row["primary_diagnosis"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        # Ausente nos caminhos de escrita, que não selecionam a coluna — e ali a
        # resposta é sobre a linha que o próprio chamador acabou de gravar.
        owner_name=row.get("owner_name"),
    )


class PostgresPatientRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def list_all(self) -> Sequence[Patient]:
        rows = await self._connection.fetch(
            f"SELECT {_COLUMNS_COM_DONO} FROM public.patients ORDER BY created_at DESC"
        )
        return [_to_entity(row) for row in rows]

    async def get(self, patient_id: UUID) -> Patient | None:
        row = await self._connection.fetchrow(
            f"SELECT {_COLUMNS_COM_DONO} FROM public.patients WHERE id = $1",
            patient_id,
        )
        return _to_entity(row) if row else None

    async def find_by_name(self, full_name: str) -> Sequence[Patient]:
        """Homônimos **do próprio médico**, pelo nome normalizado.

        `owner_id = auth.uid()` explícito, e não só a RLS: para o admin ela deixa ver
        todo mundo, e o aviso de duplicata passaria a falar de pacientes de outros
        médicos. Não é owner_id vindo do chamador — é a mesma origem que a policy usa.

        A comparação passa pela `app.normalized_name()` do índice único, então o que a
        tela avisa e o que o banco recusa são a mesma noção de "mesmo nome".
        """
        rows = await self._connection.fetch(
            f"""
            SELECT {_COLUMNS} FROM public.patients
             WHERE owner_id = auth.uid()
               AND app.normalized_name(full_name) = app.normalized_name($1)
             ORDER BY created_at DESC
            """,
            full_name,
        )
        return [_to_entity(row) for row in rows]

    async def create(self, data: NewPatient) -> Patient:
        # owner_id não aparece no INSERT: o trigger app.own_row() o define a partir de
        # auth.uid(). Enviá-lo daqui seria descartado de qualquer forma.
        try:
            row = await self._connection.fetchrow(
                f"""
                INSERT INTO public.patients
                    (full_name, birth_date, sex, phone, primary_diagnosis)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING {_COLUMNS}
                """,
                data.full_name,
                data.birth_date,
                data.sex.value if data.sex else None,
                data.phone,
                data.primary_diagnosis,
            )
        except asyncpg.UniqueViolationError as exc:
            raise _conflito(exc) from exc
        return _to_entity(row)

    async def delete(self, patient_id: UUID) -> bool:
        # O ON DELETE CASCADE leva consultas, análises e capturas junto. O RETURNING
        # distingue "apagou" de "não havia linha visível" sem um SELECT antes.
        deleted = await self._connection.fetchval(
            "DELETE FROM public.patients WHERE id = $1 RETURNING id", patient_id
        )
        return deleted is not None

    async def update(self, patient_id: UUID, changes: Mapping[str, Any]) -> Patient | None:
        unknown = set(changes) - _UPDATABLE
        if unknown:
            raise ValueError(f"colunas não editáveis: {sorted(unknown)}")

        assignments = ", ".join(f"{column} = ${i}" for i, column in enumerate(changes, start=2))
        values = [value.value if isinstance(value, Sex) else value for value in changes.values()]

        # A edição também esbarra no índice: renomear um paciente para o nome e a data
        # de outro é a mesma duplicata, chegando pelo outro caminho.
        try:
            row = await self._connection.fetchrow(
                f"""
                UPDATE public.patients SET {assignments}
                 WHERE id = $1
                RETURNING {_COLUMNS}
                """,
                patient_id,
                *values,
            )
        except asyncpg.UniqueViolationError as exc:
            raise _conflito(exc) from exc
        return _to_entity(row) if row else None


def _conflito(exc: asyncpg.UniqueViolationError) -> Exception:
    """Traduz a violação do índice; qualquer outra continua subindo como está."""
    if exc.constraint_name == _INDICE_DUPLICATA:
        return ConflictError(_MENSAGEM_DUPLICATA)
    return exc
