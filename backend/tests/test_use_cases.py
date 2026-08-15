"""Testes dos casos de uso sem banco, sem HTTP e sem asyncpg.

O dublê abaixo tem vinte linhas. Ele existir é o retorno concreto de os casos de uso
dependerem dos Protocols de domain/repositories.py e não do PostgresPatientRepository.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.application.use_cases.encounters import CreateEncounter
from app.application.use_cases.patients import (
    CreatePatient,
    DeletePatient,
    GetPatient,
    UpdatePatient,
)
from app.domain.entities import (
    AuthenticatedUser,
    Encounter,
    NewEncounter,
    NewPatient,
    Patient,
    UserRole,
)
from app.domain.errors import ForbiddenError, NotFoundError

NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)


def _patient(owner: UUID, name: str = "Ana") -> Patient:
    return Patient(
        id=uuid4(),
        owner_id=owner,
        full_name=name,
        birth_date=None,
        sex=None,
        phone=None,
        primary_diagnosis=None,
        created_at=NOW,
        updated_at=NOW,
    )


class FakePatientRepository:
    """Simula o efeito da RLS: o que não está no dict é invisível, não é erro."""

    def __init__(self, visible: Sequence[Patient] = ()) -> None:
        self.by_id = {patient.id: patient for patient in visible}

    async def list_all(self) -> Sequence[Patient]:
        return list(self.by_id.values())

    async def get(self, patient_id: UUID) -> Patient | None:
        return self.by_id.get(patient_id)

    async def create(self, data: NewPatient) -> Patient:
        patient = _patient(uuid4(), data.full_name)
        self.by_id[patient.id] = patient
        return patient

    async def update(self, patient_id: UUID, changes: Mapping[str, Any]) -> Patient | None:
        existing = self.by_id.get(patient_id)
        if existing is None:
            return None
        updated = replace(existing, **changes)
        self.by_id[patient_id] = updated
        return updated

    async def delete(self, patient_id: UUID) -> bool:
        return self.by_id.pop(patient_id, None) is not None


class FakeEncounterRepository:
    def __init__(self) -> None:
        self.created: list[tuple[UUID, NewEncounter]] = []

    async def list_for_patient(self, patient_id: UUID) -> Sequence[Encounter]:
        return []

    async def create(self, patient_id: UUID, data: NewEncounter) -> Encounter:
        self.created.append((patient_id, data))
        return Encounter(
            id=uuid4(),
            patient_id=patient_id,
            owner_id=uuid4(),
            occurred_at=data.occurred_at or NOW,
            reason=data.reason,
            clinical_notes=data.clinical_notes,
            created_by=uuid4(),
            created_at=NOW,
            updated_at=NOW,
        )


MEDICO = AuthenticatedUser(id=uuid4(), role=UserRole.MEDICO)
ADMIN = AuthenticatedUser(id=uuid4(), role=UserRole.ADMIN)
LEITOR = AuthenticatedUser(id=uuid4(), role=UserRole.USER)


@pytest.mark.parametrize("user", [MEDICO, ADMIN])
async def test_clinico_cria_paciente(user: AuthenticatedUser) -> None:
    repo = FakePatientRepository()
    patient = await CreatePatient(repo).execute(user, NewPatient(full_name="Ana"))
    assert patient.full_name == "Ana"


async def test_leitor_nao_cria_paciente() -> None:
    repo = FakePatientRepository()
    with pytest.raises(ForbiddenError):
        await CreatePatient(repo).execute(LEITOR, NewPatient(full_name="Ana"))
    assert repo.by_id == {}, "nada deve ter chegado ao repositório"


async def test_leitor_nao_edita_paciente() -> None:
    existing = _patient(MEDICO.id)
    repo = FakePatientRepository([existing])
    with pytest.raises(ForbiddenError):
        await UpdatePatient(repo).execute(LEITOR, existing.id, {"full_name": "Outro"})


async def test_paciente_invisivel_vira_not_found() -> None:
    """A regra que define o comportamento cross-tenant: some, não recusa."""
    repo = FakePatientRepository()  # nada visível, como para o médico errado
    with pytest.raises(NotFoundError):
        await GetPatient(repo).execute(uuid4())


async def test_consulta_em_paciente_invisivel_vira_not_found() -> None:
    patients = FakePatientRepository()
    encounters = FakeEncounterRepository()

    with pytest.raises(NotFoundError):
        await CreateEncounter(patients, encounters).execute(
            MEDICO, uuid4(), NewEncounter(reason="tentativa")
        )

    assert encounters.created == [], "não pode ter tentado inserir"


async def test_leitor_nao_cria_consulta_e_nem_consulta_o_paciente() -> None:
    existing = _patient(LEITOR.id)
    patients = FakePatientRepository([existing])
    encounters = FakeEncounterRepository()

    with pytest.raises(ForbiddenError):
        await CreateEncounter(patients, encounters).execute(LEITOR, existing.id, NewEncounter())
    assert encounters.created == []


async def test_clinico_exclui_o_proprio_paciente() -> None:
    existing = _patient(MEDICO.id)
    repo = FakePatientRepository([existing])
    await DeletePatient(repo).execute(MEDICO, existing.id)
    assert repo.by_id == {}


async def test_leitor_nao_exclui_paciente() -> None:
    existing = _patient(LEITOR.id)
    repo = FakePatientRepository([existing])
    with pytest.raises(ForbiddenError):
        await DeletePatient(repo).execute(LEITOR, existing.id)
    assert existing.id in repo.by_id, "nada pode ter sido apagado"


async def test_excluir_paciente_invisivel_vira_not_found() -> None:
    repo = FakePatientRepository()
    with pytest.raises(NotFoundError):
        await DeletePatient(repo).execute(MEDICO, uuid4())


async def test_patch_vazio_nao_grava_e_devolve_o_atual() -> None:
    existing = _patient(MEDICO.id, "Ana")
    repo = FakePatientRepository([existing])
    result = await UpdatePatient(repo).execute(MEDICO, existing.id, {})
    assert result.full_name == "Ana"
