import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  Encounter,
  EncounterCreate,
  Patient,
  PatientCreate,
  PatientDetail,
  PatientUpdate,
} from './patient.model';

/** Único ponto do frontend que conhece as rotas da API clínica. */
@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/patients`;

  list(): Observable<Patient[]> {
    return this.http.get<Patient[]>(this.baseUrl);
  }

  get(patientId: string): Observable<PatientDetail> {
    return this.http.get<PatientDetail>(`${this.baseUrl}/${patientId}`);
  }

  create(payload: PatientCreate): Observable<Patient> {
    return this.http.post<Patient>(this.baseUrl, payload);
  }

  update(patientId: string, changes: PatientUpdate): Observable<Patient> {
    return this.http.patch<Patient>(`${this.baseUrl}/${patientId}`, changes);
  }

  /** Apaga o paciente e, em cascata, todas as consultas e análises dele. */
  delete(patientId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${patientId}`);
  }

  createEncounter(patientId: string, payload: EncounterCreate): Observable<Encounter> {
    return this.http.post<Encounter>(`${this.baseUrl}/${patientId}/encounters`, payload);
  }
}
