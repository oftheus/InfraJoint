from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.application.use_cases.encounters import CreateEncounter, GetPatientDetail
from app.application.use_cases.patients import (
    CreatePatient,
    DeletePatient,
    ListPatients,
    UpdatePatient,
)
from app.domain.entities import NewEncounter, NewPatient
from app.presentation import deps
from app.presentation.schemas import (
    EncounterCreate,
    EncounterOut,
    PatientCreate,
    PatientDetailOut,
    PatientOut,
    PatientUpdate,
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
async def list_patients(
    use_case: Annotated[ListPatients, Depends(deps.list_patients)],
) -> list[PatientOut]:
    patients = await use_case.execute()
    return [PatientOut.from_entity(patient) for patient in patients]


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    user: deps.CurrentUser,
    use_case: Annotated[CreatePatient, Depends(deps.create_patient)],
) -> PatientOut:
    patient = await use_case.execute(user, NewPatient(**payload.model_dump()))
    return PatientOut.from_entity(patient)


@router.get("/{patient_id}", response_model=PatientDetailOut)
async def get_patient(
    patient_id: UUID,
    use_case: Annotated[GetPatientDetail, Depends(deps.get_patient_detail)],
) -> PatientDetailOut:
    detail = await use_case.execute(patient_id)
    return PatientDetailOut(
        **PatientOut.from_entity(detail.patient).model_dump(),
        encounters=[EncounterOut.from_entity(encounter) for encounter in detail.encounters],
    )


@router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    user: deps.CurrentUser,
    use_case: Annotated[UpdatePatient, Depends(deps.update_patient)],
) -> PatientOut:
    # exclude_unset distingue "não enviei o campo" de "enviei null para limpar".
    changes = payload.model_dump(exclude_unset=True)
    patient = await use_case.execute(user, patient_id, changes)
    return PatientOut.from_entity(patient)


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletes the patient and, by extension, their entire clinical history.",
)
async def delete_patient(
    patient_id: UUID,
    user: deps.CurrentUser,
    use_case: Annotated[DeletePatient, Depends(deps.delete_patient)],
) -> None:
    await use_case.execute(user, patient_id)


@router.post(
    "/{patient_id}/encounters",
    response_model=EncounterOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_encounter(
    patient_id: UUID,
    payload: EncounterCreate,
    user: deps.CurrentUser,
    use_case: Annotated[CreateEncounter, Depends(deps.create_encounter)],
) -> EncounterOut:
    encounter = await use_case.execute(user, patient_id, NewEncounter(**payload.model_dump()))
    return EncounterOut.from_entity(encounter)
