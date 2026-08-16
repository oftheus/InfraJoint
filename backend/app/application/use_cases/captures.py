from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.domain.entities import (
    AnalysisStatus,
    AuthenticatedUser,
    Capture,
    CaptureFile,
    FileKind,
)
from app.domain.errors import ConflictError, ForbiddenError, NotFoundError
from app.domain.repositories import (
    CaptureRepository,
    EncounterRepository,
    ObjectStorage,
    PatientRepository,
)


@dataclass(frozen=True, slots=True)
class SignedUpload:
    capture_id: UUID
    capture_index: int
    kind: FileKind
    url: str


@dataclass(frozen=True, slots=True)
class CreatedAnalysis:
    captures: Sequence[Capture]
    uploads: Sequence[SignedUpload]


@dataclass(frozen=True, slots=True)
class CreateCaptures:
    """Grava a análise na consulta e devolve as URLs para o browser subir os arquivos.

    Uma consulta tem UMA análise, avulsa ou em sequência — a diferença é a
    cardinalidade das capturas, nunca um discriminador. Por isso este caso de uso
    recusa uma segunda chamada: repetir o POST criaria um segundo jogo de capturas
    sob a mesma consulta, e o cliente ficaria com URLs órfãs apontando para linhas
    que ninguém lê.
    """

    encounters: EncounterRepository
    captures: CaptureRepository
    storage: ObjectStorage

    async def execute(
        self,
        user: AuthenticatedUser,
        encounter_id: UUID,
        analysis: Mapping[str, Any],
        captures: Sequence[Mapping[str, Any]],
    ) -> CreatedAnalysis:
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores gravam análises")

        # Resolver a consulta antes de escrever é o que transforma "consulta de outro
        # médico" em 404 em vez de deixar o trigger de posse vazar erro de banco.
        encounter = await self.encounters.get(encounter_id)
        if encounter is None:
            raise NotFoundError("consulta não encontrada")

        if await self.captures.list_for_encounter(encounter_id):
            raise ConflictError("esta consulta já tem uma análise de imagem")

        if await self.encounters.set_analysis(encounter_id, analysis) is None:
            raise NotFoundError("consulta não encontrada")

        gravadas = await self.captures.create_many(encounter_id, captures)

        # O endereço usa o owner_id que veio DA LINHA, não o id de quem chamou: se
        # algum dia os dois divergirem, o objeto ainda cai no prefixo do dono real.
        uploads = [
            SignedUpload(
                capture_id=capture.id,
                capture_index=capture.capture_index,
                kind=FileKind(kind),
                url=self.storage.presign_put(
                    CaptureFile(capture.owner_id, encounter_id, capture.id, FileKind(kind)),
                    declared.get("content_type", "application/octet-stream"),
                ),
            )
            for capture in gravadas
            for kind, declared in sorted(capture.files.items())
        ]
        return CreatedAnalysis(captures=gravadas, uploads=uploads)


@dataclass(frozen=True, slots=True)
class MarkAnalysisReady:
    """Fecha a análise em `ready` — mas só depois de conferir que os bytes chegaram.

    `analysis_captures.files` é declaração do que o cliente disse que enviaria; ela
    não prova nada. A prova é o HEAD em cada objeto. Sem esta checagem, uma consulta
    ficaria marcada como pronta com arquivos que nunca subiram, e o erro só apareceria
    meses depois, quando alguém tentasse reabrir a análise.
    """

    encounters: EncounterRepository
    captures: CaptureRepository
    storage: ObjectStorage

    async def execute(self, user: AuthenticatedUser, encounter_id: UUID) -> Sequence[str]:
        if not user.is_clinician:
            raise ForbiddenError("apenas médicos e administradores gravam análises")

        if await self.encounters.get(encounter_id) is None:
            raise NotFoundError("consulta não encontrada")

        gravadas = await self.captures.list_for_encounter(encounter_id)
        if not gravadas:
            raise NotFoundError("esta consulta não tem análise de imagem")

        faltando: list[str] = []
        for capture in gravadas:
            for kind in sorted(capture.files):
                alvo = CaptureFile(capture.owner_id, encounter_id, capture.id, FileKind(kind))
                if not await self.storage.exists(alvo):
                    faltando.append(f"captura {capture.capture_index}: {kind}")

        if faltando:
            raise ConflictError("; ".join(faltando))

        await self.encounters.set_analysis_status(encounter_id, AnalysisStatus.READY.value)
        return []


@dataclass(frozen=True, slots=True)
class EncounterDetail:
    encounter: Any
    patient: Any
    """Capturas com as URLs de leitura já embutidas em `files[kind].url`."""
    captures: Sequence[Mapping[str, Any]]


@dataclass(frozen=True, slots=True)
class GetEncounterDetail:
    """Reabre a consulta: paciente, body map, escores e capturas, numa chamada.

    O paciente vem embutido para a tela não precisar de um segundo request — mesma
    escolha que o detalhe do paciente faz ao embutir as consultas.

    **Só devolve capturas quando a análise está `ready`.** Em `uploading` as linhas
    existem mas os objetos podem não estar no bucket: assinar URLs para eles daria
    404 no browser e a tela mostraria uma análise quebrada em vez de dizer que o
    envio não terminou. O `analysis_status` vai junto para ela poder dizer isso.
    """

    encounters: EncounterRepository
    patients: PatientRepository
    captures: CaptureRepository
    storage: ObjectStorage | None

    async def execute(self, encounter_id: UUID) -> EncounterDetail:
        encounter = await self.encounters.get(encounter_id)
        if encounter is None:
            raise NotFoundError("consulta não encontrada")

        patient = await self.patients.get(encounter.patient_id)
        if patient is None:
            # A RLS já teria escondido a consulta; se chegou aqui e o paciente sumiu,
            # é inconsistência, não permissão.
            raise NotFoundError("paciente da consulta não encontrado")

        if encounter.analysis_status != AnalysisStatus.READY:
            return EncounterDetail(encounter=encounter, patient=patient, captures=[])

        linhas = await self.captures.list_detail_for_encounter(encounter_id)
        capturas: list[Mapping[str, Any]] = []
        for linha in linhas:
            registro = dict(linha)
            declarados = dict(registro.get("files") or {})
            if self.storage is not None:
                for kind, declarado in declarados.items():
                    alvo = CaptureFile(
                        owner_id=registro["owner_id"],
                        encounter_id=encounter_id,
                        capture_id=registro["id"],
                        kind=FileKind(kind),
                    )
                    declarados[kind] = {**declarado, "url": self.storage.presign_get(alvo)}
            registro["files"] = declarados
            capturas.append(registro)

        return EncounterDetail(encounter=encounter, patient=patient, captures=capturas)
