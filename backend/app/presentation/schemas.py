"""Schemas de entrada e saída da API.

Separados das entidades de propósito: `Patient` carrega `owner_id`, que é detalhe de
tenancy e não interessa ao cliente — ele nunca vê senão o próprio.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.entities import Encounter, Patient, Sex

# Ex.: RIGHT_MCP_3, LEFT_KNEE. Formato dos ids do catálogo do frontend.
_JOINT_ID = re.compile(r"[A-Z][A-Z0-9_]{2,39}")


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


class ActivityLevel(StrEnum):
    """Faixa de atividade da doença. Espelha DISEASE_ACTIVITY_META no frontend."""

    REMISSION = "remission"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class JointEvaluationIn(BaseModel):
    """O achado de uma articulação. Duas perguntas, nada além disso."""

    model_config = ConfigDict(extra="forbid")

    pain: bool
    swelling: bool


class CdaiScore(BaseModel):
    """CDAI = TJC28 + SJC28 + PGA + EGA, ambos os globais em EVA de 0 a 10. Faixa 0 a 76."""

    model_config = ConfigDict(extra="forbid")

    score: float = Field(ge=0, le=76)
    level: ActivityLevel
    tender_count: int = Field(ge=0, le=28)
    swollen_count: int = Field(ge=0, le=28)
    patient_global: float = Field(ge=0, le=10)
    evaluator_global: float = Field(ge=0, le=10)


class Das28Score(BaseModel):
    """DAS28 por VHS ou PCR. O teto de 10 cobre a faixa clínica com folga."""

    model_config = ConfigDict(extra="forbid")

    score: float = Field(ge=0, le=10)
    level: ActivityLevel
    tender_count: int = Field(ge=0, le=28)
    swollen_count: int = Field(ge=0, le=28)
    acute_phase: Literal["esr", "crp"]
    acute_value: float = Field(ge=0, le=300)
    patient_global_health: float = Field(ge=0, le=100)


# A chave do objeto JSON é o tipo de avaliação — é o que dá unicidade por tipo sem
# constraint nenhuma no banco. O casing é normalizado aqui, na fronteira: o frontend
# usa 'CDAI'/'DAS28' e o banco guarda minúsculo.
_SCORE_MODELS: dict[str, type[BaseModel]] = {"cdai": CdaiScore, "das28": Das28Score}

# Teto de segurança: o catálogo tem 28 articulações no corpo e algumas dezenas nas
# mãos. Cem cobre tudo com folga e impede um payload absurdo de ser gravado.
_MAX_JOINTS = 100


class EncounterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurred_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=300)
    # O uvicorn não limita o tamanho do corpo, e este era o único campo textual sem
    # teto: um POST de centenas de MB seria bufferizado em memória e gravado.
    clinical_notes: str | None = Field(default=None, max_length=20_000)

    # As duas etapas do fluxo de Análise Térmica são opcionais, então os dois campos
    # também são: cabe consulta sem body map, e body map sem escore fechado (o DAS28
    # exige VHS/PCR, que nem sempre está em mãos na hora).
    joint_evaluations: dict[str, JointEvaluationIn] | None = None
    scores: dict[str, Any] | None = None

    @field_validator("joint_evaluations")
    @classmethod
    def _valida_articulacoes(
        cls, value: dict[str, JointEvaluationIn] | None
    ) -> dict[str, JointEvaluationIn] | None:
        if value is None:
            return None
        if len(value) > _MAX_JOINTS:
            raise ValueError(f"no máximo {_MAX_JOINTS} articulações por avaliação")
        # O catálogo de articulações vive no frontend e não é replicado aqui — duas
        # listas divergiriam em silêncio. Valida-se a forma do id, não o valor.
        invalidos = [k for k in value if not _JOINT_ID.fullmatch(k)]
        if invalidos:
            raise ValueError(f"ids de articulação inválidos: {sorted(invalidos)[:5]}")
        return value

    @field_validator("scores")
    @classmethod
    def _valida_escores(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        normalizado: dict[str, Any] = {}
        for tipo, payload in value.items():
            chave = tipo.lower()
            modelo = _SCORE_MODELS.get(chave)
            if modelo is None:
                conhecidos = sorted(_SCORE_MODELS)
                raise ValueError(f"tipo de avaliação desconhecido: {tipo!r}; use {conhecidos}")
            if chave in normalizado:
                raise ValueError(f"tipo de avaliação repetido: {chave!r}")
            normalizado[chave] = modelo.model_validate(payload).model_dump()
        return normalizado


class EncounterOut(BaseModel):
    id: UUID
    patient_id: UUID
    occurred_at: datetime
    reason: str | None
    clinical_notes: str | None
    # Devolvidos como vieram do banco: é o que permite reabrir a consulta e ver os
    # mesmos dados. As chaves de `scores` saem minúsculas, como foram gravadas.
    joint_evaluations: dict[str, JointEvaluationIn] | None
    scores: dict[str, Any]
    # `null` = consulta sem análise de imagem; 'uploading' = linhas gravadas mas
    # bytes ainda não confirmados no bucket; 'ready' = tudo conferido por HEAD.
    analysis_status: Literal["uploading", "ready"] | None
    capture_count: int
    created_at: datetime

    @classmethod
    def from_entity(cls, encounter: Encounter) -> EncounterOut:
        return cls(
            id=encounter.id,
            patient_id=encounter.patient_id,
            occurred_at=encounter.occurred_at,
            reason=encounter.reason,
            clinical_notes=encounter.clinical_notes,
            analysis_status=encounter.analysis_status.value if encounter.analysis_status else None,
            capture_count=encounter.capture_count,
            joint_evaluations=dict(encounter.joint_evaluations)
            if encounter.joint_evaluations
            else None,
            scores=dict(encounter.scores),
            created_at=encounter.created_at,
        )


MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_CAPTURES = 64


class CaptureFileIn(BaseModel):
    """Declaração do arquivo — tamanho e tipo, não conteúdo.

    Ela NÃO prova que o upload aconteceu; quem prova é o HEAD feito ao fechar a
    análise em `ready`.
    """

    model_config = ConfigDict(extra="forbid")

    size: int = Field(gt=0, le=MAX_FILE_BYTES)
    content_type: str = Field(default="application/octet-stream", max_length=100)


class CaptureIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_index: int = Field(ge=0, lt=MAX_CAPTURES)
    # Nulos na análise avulsa: uma captura solta pode ser basal, pós-estresse ou teste
    # de bancada, e o banco precisa distinguir "não sei" de "é basal".
    phase: Literal["baseline", "dynamic"] | None = None
    label: str | None = Field(default=None, max_length=60)
    elapsed_seconds: float | None = Field(default=None, ge=0, le=100_000)

    align_a: float | None = None
    align_b: float | None = None
    align_tx: float | None = None
    align_c: float | None = None
    align_d: float | None = None
    align_ty: float | None = None
    # Método, e não modo: 'manual' já é um dos valores aqui, então uma segunda coluna
    # dizendo o mesmo só criaria a chance de as duas discordarem.
    alignment_method: Literal["silhouette", "fiducial", "manual"] | None = None

    agreement: dict[str, Any] | None = None
    fiducial_correction: dict[str, Any] | None = None
    measurements: list[dict[str, Any]] = Field(default_factory=list)
    # Problema de processamento desta captura — uma sequência de 21 pode ter uma
    # falha isolada, e perder esse registro esconderia por que ela não tem medição.
    issue: str | None = Field(default=None, max_length=300)

    # As chaves são Literal, não texto livre: elas entram na chave do objeto no R2, e
    # texto livre permitiria `../` e escapar do prefixo do dono.
    files: dict[Literal["optical", "thermal", "matrix"], CaptureFileIn]

    @property
    def agreement_normalized(self) -> float | None:
        """O backend deriva a coluna a partir do JSON, em vez de confiar no cliente."""
        if not self.agreement:
            return None
        valor = self.agreement.get("normalized")
        return float(valor) if isinstance(valor, int | float) else None


class AnalysisCreate(BaseModel):
    """Corpo do `POST /encounters/{id}/captures`.

    Uma consulta tem UMA análise. Avulsa é `captures` com um elemento; sequência tem
    N. Não há discriminador, e é de propósito.
    """

    model_config = ConfigDict(extra="forbid")

    captures: list[CaptureIn] = Field(min_length=1, max_length=MAX_CAPTURES)

    @field_validator("captures")
    @classmethod
    def _indices_e_basal(cls, value: list[CaptureIn]) -> list[CaptureIn]:
        indices = [c.capture_index for c in value]
        if len(set(indices)) != len(indices):
            raise ValueError("capture_index repetido")
        # O banco também cobra isto (índice parcial único), mas recusar aqui dá uma
        # mensagem legível em vez de um erro de constraint.
        if sum(1 for c in value if c.phase == "baseline") > 1:
            raise ValueError("uma sequência tem no máximo uma captura basal")
        return value


class SignedUploadOut(BaseModel):
    capture_id: UUID
    capture_index: int
    kind: Literal["optical", "thermal", "matrix"]
    url: str


class AnalysisCreatedOut(BaseModel):
    """As URLs valem por 1 h e o POST **não** pode ser repetido.

    Repetir criaria um segundo jogo de capturas sob a mesma consulta; o backend
    recusa com 409. Guarde estas URLs.
    """

    encounter_id: UUID
    uploads: list[SignedUploadOut]


class CaptureFileOut(BaseModel):
    """Arquivo da captura, com a URL de leitura assinada.

    `url` é nula quando o R2 não está configurado: a consulta ainda abre, com as
    medições e os escores, só sem as imagens.
    """

    size: int
    content_type: str
    url: str | None = None


class CaptureDetailOut(BaseModel):
    """Uma captura como ela foi gravada — é isto que reconstrói a tela.

    Os campos saem crus, do jeito que o domínio os produziu: a sobreposição é
    remontada no frontend a partir da afim e da matriz do CSV baixado, e a curva a
    partir de `measurements`. Nada é recalculado aqui.
    """

    id: UUID
    capture_index: int
    phase: Literal["baseline", "dynamic"] | None
    label: str | None
    elapsed_seconds: float | None

    align_a: float | None
    align_b: float | None
    align_tx: float | None
    align_c: float | None
    align_d: float | None
    align_ty: float | None
    alignment_method: Literal["silhouette", "fiducial", "manual"] | None

    agreement_normalized: float | None
    agreement: dict[str, Any] | None
    fiducial_correction: dict[str, Any] | None
    measurements: list[dict[str, Any]]
    issue: str | None
    files: dict[str, CaptureFileOut]


class EncounterDetailOut(EncounterOut):
    """A consulta reaberta, com tudo que a tela precisa numa chamada só.

    `patient` reusa `PatientOut` em vez de redeclarar o formato — assim a próxima
    mudança de coluna acerta este endpoint e o de pacientes de uma vez.

    `captures` vem vazia enquanto `analysis_status` não for `ready`: em `uploading`
    os objetos podem não estar no bucket, e URLs para eles dariam 404 na tela.
    """

    patient: PatientOut
    captures: list[CaptureDetailOut]


class PatientDetailOut(PatientOut):
    """Detalhe do paciente com as consultas embutidas.

    Evita um segundo request na tela de detalhe, mesmo motivo pelo qual o agregado da
    Fase 6 embute o paciente dentro da consulta.
    """

    encounters: list[EncounterOut]
