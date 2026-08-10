from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

import asyncpg

from app.domain.entities import Encounter, NewEncounter

_COLUMNS = """
    id, patient_id, owner_id, occurred_at, reason, clinical_notes,
    created_by, created_at, updated_at
"""


def _to_entity(row: asyncpg.Record) -> Encounter:
    return Encounter(
        id=row["id"],
        patient_id=row["patient_id"],
        owner_id=row["owner_id"],
        occurred_at=row["occurred_at"],
        reason=row["reason"],
        clinical_notes=row["clinical_notes"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class PostgresEncounterRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def list_for_patient(self, patient_id: UUID) -> Sequence[Encounter]:
        rows = await self._connection.fetch(
            f"""
            SELECT {_COLUMNS} FROM public.encounters
             WHERE patient_id = $1
             ORDER BY occurred_at DESC
            """,
            patient_id,
        )
        return [_to_entity(row) for row in rows]

    async def create(self, patient_id: UUID, data: NewEncounter) -> Encounter:
        # owner_id vem do trigger app.inherit_owner(), que copia do paciente lendo-o
        # sob a RLS de quem escreve. created_by tem DEFAULT auth.uid().
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO public.encounters (patient_id, occurred_at, reason, clinical_notes)
            VALUES ($1, COALESCE($2, now()), $3, $4)
            RETURNING {_COLUMNS}
            """,
            patient_id,
            data.occurred_at,
            data.reason,
            data.clinical_notes,
        )
        return _to_entity(row)
