"""Schemas de entrada e saída da API.

Separados das entidades de propósito: `Patient` carrega `owner_id`, que é detalhe de
tenancy e não interessa ao cliente — ele nunca vê senão o próprio.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.entities import Encounter, Patient, Sex


class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=200)
    birth_date: date | None = None
    sex: Sex | None = None
    phone: str | None = Field(default=None, max_length=40)
    primary_diagnosis: str | None = Field(default=None, max_length=300)


class PatientUpdate(BaseModel):
    """Todos os campos opcionais: o PATCH grava só o que foi enviado.

    `extra="forbid"` faz um campo desconhecido virar 422 em vez de ser silenciosamente
    ignorado — um typo no cliente não pode parecer sucesso.
    """

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    birth_date: date | None = None
    sex: Sex | None = None
    phone: str | None = Field(default=None, max_length=40)
    primary_diagnosis: str | None = Field(default=None, max_length=300)

    @field_validator("full_name")
    @classmethod
    def _nome_nao_pode_ser_apagado(cls, value: str | None) -> str | None:
        """`min_length` só vale para `str`; sem isto, `null` explícito passaria.

        Os outros quatro campos são nulos no banco, então enviar `null` neles significa
        limpar o campo. `full_name` é `not null`: o `UPDATE` falharia no constraint e o
        cliente receberia 500 por um erro que é dele.
        """
        if value is None:
            raise ValueError("full_name não pode ser nulo")
        return value


class PatientOut(BaseModel):
    id: UUID
    full_name: str
    birth_date: date | None
    sex: Sex | None
    phone: str | None
    primary_diagnosis: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_entity(cls, patient: Patient) -> PatientOut:
        return cls(
            id=patient.id,
            full_name=patient.full_name,
            birth_date=patient.birth_date,
            sex=patient.sex,
            phone=patient.phone,
            primary_diagnosis=patient.primary_diagnosis,
            created_at=patient.created_at,
            updated_at=patient.updated_at,
        )


class EncounterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurred_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=300)
    # O uvicorn não limita o tamanho do corpo, e este era o único campo textual sem
    # teto: um POST de centenas de MB seria bufferizado em memória e gravado.
    clinical_notes: str | None = Field(default=None, max_length=20_000)


class EncounterOut(BaseModel):
    id: UUID
    patient_id: UUID
    occurred_at: datetime
    reason: str | None
    clinical_notes: str | None
    created_at: datetime

    @classmethod
    def from_entity(cls, encounter: Encounter) -> EncounterOut:
        return cls(
            id=encounter.id,
            patient_id=encounter.patient_id,
            occurred_at=encounter.occurred_at,
            reason=encounter.reason,
            clinical_notes=encounter.clinical_notes,
            created_at=encounter.created_at,
        )


class PatientDetailOut(PatientOut):
    """Detalhe do paciente com as consultas embutidas.

    Evita um segundo request na tela de detalhe, mesmo motivo pelo qual o agregado da
    Fase 6 embute o paciente dentro da consulta.
    """

    encounters: list[EncounterOut]
