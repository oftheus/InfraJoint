from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ENV_FILE escolhe o ambiente sem editar arquivo nenhum:
    #   ENV_FILE=.env.local  → Supabase e Postgres do Docker  (desenvolvimento)
    #   (padrão .env)        → projeto hospedado              (verificação)
    model_config = SettingsConfigDict(env_file=os.getenv("ENV_FILE", ".env"), extra="ignore")

    database_url: str
    supabase_url: str
    supabase_jwks_url: str
    cors_origins: str = "http://localhost:4200"

    db_pool_min_size: int = 1
    db_pool_max_size: int = 10

    jwt_audience: str = "authenticated"

    # /docs e /openapi.json publicam o mapa da API — rotas, campos e enums de dado
    # clínico. Útil no desenvolvimento, reconhecimento gratuito em produção.
    docs_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if "*" in origins:
            # O frontend tem origem conhecida, então o curinga nunca é a resposta certa
            # aqui — é o atalho de quem está tentando destravar um preflight. Recusar no
            # boot custa um deploy vermelho; aceitar custa a API aberta para qualquer site.
            raise ValueError("CORS_ORIGINS não aceita '*'; liste as origens explicitamente")
        return origins

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # valores vêm do ambiente
