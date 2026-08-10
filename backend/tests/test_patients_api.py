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


async def test_campo_desconhecido_vira_422(client: tuple[Any, dict]) -> None:
    http, acting = client
    acting["user_id"] = MEDICO_A

    response = await http.post(
        "/patients", json={"full_name": "API-TEST", "owner_id": str(MEDICO_B)}
    )
    assert response.status_code == 422, "tentar definir o dono não pode passar em silêncio"


async def test_sem_token_recebe_401() -> None:
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    app = create_app()  # sem override: o HTTPBearer real recusa
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            assert (await http.get("/patients")).status_code == 401
