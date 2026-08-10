"""Portas de persistência.

São Protocols, não classes-base: a implementação em infrastructure/ não importa este
módulo, e os casos de uso podem ser testados com um dublê de três linhas.

Nenhum método recebe `owner_id`. Isso é intencional — a delimitação por tenant é da
RLS, que já roda com as claims do usuário na conexão. Se a assinatura aceitasse
owner_id, existiria um caminho no código capaz de pedir dado de outro dono.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol
from uuid import UUID

from app.domain.entities import Encounter, NewEncounter, NewPatient, Patient


class PatientRepository(Protocol):
    async def list_all(self) -> Sequence[Patient]: ...

    async def get(self, patient_id: UUID) -> Patient | None: ...

    async def create(self, data: NewPatient) -> Patient: ...

    async def update(self, patient_id: UUID, changes: Mapping[str, Any]) -> Patient | None: ...

    async def delete(self, patient_id: UUID) -> bool:
        """`False` quando nada foi apagado — inexistente ou invisível pela RLS."""
        ...


class EncounterRepository(Protocol):
    async def list_for_patient(self, patient_id: UUID) -> Sequence[Encounter]: ...

    async def create(self, patient_id: UUID, data: NewEncounter) -> Encounter: ...
