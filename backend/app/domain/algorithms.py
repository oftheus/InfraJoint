"""Contratos dos algoritmos de pesquisa.

Um algoritmo recebe medições e devolve **dados**: uma frase e uma lista de números com
nome. Ele não formata nada — quem decide que 1.4 aparece como "1,4 °C" é a tela, uma vez
só, igual para todos. É o que faz plugar um algoritmo novo custar só a conta.

São dois tipos, com interfaces separadas, porque a entrada de cada um tem forma
diferente: um recebe as medições de UMA análise, o outro recebe linhas de VÁRIOS
pacientes. Não há interface comum acima deles, e a tentativa de criar uma foi o que
complicou o desenho antes de chegar aqui. O que eles compartilham é só o resultado, e é
o suficiente para a mesma tela desenhar os dois.

Este módulo não importa framework, banco nem HTTP: um algoritmo é função pura, e é isso
que permite testá-lo com objetos literais, sem banco e sem tela.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


class AlgorithmStatus(StrEnum):
    """`INSUFFICIENT_DATA` é resposta legítima, não erro.

    Sequência ruim é caso comum, e sem este campo a tela teria que interpretar o texto
    do resumo para saber se mostra um achado ou a justificativa de não haver achado.
    """

    OK = "ok"
    INSUFFICIENT_DATA = "insufficient-data"


@dataclass(frozen=True, slots=True)
class AlgorithmValue:
    """Uma linha do resultado: um número com nome, e a unidade quando houver."""

    label: str
    value: float
    # Ausente quando o número não tem unidade — uma contagem, uma proporção.
    unit: str | None = None


@dataclass(frozen=True, slots=True)
class AlgorithmResult:
    """O que todo algoritmo devolve, dos dois tipos.

    `values` vazio é caso normal: o achado pode não ser numérico, e aí a tela mostra só
    o resumo.
    """

    status: AlgorithmStatus
    summary: str
    values: Sequence[AlgorithmValue] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class JointMeasurement:
    """Uma articulação medida numa captura.

    `label` vem sem o lado ("MCP 3", e não "MCP 3 (mão direita)"), porque quem compara
    os dois lados precisa de um nome que sirva ao par. O lado viaja em `side`, onde é
    dado e não texto.

    `skin_coverage` não é coluna do banco: ela é `sample_count / area`, e a migration
    `colunas_sem_uso` a removeu justamente para não guardar derivado ao lado da origem.
    O repositório a recalcula na leitura.
    """

    joint_id: str
    label: str
    side: str
    # `None` quando a ROI não produziu leitura. Não é zero: 0 °C é temperatura possível,
    # e confundir "não medido" com "muito frio" é erro que não aparece.
    temperature: float | None
    skin_coverage: float


@dataclass(frozen=True, slots=True)
class AnalysisCapture:
    """Uma captura da análise, com o que foi medido nela.

    `measurements` vazio é informação, não ausência de dado: a captura existiu e nada
    foi medido nela. Descartá-la esconderia o buraco na sequência.
    """

    # `None` na análise avulsa, 0 na basal, N na dinâmica N — o mesmo que a coluna
    # `analysis_captures.capture_index` guarda.
    capture_index: int | None
    measurements: Sequence[JointMeasurement]

    @property
    def is_baseline(self) -> bool:
        return self.capture_index == 0


class AnalysisAlgorithm(Protocol):
    """Algoritmo que trabalha sobre uma análise.

    Recebe as capturas de uma consulta, ordenadas por tempo. Uma análise avulsa é uma
    sequência de uma captura só, e não um caso à parte.
    """

    slug: str
    title: str
    description: str

    def run(self, captures: Sequence[AnalysisCapture]) -> AlgorithmResult: ...


class CohortAlgorithm(Protocol):
    """Algoritmo que trabalha sobre vários pacientes.

    Declarado, sem implementação ainda. Ele existe aqui porque é o que documenta que a
    arquitetura comporta o caso: escrever o primeiro algoritmo de coorte é criar um
    arquivo que satisfaça este Protocol e acrescentá-lo ao registry, sem tocar em rota,
    tela ou contrato.

    A entrada é `Mapping` genérico de propósito. **Quais colunas a linha tem depende da
    pergunta de pesquisa**, e defini-las agora seria adivinhar: a primeira pergunta
    concreta é que vai decidir se a linha carrega escore, diagnóstico ou fase da
    captura. Quando ela existir, esta assinatura ganha um dataclass no lugar do Mapping,
    junto da consulta que o alimenta.
    """

    slug: str
    title: str
    description: str

    def run(self, rows: Sequence[Mapping[str, Any]]) -> AlgorithmResult: ...
