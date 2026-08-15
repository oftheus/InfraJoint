from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.domain.entities import AuthenticatedUser, NewPatient, Patient
from app.domain.errors import ForbiddenError, NotFoundError
from app.domain.repositories import PatientRepository


@dataclass(frozen=True, slots=True)
class ListPatients:
    patients: PatientRepository

    async def execute(self) -> Sequence[Patient]:
        # Sem filtro por dono: a RLS já restringiu a conexão ao tenant do chamador.
        return await self.patients.list_all()


@dataclass(frozen=True, slots=True)
class GetPatient:
    patients: PatientRepository

    async def execute(self, patient_id: UUID) -> Patient:
        patient = await self.patients.get(patient_id)
        if patient is None:
            raise NotFoundError("paciente não encontrado")
        return patient


@dataclass(frozen=True, slots=True)
class CreatePatient:
    patients: PatientRepository

    async def execute(self, user: AuthenticatedUser, data: NewPatient) -> Patient:
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores criam pacientes")
        return await self.patients.create(data)


@dataclass(frozen=True, slots=True)
class DeletePatient:
    patients: PatientRepository

    async def execute(self, user: AuthenticatedUser, patient_id: UUID) -> None:
        """Apaga o paciente e, em cascata, todo o histórico clínico dele.

        A ordem das checagens importa: o papel é verificado antes de tocar no banco,
        para o leitor receber 403 (o papel dele é o problema) em vez de 404 (que
        sugeriria que o paciente não existe).
        """
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores excluem pacientes")
        if not await self.patients.delete(patient_id):
            raise NotFoundError("paciente não encontrado")


@dataclass(frozen=True, slots=True)
class UpdatePatient:
    patients: PatientRepository

    async def execute(
        self, user: AuthenticatedUser, patient_id: UUID, changes: Mapping[str, Any]
    ) -> Patient:
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores editam pacientes")
        if not changes:
            return await GetPatient(self.patients).execute(patient_id)

        patient = await self.patients.update(patient_id, changes)
        if patient is None:
            raise NotFoundError("paciente não encontrado")
        return patient
