from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from app.domain.entities import AuthenticatedUser, CaptureFile, Encounter, NewEncounter, Patient
from app.domain.errors import ForbiddenError, NotFoundError
from app.domain.repositories import CaptureRepository, EncounterRepository, PatientRepository


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
        patient = await self.patients.get(patient_id)
        if patient is None:
            raise NotFoundError("paciente não encontrado")

        # Consulta é do dono do paciente. Para o médico errado o paciente já teria
        # sumido acima; quem cai aqui é o admin, que **enxerga** o paciente de todo
        # mundo. Sem esta guarda ele bateria na policy de escrita e receberia 500 por
        # uma recusa que é de autorização — e 403 é a resposta certa, porque a
        # identidade não é segredo para ele: o que falta é o papel de responsável.
        if patient.owner_id != user.id:
            raise ForbiddenError("apenas o médico responsável pelo paciente registra consultas")

        return await self.encounters.create(patient_id, data)


@dataclass(frozen=True, slots=True)
class DeleteEncounter:
    encounters: EncounterRepository
    captures: CaptureRepository

    async def execute(self, user: AuthenticatedUser, encounter_id: UUID) -> Sequence[CaptureFile]:
        """Apaga a consulta e, em cascata, a análise de imagem dela.

        Mesma forma de `DeletePatient`, e pelas mesmas razões: o papel é checado
        antes de tocar no banco, para o leitor receber 403 (o papel dele é o
        problema) em vez de 404 (que sugeriria consulta inexistente); os arquivos
        são coletados ANTES do DELETE, porque depois não há linha de onde derivar as
        chaves; e quem apaga do bucket é o chamador, depois do commit — se a
        transação falhasse no fim, os objetos já teriam ido embora e a consulta
        continuaria viva apontando para imagens que não existem mais.

        O paciente não é lido: a RLS já esconde consulta de outro médico, e o DELETE
        que não acha linha vira o mesmo 404 — sem um SELECT a mais para descobrir o
        que já se sabe.
        """
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores excluem consultas")

        orfaos = await self.captures.list_files_for_encounter(encounter_id)
        if not await self.encounters.delete(encounter_id):
            raise NotFoundError("consulta não encontrada")
        return orfaos
