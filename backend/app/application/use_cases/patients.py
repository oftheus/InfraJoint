from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.domain.entities import AuthenticatedUser, CaptureFile, NewPatient, Patient
from app.domain.errors import DuplicatePatientError, ForbiddenError, NotFoundError
from app.domain.repositories import CaptureRepository, PatientRepository


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

    async def execute(
        self, user: AuthenticatedUser, data: NewPatient, *, allow_duplicate: bool = False
    ) -> Patient:
        """Cria o paciente, avisando antes se já houver homônimo.

        O aviso existe porque o banco não pode ser a primeira notícia: o índice único
        recusa nome + data iguais, mas quem cadastra normalmente nem lembra do
        paciente que já está lá. Recusando aqui, com a lista de quem já existe, a tela
        pode oferecer *abrir o existente* — que é o que o médico queria em quase todos
        os casos.

        `allow_duplicate` é a confirmação do segundo pedido: homônimo com data de
        nascimento diferente é pessoa diferente e passa. Com a mesma data, o índice
        continua recusando — e aí a recusa é a correta, porque nem o médico teria como
        distinguir os dois depois.
        """
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores criam pacientes")

        if not allow_duplicate:
            homonimos = await self.patients.find_by_name(data.full_name)
            if homonimos:
                raise DuplicatePatientError(
                    "já existe paciente com este nome no seu cadastro", homonimos
                )

        return await self.patients.create(data)


@dataclass(frozen=True, slots=True)
class DeletePatient:
    patients: PatientRepository
    captures: CaptureRepository

    async def execute(self, user: AuthenticatedUser, patient_id: UUID) -> Sequence[CaptureFile]:
        """Apaga o paciente e, em cascata, todo o histórico clínico dele.

        A ordem das checagens importa: o papel é verificado antes de tocar no banco,
        para o leitor receber 403 (o papel dele é o problema) em vez de 404 (que
        sugeriria que o paciente não existe).

        Devolve os arquivos que ficaram órfãos no bucket. A cascata do banco não
        alcança o R2 — apagar aqui e não lá deixaria os objetos pagando armazenamento
        para sempre, com dado clínico dentro.

        **Quem apaga do bucket é o chamador, depois do commit.** Apagar aqui dentro
        inverteria o risco: se a transação falhasse no fim, os arquivos já teriam ido
        embora e o paciente continuaria existindo, apontando para imagens que não
        estão mais lá. Órfão custa dinheiro; arquivo faltando num prontuário vivo
        custa muito mais.
        """
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores excluem pacientes")

        # Coletar ANTES do DELETE: depois não há linha de onde derivar as chaves.
        orfaos = await self.captures.list_files_for_patient(patient_id)
        if not await self.patients.delete(patient_id):
            raise NotFoundError("paciente não encontrado")
        return orfaos


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
