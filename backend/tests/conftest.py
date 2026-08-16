"""Fixtures dos testes de integração.

Só a verificação do JWT é substituída — assinar tokens de verdade exigiria as chaves
do Supabase e testaria o PyJWT, não o InfraJoint. Todo o resto é real: pool asyncpg,
`SET LOCAL ROLE`, claims, policies e SQL. É esse recorte que faz o teste de 404
cross-tenant valer como prova.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from uuid import UUID

import pytest

LOCAL_APP_DSN = "postgresql://app_api:postgres@127.0.0.1:54322/postgres"
LOCAL_ADMIN_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

os.environ.setdefault("DATABASE_URL", os.getenv("TEST_DATABASE_URL", LOCAL_APP_DSN))
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_JWKS_URL", "https://test.supabase.co/auth/v1/.well-known/jwks.json")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:4200")

MEDICO_A = UUID("aaaaaaaa-1111-0000-0000-00000000000a")
MEDICO_B = UUID("bbbbbbbb-1111-0000-0000-00000000000b")
LEITOR = UUID("cccccccc-1111-0000-0000-00000000000c")
ADMIN = UUID("dddddddd-1111-0000-0000-00000000000d")

_SEED = [
    (MEDICO_A, "api-a@local", "medico"),
    (MEDICO_B, "api-b@local", "medico"),
    (LEITOR, "api-l@local", "user"),
    (ADMIN, "api-x@local", "admin"),
]


@pytest.fixture(scope="session")
async def _seeded() -> None:
    asyncpg = pytest.importorskip("asyncpg")
    try:
        connection = await asyncpg.connect(LOCAL_ADMIN_DSN, timeout=5)
    except Exception:
        pytest.skip("banco local indisponível — rode `supabase start`")

    try:
        await connection.execute("DELETE FROM public.patients WHERE full_name LIKE 'API-TEST%'")
        for user_id, email, role in _SEED:
            await connection.execute(
                """
                INSERT INTO auth.users (id, instance_id, aud, role, email)
                VALUES ($1, '00000000-0000-0000-0000-000000000000',
                        'authenticated', 'authenticated', $2)
                ON CONFLICT (id) DO NOTHING
                """,
                user_id,
                email,
            )
            await connection.execute(
                "UPDATE public.users SET role = $2::public.user_role WHERE id = $1",
                user_id,
                role,
            )
    finally:
        await connection.close()


@pytest.fixture
async def client(_seeded: None) -> AsyncIterator[tuple[object, dict[str, UUID]]]:
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app
    from app.presentation import deps

    app = create_app()
    acting_as: dict[str, UUID] = {"user_id": MEDICO_A}

    async def _fake_user_id() -> UUID:
        return acting_as["user_id"]

    app.dependency_overrides[deps.get_user_id] = _fake_user_id

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            yield http, acting_as


@pytest.fixture
async def client_com_storage(
    _seeded: None,
) -> AsyncIterator[tuple[object, dict[str, UUID], object]]:
    """Como `client`, mas com o R2 substituído por um duplo.

    Assinar de verdade exigiria credencial de bucket e testaria o boto3. O que
    interessa provar aqui é o SQL, os triggers e as policies — e esses são reais.
    """
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app
    from app.presentation import deps
    from tests.test_captures_api import FakeStorage

    app = create_app()
    acting: dict[str, UUID] = {"user_id": MEDICO_A}
    storage = FakeStorage()

    async def _fake_user_id() -> UUID:
        return acting["user_id"]

    app.dependency_overrides[deps.get_user_id] = _fake_user_id
    app.dependency_overrides[deps.get_storage] = lambda: storage
    # A rota de exclusão usa a variante opcional; sem substituí-la também, a
    # limpeza do bucket seria pulada e o teste passaria por engano.
    app.dependency_overrides[deps.get_storage_optional] = lambda: storage

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            yield http, acting, storage


@pytest.fixture(autouse=True)
async def _cleanup() -> AsyncIterator[None]:
    yield
    asyncpg = pytest.importorskip("asyncpg")
    try:
        connection = await asyncpg.connect(LOCAL_ADMIN_DSN, timeout=5)
    except Exception:
        return
    try:
        await connection.execute("DELETE FROM public.patients WHERE full_name LIKE 'API-TEST%'")
    finally:
        await connection.close()
