from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.domain.entities import NewPatient, Patient, Sex

_COLUMNS = """
    id, owner_id, full_name, birth_date, sex,
    phone, primary_diagnosis, created_at, updated_at
"""

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
    )


class PostgresPatientRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def list_all(self) -> Sequence[Patient]:
        rows = await self._connection.fetch(
            f"SELECT {_COLUMNS} FROM public.patients ORDER BY created_at DESC"
        )
        return [_to_entity(row) for row in rows]

    async def get(self, patient_id: UUID) -> Patient | None:
        row = await self._connection.fetchrow(
            f"SELECT {_COLUMNS} FROM public.patients WHERE id = $1",
            patient_id,
        )
        return _to_entity(row) if row else None

    async def create(self, data: NewPatient) -> Patient:
        # owner_id não aparece no INSERT: o trigger app.own_row() o define a partir de
        # auth.uid(). Enviá-lo daqui seria descartado de qualquer forma.
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

        row = await self._connection.fetchrow(
            f"""
            UPDATE public.patients SET {assignments}
             WHERE id = $1
            RETURNING {_COLUMNS}
            """,
            patient_id,
            *values,
        )
        return _to_entity(row) if row else None
