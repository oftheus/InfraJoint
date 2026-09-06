"""Os algoritmos disponíveis.

"Plugar" um algoritmo é escrever o arquivo ao lado deste e acrescentar uma linha numa
das listas abaixo. Não há descoberta automática e não há catálogo em banco: o primeiro
esconderia de quem lê quais algoritmos existem, e o segundo seria uma segunda fonte da
verdade capaz de divergir desta sem ninguém notar.

Duas listas, e não uma com um campo discriminador, porque os dois tipos têm entrada
diferente: `AnalysisAlgorithm` recebe as capturas de uma consulta, `CohortAlgorithm`
recebe linhas de vários pacientes. Quem despacha precisa saber qual dos dois vai chamar,
e a lista responde isso sem checagem de tipo em tempo de execução.

`COHORT` nasce vazia. Ela não é preparação especulativa: é o que torna verificável a
afirmação de que a arquitetura comporta os dois casos, porque o dia em que o primeiro
algoritmo de coorte for escrito, o que muda é esta linha e mais nada aqui.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.algorithms.thermal_asymmetry import thermal_asymmetry
from app.domain.algorithms import AnalysisAlgorithm, CohortAlgorithm

ANALYSIS: Sequence[AnalysisAlgorithm] = (thermal_asymmetry,)

COHORT: Sequence[CohortAlgorithm] = ()


def find_analysis(slug: str) -> AnalysisAlgorithm | None:
    return next((a for a in ANALYSIS if a.slug == slug), None)


# Não há `find_cohort` aqui, e a ausência é a mesma regra que manteve `COHORT` vazia:
# ela buscaria numa lista sem elementos, para um chamador que não existe. Ela nasce
# junto com o primeiro algoritmo de coorte, ao lado do ramo que a rota vai precisar.
