"""Entidades e regras de negócio. Nenhum import de framework, banco ou HTTP."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class UserRole(StrEnum):
    """Espelha o enum public.user_role no banco."""

    USER = "user"
    MEDICO = "medico"
    ADMIN = "admin"


class Sex(StrEnum):
    FEMALE = "F"
    MALE = "M"
    OTHER = "O"
    NOT_INFORMED = "N"


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: UUID
    role: UserRole

    @property
    def is_clinician(self) -> bool:
        """Quem pode criar e editar dado clínico.

        Espelha app.is_clinician() no banco de propósito: a API rejeita cedo para dar
        uma mensagem clara, e a policy rejeita de novo por ser a fronteira real. Se as
        duas discordarem, quem vence é o banco.
        """
        return self.role in (UserRole.MEDICO, UserRole.ADMIN)


@dataclass(frozen=True, slots=True)
class Patient:
    id: UUID
    owner_id: UUID
    full_name: str
    # Obrigatória: sem documento e sem número de prontuário, é o único campo que
    # distingue dois homônimos. Ver a migration `birth_date_obrigatoria`.
    birth_date: date
    sex: Sex | None
    phone: str | None
    primary_diagnosis: str | None
    created_at: datetime
    updated_at: datetime
    # Nome do médico dono, e não o id: serve à tela, não à autorização. Só vem
    # preenchido para admin — `app.owner_display_name()` devolve NULL para os demais,
    # e para um médico comum ele diria o nome dele mesmo em toda linha.
    owner_name: str | None = None


@dataclass(frozen=True, slots=True)
class NewPatient:
    full_name: str
    birth_date: date
    sex: Sex | None = None
    phone: str | None = None
    primary_diagnosis: str | None = None


@dataclass(frozen=True, slots=True)
class Encounter:
    id: UUID
    patient_id: UUID
    owner_id: UUID
    occurred_at: datetime
    reason: str | None
    joint_evaluations: Mapping[str, Any] | None
    scores: Mapping[str, Any]
    # `None` = consulta sem análise de imagem. Distingue "não tem" de "tem e ainda
    # está subindo", que na tela são coisas bem diferentes.
    analysis_status: AnalysisStatus | None
    # Quantas capturas a consulta tem. Contado na listagem por paciente e ao abrir
    # a consulta; nos caminhos de escrita vale 0, o que é verdade neles: a consulta
    # acabou de nascer, ou as capturas ainda não foram inseridas.
    capture_count: int
    created_at: datetime
    updated_at: datetime


class FileKind(StrEnum):
    """Os três arquivos de uma captura.

    É enum, e não texto livre, porque este valor entra na chave do objeto no R2 —
    texto livre permitiria `../` e escapar do prefixo do dono.
    """

    OPTICAL = "optical"
    THERMAL = "thermal"
    MATRIX = "matrix"


class AnalysisStatus(StrEnum):
    """Onde o upload está. `None` na coluna significa consulta sem análise."""

    UPLOADING = "uploading"
    READY = "ready"


@dataclass(frozen=True, slots=True)
class CaptureFile:
    """Endereço de um arquivo de captura, em termos de domínio.

    A porta de armazenamento recebe isto e deriva a chave sozinha — assim a
    aplicação nunca precisa saber como o R2 organiza objetos.
    """

    owner_id: UUID
    encounter_id: UUID
    capture_id: UUID
    kind: FileKind


@dataclass(frozen=True, slots=True)
class Capture:
    """Uma captura gravada, com o que basta para assinar suas URLs.

    Os resultados (`measurements`, alinhamento) não voltam aqui: eles são gravados e
    lidos pela tela de detalhe, não por este fluxo.
    """

    id: UUID
    encounter_id: UUID
    owner_id: UUID
    capture_index: int
    files: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class NewEncounter:
    """O que o fluxo de Análise Térmica grava ao finalizar.

    `joint_evaluations` e `scores` são opcionais porque as duas etapas do fluxo são
    opcionais: uma consulta pode existir sem body map, e um body map pode existir sem
    escore fechado (o DAS28 precisa de VHS/PCR, que nem sempre está em mãos).

    As duas ficam como Mapping e não como dataclass de domínio de propósito. O
    catálogo de articulações e as fórmulas dos índices vivem no frontend; replicá-los
    aqui criaria duas fontes da verdade que divergem em silêncio. A validação de
    forma e faixa acontece na borda, em presentation/schemas.py.
    """

    occurred_at: datetime | None = None
    reason: str | None = None
    joint_evaluations: Mapping[str, Any] | None = None
    scores: Mapping[str, Any] | None = None
