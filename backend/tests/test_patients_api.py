"""Integração: Angular → JWT → FastAPI → RLS, com o banco local de verdade.

O teste que importa é `test_medico_b_recebe_404_no_paciente_de_a`. Ele é o critério de
aceite da Fase 3 do plano, e é o único capaz de detectar o Risco nº 1: se a API
conectasse com privilégio que ignora a RLS, tudo o mais continuaria passando.
"""

from __future__ import annotations

from typing import Any

from tests.conftest import ADMIN, LEITOR, MEDICO_A, MEDICO_B


async def _criar_paciente(http: Any, nome: str) -> dict[str, Any]:
    response = await http.post("/patients", json={"full_name": nome})
    assert response.status_code == 201, response.text
    return response.json()


async def _nomes_de_teste(http: Any) -> list[str]:
    """Nomes dos pacientes criados por estes testes, em ordem alfabética.

    Filtrar pelo prefixo é o que mantém a suíte verde contra um banco local que você
    também usa à mão — asserção sobre o total quebraria a cada paciente cadastrado
    pelo navegador.
    """
    listagem = await http.get("/patients")
    assert listagem.status_code == 200
    return sorted(p["full_name"] for p in listagem.json() if p["full_name"].startswith("API-TEST"))


async def test_health_nao_exige_token(client: tuple[Any, dict]) -> None:
    http, _ = client
    response = await http.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_medico_cria_e_lista_o_proprio_paciente(client: tuple[Any, dict]) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    criado = await _criar_paciente(http, "API-TEST Ana")
    assert "owner_id" not in criado, "owner_id é detalhe de tenancy, não vai para o cliente"

    assert await _nomes_de_teste(http) == ["API-TEST Ana"]


async def test_medico_b_recebe_404_no_paciente_de_a(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST Paciente de A")

    acting["user_id"] = MEDICO_B
    detalhe = await http.get(f"/patients/{paciente['id']}")
    assert detalhe.status_code == 404, "linha invisível tem que sumir, não ser recusada"

    assert await _nomes_de_teste(http) == []


async def test_medico_b_nao_edita_paciente_de_a(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST Paciente de A")

    acting["user_id"] = MEDICO_B
    response = await http.patch(f"/patients/{paciente['id']}", json={"phone": "11999999999"})
    assert response.status_code == 404


async def test_medico_b_nao_cria_consulta_no_paciente_de_a(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST Paciente de A")

    acting["user_id"] = MEDICO_B
    response = await http.post(f"/patients/{paciente['id']}/encounters", json={"reason": "invasão"})
    assert response.status_code == 404


async def test_medico_exclui_o_proprio_paciente_e_a_consulta_vai_junto(
    client: tuple[Any, dict],
) -> None:
    """Prova a cascata: apagar o paciente destrói o histórico clínico dele."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST com histórico")
    criada = await http.post(f"/patients/{paciente['id']}/encounters", json={"reason": "consulta"})
    assert criada.status_code == 201
    encounter_id = criada.json()["id"]

    assert (await http.delete(f"/patients/{paciente['id']}")).status_code == 204
    assert (await http.get(f"/patients/{paciente['id']}")).status_code == 404

    # A consulta some com o paciente — verificado no banco, fora da API.
    import asyncpg

    from tests.conftest import LOCAL_ADMIN_DSN

    connection = await asyncpg.connect(LOCAL_ADMIN_DSN)
    try:
        restantes = await connection.fetchval(
            "SELECT count(*) FROM public.encounters WHERE id = $1", encounter_id
        )
    finally:
        await connection.close()
    assert restantes == 0, "o ON DELETE CASCADE não levou a consulta junto"


async def test_medico_b_nao_exclui_paciente_de_a(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST Paciente de A")

    acting["user_id"] = MEDICO_B
    assert (await http.delete(f"/patients/{paciente['id']}")).status_code == 404

    # E continua existindo para o dono.
    acting["user_id"] = MEDICO_A
    assert (await http.get(f"/patients/{paciente['id']}")).status_code == 200


async def test_leitor_recebe_403_ao_excluir(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST Paciente de A")

    acting["user_id"] = LEITOR
    assert (await http.delete(f"/patients/{paciente['id']}")).status_code == 403


async def test_leitor_recebe_403_ao_criar_paciente(client: tuple[Any, dict]) -> None:
    http, acting = client
    acting["user_id"] = LEITOR

    response = await http.post("/patients", json={"full_name": "API-TEST do leitor"})
    assert response.status_code == 403


async def test_admin_enxerga_pacientes_dos_dois_medicos(client: tuple[Any, dict]) -> None:
    http, acting = client

    acting["user_id"] = MEDICO_A
    await _criar_paciente(http, "API-TEST de A")
    acting["user_id"] = MEDICO_B
    await _criar_paciente(http, "API-TEST de B")

    acting["user_id"] = ADMIN
    assert await _nomes_de_teste(http) == ["API-TEST de A", "API-TEST de B"]


async def test_consulta_criada_aparece_no_detalhe_do_paciente(client: tuple[Any, dict]) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST com consulta")
    criada = await http.post(
        f"/patients/{paciente['id']}/encounters", json={"reason": "dor articular"}
    )
    assert criada.status_code == 201

    detalhe = await http.get(f"/patients/{paciente['id']}")
    assert detalhe.status_code == 200
    assert [e["reason"] for e in detalhe.json()["encounters"]] == ["dor articular"]


async def test_apagar_o_nome_vira_422_e_nao_500(client: tuple[Any, dict]) -> None:
    """`full_name` é `not null`: o erro é do cliente, não do servidor."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST Ana")
    response = await http.patch(f"/patients/{paciente['id']}", json={"full_name": None})
    assert response.status_code == 422, response.text

    # E o nome continua lá.
    detalhe = await http.get(f"/patients/{paciente['id']}")
    assert detalhe.json()["full_name"] == "API-TEST Ana"


async def test_limpar_campo_opcional_continua_valendo(client: tuple[Any, dict]) -> None:
    """O contrapeso do teste acima: `null` nos campos nulos ainda limpa o campo."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    criado = await http.post("/patients", json={"full_name": "API-TEST Ana", "phone": "11999"})
    assert criado.status_code == 201
    paciente = criado.json()
    assert paciente["phone"] == "11999"

    response = await http.patch(f"/patients/{paciente['id']}", json={"phone": None})
    assert response.status_code == 200, response.text
    assert response.json()["phone"] is None


async def test_erro_inesperado_responde_500_com_cabecalho_de_cors(_seeded: None) -> None:
    """Sem os cabeçalhos, o browser mostra erro de CORS no lugar do erro real.

    O handler de 500 tem que ficar DENTRO do CORSMiddleware. Como `add_middleware`
    insere na posição 0, isso depende da ordem de registro em `create_app()` — este
    teste é o que impede a ordem de ser invertida sem querer.
    """
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app
    from app.presentation import deps

    origem = "http://localhost:4200"
    app = create_app()
    app.dependency_overrides[deps.get_user_id] = lambda: MEDICO_A

    async with app.router.lifespan_context(app):
        # Banco fora do ar depois de a aplicação ter subido: erro de infraestrutura
        # genuíno, do tipo que o handler existe para cobrir.
        await app.state.database.disconnect()

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            response = await http.get("/patients", headers={"Origin": origem})

    assert response.status_code == 500
    assert response.json() == {"detail": "erro interno"}, "a mensagem interna não pode vazar"
    assert response.headers.get("access-control-allow-origin") == origem


# --- Fase 4: body map persistido ---------------------------------------------------
#
# O fluxo de Análise Térmica grava tudo ao finalizar: a consulta nasce já com o body
# map e os escores, numa chamada só. Não existe passo intermediário no banco, então
# abandonar o fluxo no meio não deixa consulta vazia no histórico.

_ARTICULACOES = {
    "RIGHT_KNEE": {"pain": True, "swelling": True},
    "LEFT_KNEE": {"pain": False, "swelling": False},
    "RIGHT_MCP_3": {"pain": True, "swelling": False},
}
_CDAI = {
    "score": 12.5,
    "level": "moderate",
    "tender_count": 2,
    "swollen_count": 1,
    "patient_global": 5.0,
    "evaluator_global": 4.5,
}
_DAS28 = {
    "score": 4.21,
    "level": "moderate",
    "tender_count": 2,
    "swollen_count": 1,
    "acute_phase": "esr",
    "acute_value": 25.0,
    "patient_global_health": 40.0,
}


async def test_consulta_grava_body_map_e_escores_numa_chamada(client: tuple[Any, dict]) -> None:
    """Critério de aceite: avaliar → salvar → recarregar → dados idênticos."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST body map")
    criada = await http.post(
        f"/patients/{paciente['id']}/encounters",
        json={
            "reason": "avaliação de atividade",
            "joint_evaluations": _ARTICULACOES,
            "scores": {"CDAI": _CDAI, "DAS28": _DAS28},
        },
    )
    assert criada.status_code == 201, criada.text

    # Recarregar pelo detalhe do paciente devolve exatamente o que foi gravado.
    detalhe = await http.get(f"/patients/{paciente['id']}")
    (consulta,) = detalhe.json()["encounters"]

    assert consulta["joint_evaluations"] == _ARTICULACOES
    # Casing normalizado na fronteira: o frontend manda 'CDAI', o banco guarda 'cdai'.
    assert set(consulta["scores"]) == {"cdai", "das28"}
    assert consulta["scores"]["cdai"] == _CDAI
    assert consulta["scores"]["das28"] == _DAS28


async def test_consulta_sem_body_map_continua_valendo(client: tuple[Any, dict]) -> None:
    """As duas etapas do fluxo são opcionais — cabe consulta sem body map."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST sem body map")
    criada = await http.post(f"/patients/{paciente['id']}/encounters", json={"reason": "retorno"})
    assert criada.status_code == 201, criada.text

    consulta = criada.json()
    assert consulta["joint_evaluations"] is None
    assert consulta["scores"] == {}, "o default do banco é objeto vazio, não null"


async def test_body_map_sem_escore_fechado(client: tuple[Any, dict]) -> None:
    """O DAS28 exige VHS/PCR; sem isso o body map ainda precisa poder ser salvo."""
    http, acting = client
    acting["user_id"] = MEDICO_A

    paciente = await _criar_paciente(http, "API-TEST só articulações")
    criada = await http.post(
        f"/patients/{paciente['id']}/encounters",
        json={"joint_evaluations": _ARTICULACOES},
    )
    assert criada.status_code == 201, criada.text
    assert criada.json()["joint_evaluations"] == _ARTICULACOES
    assert criada.json()["scores"] == {}


async def test_escore_invalido_vira_422(client: tuple[Any, dict]) -> None:
    """Escore fora de faixa é erro do cliente — não pode virar dado clínico gravado."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST validação")
    rota = f"/patients/{paciente['id']}/encounters"

    casos = {
        "tipo desconhecido": {"scores": {"SDAI": _CDAI}},
        "cdai acima da faixa": {"scores": {"CDAI": {**_CDAI, "score": 999}}},
        "contagem acima de 28": {"scores": {"CDAI": {**_CDAI, "tender_count": 29}}},
        "faixa de atividade inválida": {"scores": {"CDAI": {**_CDAI, "level": "altíssima"}}},
        "campo extra no escore": {"scores": {"CDAI": {**_CDAI, "chute": 1}}},
        "reagente inválido": {"scores": {"DAS28": {**_DAS28, "acute_phase": "vhs"}}},
        "id de articulação inválido": {"joint_evaluations": {"joelho direito": {"pain": True}}},
        "achado incompleto": {"joint_evaluations": {"RIGHT_KNEE": {"pain": True}}},
    }
    for rotulo, payload in casos.items():
        resposta = await http.post(rota, json=payload)
        assert resposta.status_code == 422, f"{rotulo}: {resposta.status_code} {resposta.text[:90]}"


async def test_medico_b_nao_le_body_map_de_a(client: tuple[Any, dict]) -> None:
    """A RLS vale para o dado clínico novo como vale para o resto."""
    http, acting = client

    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST body map de A")
    await http.post(
        f"/patients/{paciente['id']}/encounters",
        json={"joint_evaluations": _ARTICULACOES, "scores": {"CDAI": _CDAI}},
    )

    acting["user_id"] = MEDICO_B
    assert (await http.get(f"/patients/{paciente['id']}")).status_code == 404


async def test_homonimo_recusa_com_a_lista_e_passa_na_confirmacao(
    client: tuple[Any, dict],
) -> None:
    """Avisar antes é o ponto: o médico quase sempre queria abrir quem já existe."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    existente = await _criar_paciente(http, "API-TEST Ana Souza")

    # Acento, caixa e espaço não fazem pessoa nova — é o cadastro duplicado que mais
    # acontece, alguém redigitando quem já está lá.
    conflito = await http.post("/patients", json={"full_name": "  api-test  aná   sóuza "})
    assert conflito.status_code == 409, conflito.text
    assert [p["id"] for p in conflito.json()["duplicates"]] == [existente["id"]]

    # Confirmado, com data de nascimento diferente: é outra pessoa, e entra.
    confirmado = await http.post(
        "/patients?allow_duplicate=true",
        json={"full_name": "API-TEST Ana Souza", "birth_date": "1980-03-12"},
    )
    assert confirmado.status_code == 201, confirmado.text


async def test_mesmo_nome_e_mesma_data_o_banco_recusa(client: tuple[Any, dict]) -> None:
    """O limite do 'cadastrar assim mesmo': nem o médico distinguiria os dois depois."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    corpo = {"full_name": "API-TEST Ana Souza", "birth_date": "1980-03-12"}
    assert (await http.post("/patients", json=corpo)).status_code == 201

    negado = await http.post("/patients?allow_duplicate=true", json=corpo)
    assert negado.status_code == 409, negado.text
    assert "data de nascimento" in negado.json()["detail"]


async def test_dois_sem_data_de_nascimento_tambem_colidem(client: tuple[Any, dict]) -> None:
    """NULLS NOT DISTINCT: 'sem data' colide com 'sem data'.

    Sem isso o índice deixaria passar justamente o par que ninguém consegue separar.
    """
    http, acting = client
    acting["user_id"] = MEDICO_A
    await _criar_paciente(http, "API-TEST Sem Data")

    negado = await http.post(
        "/patients?allow_duplicate=true", json={"full_name": "API-TEST Sem Data"}
    )
    assert negado.status_code == 409, negado.text


async def test_homonimo_de_outro_medico_nao_atrapalha_nem_aparece(
    client: tuple[Any, dict],
) -> None:
    """A unicidade é por dono — global, ela vazaria existência através da RLS."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    await _criar_paciente(http, "API-TEST Homônima")

    acting["user_id"] = MEDICO_B
    criado = await http.post("/patients", json={"full_name": "API-TEST Homônima"})
    assert criado.status_code == 201, "o paciente do outro médico não pode barrar este"


async def test_editar_para_o_nome_de_outro_paciente_vira_409(client: tuple[Any, dict]) -> None:
    """A duplicata também chega pela edição, e o PATCH não pode responder 500."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    primeiro = await _criar_paciente(http, "API-TEST Primeira")
    segunda = await _criar_paciente(http, "API-TEST Segunda")

    resposta = await http.patch(
        f"/patients/{segunda['id']}", json={"full_name": primeiro["full_name"]}
    )
    assert resposta.status_code == 409, resposta.text


async def test_admin_ve_mas_nao_registra_consulta_no_paciente_de_outro(
    client: tuple[Any, dict],
) -> None:
    """O admin perde a autoria, não a supervisão."""
    http, acting = client
    acting["user_id"] = MEDICO_A
    paciente = await _criar_paciente(http, "API-TEST paciente de A")

    acting["user_id"] = ADMIN
    assert (await http.get(f"/patients/{paciente['id']}")).status_code == 200, "leitura continua"

    negado = await http.post(f"/patients/{paciente['id']}/encounters", json={"reason": "auditoria"})
    assert negado.status_code == 403, negado.text

    # E nada foi gravado: o dono continua sem consulta nenhuma.
    acting["user_id"] = MEDICO_A
    assert (await http.get(f"/patients/{paciente['id']}")).json()["encounters"] == []


async def test_campo_desconhecido_vira_422(client: tuple[Any, dict]) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    response = await http.post(
        "/patients", json={"full_name": "API-TEST", "owner_id": str(MEDICO_B)}
    )
    assert response.status_code == 422, "tentar definir o dono não pode passar em silêncio"


async def test_sem_token_recebe_401(_seeded: None) -> None:
    # Depende de `_seeded` só pelo skip que ele carrega: este teste sobe o lifespan de
    # verdade, então sem banco ele falharia em vez de ser pulado como os outros.
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    app = create_app()  # sem override: o HTTPBearer real recusa
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            assert (await http.get("/patients")).status_code == 401
