"""Leitura do que os algoritmos consomem.

Separado dos repositórios clínicos porque o recorte é outro: aqui não se escreve nada, e
o que sai é projeção para cálculo, não entidade de negócio. As colunas são as que os
algoritmos usam, e só elas.

A RLS continua sendo a fronteira: a conexão já roda com as claims do usuário, então um
algoritmo só alcança as consultas que aquela pessoa alcançaria pela tela. Não há função
`SECURITY DEFINER` e não há caminho de leitura privilegiado para pesquisa.
"""

from __future__ import annotations

from collections.abc import Sequence
from itertools import groupby
from uuid import UUID

import asyncpg

from app.domain.algorithms import AnalysisCapture, JointMeasurement

# O rótulo do catálogo, sem o lado.
#
# `joints.label` guarda "MCP 3 (mão direita)" e "Punho direito", que nomeiam UMA
# articulação. Quem compara os dois lados precisa nomear o PAR, e "MCP 3 (mão esquerda)
# (esquerda mais quente)" não é frase. A derivação fica aqui, ao lado do catálogo de
# onde ela sai, e não numa segunda tabela de rótulos no Python.
#
# O modo de falhar é seguro: `regexp_replace` devolve o texto intacto quando não casa,
# então um rótulo em formato novo aparece verboso, nunca errado.
_ROTULO_SEM_LADO = (
    r"regexp_replace(j.label, "
    r"'\s*\(mão (direita|esquerda)\)$|\s+(direito|direita|esquerdo|esquerda)$', '')"
)

# Cobertura de pele: quantas células da região tinham leitura válida.
#
# Não é coluna. A migration `colunas_sem_uso` a removeu porque era `sample_count / area`
# gravado ao lado das duas, e derivado guardado junto da origem diverge em silêncio no
# dia em que a forma de contar mudar. Volta a ser calculada na leitura, como o frontend
# já faz ao reconstruir a ROI. Área ausente ou zero vira 0: sem região não há cobertura,
# e o algoritmo que filtra por confiabilidade deve descartar, não confiar por omissão.
#
# **Os dois `COALESCE` são obrigatórios, e o do numerador não é simetria.** As duas
# colunas são anuláveis no banco e opcionais em `CaptureMeasurementIn`, porque uma ROI
# pode registrar a região sem produzir leitura. Com `area` preenchida e `sample_count`
# nulo, a divisão devolvia NULL, o `float()` da leitura estourava e a rota respondia
# 500. Contagem ausente é zero célula aproveitada, que é cobertura zero — o mesmo
# default que o frontend aplicava.
_COBERTURA = """
    CASE WHEN COALESCE(m.area, 0) > 0
         THEN COALESCE(m.sample_count, 0)::numeric / m.area
         ELSE 0
    END AS skin_coverage"""


class PostgresAlgorithmDataRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def analysis_captures(self, encounter_id: UUID) -> Sequence[AnalysisCapture]:
        """As capturas da consulta, com as medições de cada uma.

        A ordem reproduz a que o frontend usava: por tempo decorrido, com as capturas
        sem tempo ao final. Importa porque o algoritmo de assimetria relata sobre a
        primeira captura com medição, e "primeira" precisa significar a mesma coisa aqui
        e na tela.

        Uma captura sem medição nenhuma continua vindo, com a lista vazia. Descartá-la
        esconderia o buraco na sequência, que é informação sobre a coleta.
        """
        rows = await self._connection.fetch(
            f"""
            SELECT c.id AS capture_id,
                   c.capture_index,
                   m.joint_id,
                   j.side,
                   {_ROTULO_SEM_LADO} AS label,
                   m.t_mean,
                   {_COBERTURA}
              FROM public.analysis_captures c
              LEFT JOIN public.capture_measurements m ON m.capture_id = c.id
              LEFT JOIN public.joints j ON j.id = m.joint_id
             WHERE c.encounter_id = $1
             ORDER BY c.elapsed_seconds NULLS LAST,
                      c.capture_index NULLS FIRST,
                      c.id,
                      m.joint_id
            """,
            encounter_id,
        )

        capturas: list[AnalysisCapture] = []
        # `groupby` exige a entrada já ordenada pela chave, e ela está: `c.id` entra no
        # ORDER BY antes de `joint_id` justamente para as linhas de uma captura ficarem
        # contíguas. Agrupar pelo id, e não pelo índice, porque o índice é nulo na
        # análise avulsa e nulo não é chave.
        for _, linhas in groupby(rows, key=lambda row: row["capture_id"]):
            linhas = list(linhas)
            capturas.append(
                AnalysisCapture(
                    capture_index=linhas[0]["capture_index"],
                    measurements=[
                        JointMeasurement(
                            joint_id=linha["joint_id"],
                            label=linha["label"],
                            side=linha["side"],
                            # `numeric` chega como Decimal; os algoritmos fazem conta com
                            # float, e misturar os dois levanta TypeError na subtração.
                            temperature=(
                                None if linha["t_mean"] is None else float(linha["t_mean"])
                            ),
                            skin_coverage=float(linha["skin_coverage"]),
                        )
                        # O LEFT JOIN produz uma linha de nulos para a captura sem
                        # medição: é ela que faz a captura existir com a lista vazia.
                        for linha in linhas
                        if linha["joint_id"] is not None
                    ],
                )
            )
        return capturas
