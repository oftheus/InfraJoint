from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.domain.entities import AnalysisStatus, Encounter, NewEncounter

_COLUMNS = """
    id, patient_id, owner_id, occurred_at, reason, clinical_notes,
    joint_evaluations, scores, analysis_status, created_at, updated_at
"""


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
        clinical_notes=row["clinical_notes"],
        joint_evaluations=_decode(row["joint_evaluations"]),
        scores=_decode(row["scores"]) or {},
        analysis_status=(
            AnalysisStatus(row["analysis_status"]) if row["analysis_status"] else None
        ),
        capture_count=row.get("capture_count") or 0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
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
            SELECT {_COLUMNS},
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
            SELECT {_COLUMNS},
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
        # sob a RLS de quem escreve — e a policy de escrita exige que ele seja o
        # próprio autor, então a consulta é sempre de quem a registrou.
        #
        # O fluxo de Análise Térmica grava tudo numa instrução só: a consulta nasce
        # já com o body map e os escores. Não há passo intermediário no banco, então
        # abandonar o fluxo no meio não deixa consulta vazia no histórico.
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO public.encounters
                (patient_id, occurred_at, reason, clinical_notes, joint_evaluations, scores)
            VALUES ($1, COALESCE($2, now()), $3, $4, $5::jsonb, COALESCE($6::jsonb, '{{}}'::jsonb))
            RETURNING {_COLUMNS}
            """,
            patient_id,
            data.occurred_at,
            data.reason,
            data.clinical_notes,
            _encode(data.joint_evaluations),
            _encode(data.scores),
        )
        return _to_entity(row)
