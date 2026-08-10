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

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # valores vêm do ambiente
