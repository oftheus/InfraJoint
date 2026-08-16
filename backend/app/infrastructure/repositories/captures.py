from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.domain.entities import Capture, CaptureFile, FileKind

# Ordem fixa das colunas do INSERT. Nenhum nome vem do cliente — o schema Pydantic do
# router valida os campos, e esta lista é a única que o SQL conhece.
_INSERT_COLUMNS = (
    "capture_index",
    "phase",
    "label",
    "elapsed_seconds",
    "align_a",
    "align_b",
    "align_tx",
    "align_c",
    "align_d",
    "align_ty",
    "alignment_method",
    "agreement_normalized",
    "agreement",
    "fiducial_correction",
    "measurements",
    "files",
    "issue",
)

# Colunas jsonb: o asyncpg não converte dict/list sozinho, o SQL faz o cast.
_JSON_COLUMNS = frozenset({"agreement", "fiducial_correction", "measurements", "files"})


def _to_entity(row: asyncpg.Record) -> Capture:
    files = row["files"]
    return Capture(
        id=row["id"],
        encounter_id=row["encounter_id"],
        owner_id=row["owner_id"],
        capture_index=row["capture_index"],
        files=json.loads(files) if isinstance(files, str) else (files or {}),
    )


def _to_files(rows: Sequence[asyncpg.Record]) -> list[CaptureFile]:
    """Deriva uma chave de bucket por arquivo declarado das linhas de captura.

    As duas listagens — por paciente e por consulta — diferem só no recorte do
    WHERE; a expansão `files` → `CaptureFile` é a mesma, e é onde estaria o bug de
    apagar a chave errada.
    """
    arquivos: list[CaptureFile] = []
    for row in rows:
        declarados = row["files"]
        if isinstance(declarados, str):
            declarados = json.loads(declarados)
        for kind in declarados or {}:
            arquivos.append(
                CaptureFile(
                    owner_id=row["owner_id"],
                    encounter_id=row["encounter_id"],
                    capture_id=row["id"],
                    kind=FileKind(kind),
                )
            )
    return arquivos


class PostgresCaptureRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def create_many(
        self, encounter_id: UUID, captures: Sequence[Mapping[str, Any]]
    ) -> Sequence[Capture]:
        """Insere as N capturas numa instrução só.

        Um INSERT por captura custaria N idas ao banco — 21 numa sequência, e o
        Postgres está em outro continente. Aqui é uma ida, dentro da transação que a
        sessão sob RLS já abriu.

        `owner_id` não aparece: o trigger app.inherit_owner() o deriva da consulta,
        lendo-a sob a RLS de quem escreve. É essa leitura que impede anexar captura à
        consulta de outro médico.
        """
        if not captures:
            return []

        colunas = ", ".join(("encounter_id", *_INSERT_COLUMNS))
        valores: list[Any] = []
        linhas: list[str] = []
        for captura in captures:
            marcadores = [f"${len(valores) + 1}"]
            valores.append(encounter_id)
            for coluna in _INSERT_COLUMNS:
                bruto = captura.get(coluna)
                if coluna in _JSON_COLUMNS:
                    valores.append(None if bruto is None else json.dumps(bruto))
                    marcadores.append(f"${len(valores)}::jsonb")
                else:
                    valores.append(bruto)
                    marcadores.append(f"${len(valores)}")
            linhas.append(f"({', '.join(marcadores)})")

        rows = await self._connection.fetch(
            f"""
            INSERT INTO public.analysis_captures ({colunas})
            VALUES {", ".join(linhas)}
            RETURNING id, encounter_id, owner_id, capture_index, files
            """,
            *valores,
        )
        return [_to_entity(row) for row in rows]

    async def list_detail_for_encounter(self, encounter_id: UUID) -> Sequence[Mapping[str, Any]]:
        rows = await self._connection.fetch(
            f"""
            SELECT id, owner_id, {", ".join(_INSERT_COLUMNS)}
              FROM public.analysis_captures
             WHERE encounter_id = $1
             ORDER BY capture_index
            """,
            encounter_id,
        )
        capturas: list[Mapping[str, Any]] = []
        for row in rows:
            registro = dict(row)
            for coluna in _JSON_COLUMNS:
                bruto = registro.get(coluna)
                if isinstance(bruto, str):
                    registro[coluna] = json.loads(bruto)
            capturas.append(registro)
        return capturas

    async def list_files_for_patient(self, patient_id: UUID) -> Sequence[CaptureFile]:
        rows = await self._connection.fetch(
            """
            SELECT c.id, c.encounter_id, c.owner_id, c.files
              FROM public.analysis_captures c
              JOIN public.encounters e ON e.id = c.encounter_id
             WHERE e.patient_id = $1
            """,
            patient_id,
        )
        return _to_files(rows)

    async def list_files_for_encounter(self, encounter_id: UUID) -> Sequence[CaptureFile]:
        rows = await self._connection.fetch(
            """
            SELECT id, encounter_id, owner_id, files
              FROM public.analysis_captures
             WHERE encounter_id = $1
            """,
            encounter_id,
        )
        return _to_files(rows)

    async def list_for_encounter(self, encounter_id: UUID) -> Sequence[Capture]:
        rows = await self._connection.fetch(
            """
            SELECT id, encounter_id, owner_id, capture_index, files
              FROM public.analysis_captures
             WHERE encounter_id = $1
             ORDER BY capture_index
            """,
            encounter_id,
        )
        return [_to_entity(row) for row in rows]
