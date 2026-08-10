"""Fiação de dependências.

Um caminho só, e ele importa: token → uuid → conexão sob RLS → repositórios → casos
de uso. Como o FastAPI memoiza dependências por request, todos os repositórios
compartilham a mesma conexão — e portanto a mesma transação.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.application.use_cases.encounters import CreateEncounter, GetPatientDetail
from app.application.use_cases.patients import (
    CreatePatient,
    DeletePatient,
    ListPatients,
    UpdatePatient,
)
from app.domain.entities import AuthenticatedUser, UserRole
from app.domain.repositories import EncounterRepository, PatientRepository
from app.infrastructure.auth import InvalidTokenError, JwtVerifier
from app.infrastructure.database import Database
from app.infrastructure.repositories.encounters import PostgresEncounterRepository
from app.infrastructure.repositories.patients import PostgresPatientRepository

_bearer = HTTPBearer(auto_error=False)


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_verifier(request: Request) -> JwtVerifier:
    return request.app.state.jwt_verifier


async def get_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[JwtVerifier, Depends(get_verifier)],
) -> UUID:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="credenciais ausentes",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return await verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_connection(
    user_id: Annotated[UUID, Depends(get_user_id)],
    database: Annotated[Database, Depends(get_database)],
) -> AsyncIterator[asyncpg.Connection]:
    async with database.session(user_id) as connection:
        yield connection


async def get_current_user(
    user_id: Annotated[UUID, Depends(get_user_id)],
    connection: Annotated[asyncpg.Connection, Depends(get_connection)],
) -> AuthenticatedUser:
    """Lê o papel de public.users a cada request, nunca do token.

    A leitura passa pela policy `select_own_profile`, então só a própria linha é
    visível — não há como pedir o papel de outra pessoa por aqui.
    """
    role = await connection.fetchval("SELECT role FROM public.users WHERE id = $1", user_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="usuário sem perfil")
    return AuthenticatedUser(id=user_id, role=UserRole(role))


def get_patient_repository(
    connection: Annotated[asyncpg.Connection, Depends(get_connection)],
) -> PatientRepository:
    return PostgresPatientRepository(connection)


def get_encounter_repository(
    connection: Annotated[asyncpg.Connection, Depends(get_connection)],
) -> EncounterRepository:
    return PostgresEncounterRepository(connection)


PatientRepo = Annotated[PatientRepository, Depends(get_patient_repository)]
EncounterRepo = Annotated[EncounterRepository, Depends(get_encounter_repository)]
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


# Os casos de uso são dataclasses sem estado; construí-los aqui mantém os routers
# livres de saber quais repositórios cada um precisa.
def list_patients(repo: PatientRepo) -> ListPatients:
    return ListPatients(repo)


def create_patient(repo: PatientRepo) -> CreatePatient:
    return CreatePatient(repo)


def update_patient(repo: PatientRepo) -> UpdatePatient:
    return UpdatePatient(repo)


def delete_patient(repo: PatientRepo) -> DeletePatient:
    return DeletePatient(repo)


def get_patient_detail(patients: PatientRepo, encounters: EncounterRepo) -> GetPatientDetail:
    return GetPatientDetail(patients, encounters)


def create_encounter(patients: PatientRepo, encounters: EncounterRepo) -> CreateEncounter:
    return CreateEncounter(patients, encounters)
