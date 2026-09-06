"""Os algoritmos contra o banco de verdade.

`test_algorithms.py` prova o cálculo com objetos literais. Este arquivo prova a outra
metade, que aquele não alcança: a consulta que monta a entrada. São coisas que só o
Postgres responde — o rótulo derivado do catálogo, a cobertura recalculada a partir de
`area` e `sample_count`, a ordem das capturas e o recorte da RLS.

Sem banco esta suíte é pulada, e é justamente aqui que "verde" sem banco não prova nada.
"""

from __future__ import annotations

from typing import Any

from app.application.algorithms.thermal_asymmetry import thermal_asymmetry
from tests.conftest import MEDICO_A, MEDICO_B

_NASCIMENTO = "1970-01-01"
_SLUG = thermal_asymmetry.slug


def _medicao(joint_id: str, t_mean: float, *, area: int = 1000, amostras: int = 900) -> dict:
    """Uma medição do payload.

    `area` e `sample_count` não são enfeite: a cobertura de pele deixou de ser coluna na
    migration `colunas_sem_uso`, e é a razão entre as duas que o algoritmo usa para
    descartar medição fraca. Se a consulta parar de recalculá-la, o descarte some.
    """
    return {
        "joint_id": joint_id,
        "t_mean": t_mean,
        "t_median": t_mean,
        "t_min": t_mean - 0.5,
        "t_max": t_mean + 0.5,
        "area": area,
        "sample_count": amostras,
        "shape": "circle",
        "rgb_x": 100.0,
        "rgb_y": 100.0,
        "csv_x": 50.0,
        "csv_y": 50.0,
        "rx_csv": 10.0,
        "ry_csv": 10.0,
        "edited": False,
    }


def _captura(indice: int | None, medicoes: list[dict]) -> dict[str, Any]:
    return {
        "capture_index": indice,
        "elapsed_seconds": None if indice is None else indice * 30.0,
        "align_a": 0.5,
        "align_b": 0.0,
        "align_tx": 3.0,
        "align_c": 0.0,
        "align_d": 0.5,
        "align_ty": 7.0,
        "alignment_method": "silhouette",
        "measurements": medicoes,
        "files": {
            "optical": {"size": 1000, "content_type": "image/jpeg"},
            "thermal": {"size": 1500, "content_type": "image/jpeg"},
            "matrix": {"size": 2000, "content_type": "text/csv"},
        },
    }


async def _consulta_com(http: Any, nome: str, capturas: list[dict]) -> str:
    paciente = await http.post("/patients", json={"full_name": nome, "birth_date": _NASCIMENTO})
    assert paciente.status_code == 201, paciente.text
    consulta = await http.post(f"/patients/{paciente.json()['id']}/encounters", json={})
    assert consulta.status_code == 201, consulta.text
    eid = consulta.json()["id"]

    gravado = await http.post(f"/encounters/{eid}/captures", json={"captures": capturas})
    assert gravado.status_code == 201, gravado.text
    return eid


async def test_lista_os_algoritmos_registrados(client: tuple) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    r = await http.get("/algorithms")
    assert r.status_code == 200, r.text

    por_slug = {a["slug"]: a for a in r.json()}
    assert _SLUG in por_slug
    assert por_slug[_SLUG]["scope"] == "analysis"
    # A lista é o registry: nenhum de coorte existe ainda, e a tela precisa poder
    # descobrir isso sem manter a própria lista.
    assert all(a["scope"] == "analysis" for a in r.json())


async def test_roda_sobre_a_consulta_e_pareia_os_dois_lados(client_com_storage: tuple) -> None:
    """O caminho inteiro: rota, consulta SQL, catálogo e cálculo."""
    http, acting, _ = client_com_storage
    acting["user_id"] = MEDICO_A

    eid = await _consulta_com(
        http,
        "API-TEST algoritmo",
        [
            _captura(
                None,
                [
                    _medicao("LEFT_MCP_3", 33.4),
                    _medicao("RIGHT_MCP_3", 32.0),
                    _medicao("LEFT_WRIST", 33.0),
                    _medicao("RIGHT_WRIST", 32.8),
                ],
            )
        ],
    )

    r = await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})
    assert r.status_code == 200, r.text
    corpo = r.json()

    assert corpo["status"] == "ok"
    # Do maior para o menor, e o lado no rótulo em vez do sinal.
    assert [round(v["value"], 1) for v in corpo["values"]] == [1.4, 0.2]
    assert corpo["values"][0]["unit"] == "°C"

    # As duas formas de rótulo do catálogo, sem o lado: "MCP 3 (mão direita)" perde o
    # parêntese e "Punho esquerdo" perde o adjetivo. É a derivação em SQL que não tinha
    # como ser verificada sem banco.
    rotulos = [v["label"] for v in corpo["values"]]
    assert rotulos[0].startswith("MCP 3 (")
    assert rotulos[1].startswith("Punho (")
    assert "esquerda mais quente" in rotulos[0]


async def test_cobertura_de_pele_vem_de_area_e_sample_count(client_com_storage: tuple) -> None:
    """A coluna não existe mais; o descarte depende da razão ser recalculada na leitura."""
    http, acting, _ = client_com_storage
    acting["user_id"] = MEDICO_A

    eid = await _consulta_com(
        http,
        "API-TEST cobertura",
        [
            _captura(
                None,
                [
                    # 200/1000 = 0,2, abaixo do corte de 0,4: o par cai.
                    _medicao("LEFT_MCP_3", 33.4, area=1000, amostras=200),
                    _medicao("RIGHT_MCP_3", 32.0),
                    _medicao("LEFT_WRIST", 33.0),
                    _medicao("RIGHT_WRIST", 32.8),
                ],
            )
        ],
    )

    corpo = (await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})).json()

    assert len(corpo["values"]) == 1, "a MCP 3 deveria ter sido descartada"
    assert "cobertura de pele abaixo de 40%" in corpo["summary"]


async def test_captura_sem_medicao_continua_na_sequencia(client_com_storage: tuple) -> None:
    """A basal sem medição não pode sumir da contagem nem ser usada como resultado.

    É o LEFT JOIN: se a captura vazia caísse fora, o resumo diria "a primeira captura"
    sobre a de índice 1 e esconderia o buraco na coleta.
    """
    http, acting, _ = client_com_storage
    acting["user_id"] = MEDICO_A

    eid = await _consulta_com(
        http,
        "API-TEST buraco",
        [
            _captura(0, []),
            _captura(1, [_medicao("LEFT_MCP_3", 33.4), _medicao("RIGHT_MCP_3", 32.0)]),
        ],
    )

    corpo = (await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})).json()

    assert corpo["status"] == "ok"
    assert "índice 1" in corpo["summary"]
    assert "das 2 carregadas" in corpo["summary"]
    assert "a anterior não tem" in corpo["summary"]


async def test_consulta_sem_analise_responde_dados_insuficientes(client: tuple) -> None:
    """Consulta visível e vazia é 200 com a explicação, não erro: é caso normal."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await http.post(
        "/patients", json={"full_name": "API-TEST vazia", "birth_date": _NASCIMENTO}
    )
    consulta = await http.post(f"/patients/{paciente.json()['id']}/encounters", json={})
    eid = consulta.json()["id"]

    r = await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "insufficient-data"


async def test_consulta_de_outro_medico_vira_404(client_com_storage: tuple) -> None:
    """O recorte é o mesmo do resto da API, e ele é da RLS.

    Sem o caso de uso resolver a consulta antes, a RLS devolveria zero medições e a
    resposta seria "dados insuficientes" — uma frase plausível sobre dado alheio, com
    200 no lugar de 404.
    """
    http, acting, _ = client_com_storage
    acting["user_id"] = MEDICO_A
    eid = await _consulta_com(
        http,
        "API-TEST alheia",
        [_captura(None, [_medicao("LEFT_MCP_3", 33.4), _medicao("RIGHT_MCP_3", 32.0)])],
    )

    acting["user_id"] = MEDICO_B
    r = await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})
    assert r.status_code == 404, r.text


async def test_slug_desconhecido_vira_404(client: tuple) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await http.post(
        "/patients", json={"full_name": "API-TEST slug", "birth_date": _NASCIMENTO}
    )
    consulta = await http.post(f"/patients/{paciente.json()['id']}/encounters", json={})

    r = await http.post("/algorithms/nao-existe/run", json={"encounter_id": consulta.json()["id"]})
    assert r.status_code == 404, r.text


async def test_listar_algoritmos_exige_token(_seeded: None) -> None:
    """Sem repositório na assinatura, a autenticação não chega de carona.

    As outras rotas herdam o 401 da cadeia repositório → conexão → token. `GET
    /algorithms` lê uma lista em memória e não pede repositório nenhum, então já
    respondeu 200 para quem não mandou token. A dependência explícita no router é o
    que conserta, e é isto que impede a regressão: um app SEM o override do conftest.
    """
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as http:
            assert (await http.get("/algorithms")).status_code == 401
            # A par de comparação: a rota vizinha, que herda o 401 pela cadeia.
            assert (await http.get("/diagnoses")).status_code == 401


async def test_medicao_com_area_e_sem_contagem_nao_derruba_a_rota(
    client_com_storage: tuple,
) -> None:
    """As duas colunas da cobertura são anuláveis, e uma sem a outra já deu 500.

    `area` e `sample_count` são opcionais em `CaptureMeasurementIn` porque uma ROI pode
    registrar a região sem produzir leitura. Com `area` preenchida e `sample_count`
    nulo, a divisão devolvia NULL e o `float()` da leitura estourava. Contagem ausente é
    cobertura zero, e cobertura zero é descarte — não erro de servidor.
    """
    http, acting, _ = client_com_storage
    acting["user_id"] = MEDICO_A

    sem_contagem = _medicao("LEFT_MCP_3", 33.4)
    sem_contagem["sample_count"] = None

    eid = await _consulta_com(
        http,
        "API-TEST sem contagem",
        [
            _captura(
                None,
                [
                    sem_contagem,
                    _medicao("RIGHT_MCP_3", 32.0),
                    _medicao("LEFT_WRIST", 33.0),
                    _medicao("RIGHT_WRIST", 32.8),
                ],
            )
        ],
    )

    r = await http.post(f"/algorithms/{_SLUG}/run", json={"encounter_id": eid})
    assert r.status_code == 200, r.text
    corpo = r.json()
    # O par sem contagem cai por cobertura; o outro continua sendo comparado.
    assert [v["label"].split(" (")[0] for v in corpo["values"]] == ["Punho"]
    assert "cobertura de pele abaixo de 40%" in corpo["summary"]
