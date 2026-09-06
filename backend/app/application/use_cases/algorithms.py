"""Executar um algoritmo sobre uma consulta."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.application.algorithms import registry
from app.domain.algorithms import AlgorithmResult
from app.domain.errors import NotFoundError
from app.domain.repositories import AlgorithmDataRepository, EncounterRepository


@dataclass(frozen=True, slots=True)
class RunAnalysisAlgorithm:
    """Acha o algoritmo, busca as medições da consulta e executa.

    Resolve a consulta ANTES de buscar as medições, e não por zelo: sem isso, uma
    consulta de outro dono devolveria zero medições pela RLS, o algoritmo responderia
    "dados insuficientes" e a tela diria que a consulta não tem análise. Seria uma
    mentira plausível sobre dado alheio. Resolvendo primeiro, sai 404, que é o que o
    resto da API responde para linha invisível.

    Slug desconhecido também é 404: quem pede um algoritmo que não existe está pedindo
    um recurso que não existe, e a lista de quais existem é pública em `GET /algorithms`.
    """

    encounters: EncounterRepository
    data: AlgorithmDataRepository

    async def execute(self, slug: str, encounter_id: UUID) -> AlgorithmResult:
        algorithm = registry.find_analysis(slug)
        if algorithm is None:
            raise NotFoundError("algoritmo não encontrado")

        encounter = await self.encounters.get(encounter_id)
        if encounter is None:
            raise NotFoundError("consulta não encontrada")

        capturas = await self.data.analysis_captures(encounter_id)
        # Sem guarda de "tem captura?" aqui: `run` é total por contrato, e devolve o
        # `insufficient-data` com a frase que explica o que faltou. Repetir a checagem
        # neste ponto criaria uma segunda mensagem para o mesmo caso.
        return algorithm.run(capturas)
