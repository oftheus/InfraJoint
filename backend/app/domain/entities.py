"""Entidades e regras de negócio. Nenhum import de framework, banco ou HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
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
    birth_date: date | None
    sex: Sex | None
    phone: str | None
    primary_diagnosis: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class NewPatient:
    full_name: str
    birth_date: date | None = None
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
    clinical_notes: str | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class NewEncounter:
    occurred_at: datetime | None = None
    reason: str | None = None
    clinical_notes: str | None = None
