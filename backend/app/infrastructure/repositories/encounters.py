from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.domain.entities import AnalysisStatus, Encounter, NewEncounter

_COLUMNS = """
    id, patient_id, owner_id, occurred_at, reason,
    joint_evaluations, scores, analysis_status, created_at, updated_at
"""

# Nas leituras vão junto quem registrou a consulta e o que este chamador pode fazer
# com ela. Mesmas funções que as policies chamam, pelo mesmo motivo de
# `repositories/patients.py`: a tela erra junto com a policy, ou acerta junto.
#
# `author_name` só é diferente do dono no acervo de pesquisa, onde a consulta que um
# pesquisador registra no paciente de um par nasce com o owner do par. Fora dele vem
# NULL, porque `app.user_display_name()` cala sobre as linhas do próprio chamador.
_COLUMNS_DE_LEITURA = f"""{_COLUMNS.rstrip()},
    app.user_display_name(created_by) AS author_name,
    app.can_curate(owner_id)  AS can_edit,
    app.can_discard(owner_id) AS can_delete"""


def _encode(value: Mapping[str, Any] | None) -> str | None:
    """asyncpg não converte dict para jsonb sozinho; o SQL faz o cast de $n::jsonb."""
    return None if value is None else json.dumps(value)


def _decode(value: str | None) -> Any:
    """asyncpg devolve jsonb como texto se nenhum codec estiver registrado.

    Decodificar aqui, e não com um `set_type_codec` no pool, mantém a conversão no
    único módulo que já conhece o driver — e evita que a sessão sob RLS ganhe mais
    um passo de setup por conexão.
    """
    return json.loads(value) if isinstance(value, str) else value


def _to_entity(row: asyncpg.Record) -> Encounter:
    return Encounter(
        id=row["id"],
        patient_id=row["patient_id"],
        owner_id=row["owner_id"],
        occurred_at=row["occurred_at"],
        reason=row["reason"],
        joint_evaluations=_decode(row["joint_evaluations"]),
        scores=_decode(row["scores"]) or {},
        analysis_status=(
            AnalysisStatus(row["analysis_status"]) if row["analysis_status"] else None
        ),
        capture_count=row.get("capture_count") or 0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        # Ausentes nos caminhos de escrita, pela mesma razão de `Patient`: ali a linha
        # é a que o próprio chamador acabou de gravar.
        author_name=row.get("author_name"),
        can_edit=row.get("can_edit", True),
        can_delete=row.get("can_delete", True),
    )


class PostgresEncounterRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def get(self, encounter_id: UUID) -> Encounter | None:
        # `capture_count` sai da mesma subconsulta da listagem: a consulta reaberta
        # precisa dizer quantas capturas tem antes de decidir baixá-las, e sem isto
        # o detalhe respondia sempre 0 — número errado, não ausência de número.
        row = await self._connection.fetchrow(
            f"""
            SELECT {_COLUMNS_DE_LEITURA},
                   (SELECT count(*) FROM public.analysis_captures c
                     WHERE c.encounter_id = public.encounters.id) AS capture_count
              FROM public.encounters
             WHERE id = $1
            """,
            encounter_id,
        )
        return _to_entity(row) if row else None

    async def start_analysis(self, encounter_id: UUID) -> Encounter | None:
        """Marca a consulta como tendo análise de imagem em envio.

        Sobrou só isto: os rótulos da sessão e os parâmetros saíram do schema, e o que
        resta é a transição de estado. `analysis_status` nasce 'uploading' porque as
        linhas das capturas existem e os bytes ainda não.
        """
        row = await self._connection.fetchrow(
            f"""
            UPDATE public.encounters SET analysis_status = 'uploading'
             WHERE id = $1
            RETURNING {_COLUMNS}
            """,
            encounter_id,
        )
        return _to_entity(row) if row else None

    async def delete(self, encounter_id: UUID) -> bool:
        # As capturas somem por cascata (analysis_captures.encounter_id ... on delete
        # cascade). Os objetos no R2 não — quem os apaga é o router, depois do commit.
        deleted = await self._connection.fetchval(
            "DELETE FROM public.encounters WHERE id = $1 RETURNING id", encounter_id
        )
        return deleted is not None

    async def set_analysis_status(self, encounter_id: UUID, status: str) -> bool:
        updated = await self._connection.fetchval(
            "UPDATE public.encounters SET analysis_status = $2 WHERE id = $1 RETURNING id",
            encounter_id,
            status,
        )
        return updated is not None

    async def list_for_patient(self, patient_id: UUID) -> Sequence[Encounter]:
        rows = await self._connection.fetch(
            f"""
            SELECT {_COLUMNS_DE_LEITURA},
                   (SELECT count(*) FROM public.analysis_captures c
                     WHERE c.encounter_id = public.encounters.id) AS capture_count
              FROM public.encounters
             WHERE patient_id = $1
             ORDER BY occurred_at DESC
            """,
            patient_id,
        )
        return [_to_entity(row) for row in rows]

    async def create(self, patient_id: UUID, data: NewEncounter) -> Encounter:
        # owner_id vem do trigger app.inherit_owner(), que copia do paciente lendo-o
        # sob a RLS de quem escreve. No acervo de pesquisa isso significa que a
        # consulta registrada no paciente de um par pertence ao PAR — por isso o
        # RETURNING traz as colunas derivadas, e não as cruas: devolvê-las no default
        # faria a tela oferecer excluir uma consulta que a policy não deixa apagar.
        #
        # O fluxo de Análise Térmica grava tudo numa instrução só: a consulta nasce
        # já com o body map e os escores. Não há passo intermediário no banco, então
        # abandonar o fluxo no meio não deixa consulta vazia no histórico.
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO public.encounters
                (patient_id, occurred_at, reason, joint_evaluations, scores)
            VALUES ($1, COALESCE($2, now()), $3, $4::jsonb, COALESCE($5::jsonb, '{{}}'::jsonb))
            RETURNING {_COLUMNS_DE_LEITURA}
            """,
            patient_id,
            data.occurred_at,
            data.reason,
            _encode(data.joint_evaluations),
            _encode(data.scores),
        )
        return _to_entity(row)
