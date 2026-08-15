from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from app.domain.entities import AuthenticatedUser, Encounter, NewEncounter, Patient
from app.domain.errors import ForbiddenError, NotFoundError
from app.domain.repositories import EncounterRepository, PatientRepository


@dataclass(frozen=True, slots=True)
class PatientWithEncounters:
    patient: Patient
    encounters: Sequence[Encounter]


@dataclass(frozen=True, slots=True)
class GetPatientDetail:
    """O paciente e as consultas dele, resolvendo o paciente **uma vez**.

    Compor `GetPatient` com um caso de uso separado de consultas custaria um SELECT a
    mais em `patients`, porque cada um precisaria da própria guarda de 404.
    """

    patients: PatientRepository
    encounters: EncounterRepository

    async def execute(self, patient_id: UUID) -> PatientWithEncounters:
        patient = await self.patients.get(patient_id)
        if patient is None:
            raise NotFoundError("paciente não encontrado")
        return PatientWithEncounters(
            patient=patient,
            encounters=await self.encounters.list_for_patient(patient_id),
        )


@dataclass(frozen=True, slots=True)
class CreateEncounter:
    patients: PatientRepository
    encounters: EncounterRepository

    async def execute(
        self, user: AuthenticatedUser, patient_id: UUID, data: NewEncounter
    ) -> Encounter:
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores criam consultas")

        # Resolver o paciente antes de inserir é o que transforma "paciente de outro
        # médico" em 404. Sem esta leitura, o insert falharia no trigger de posse com
        # um erro de banco — que vaza detalhe interno e não distingue inexistente de
        # invisível.
        if await self.patients.get(patient_id) is None:
            raise NotFoundError("paciente não encontrado")

        return await self.encounters.create(patient_id, data)
