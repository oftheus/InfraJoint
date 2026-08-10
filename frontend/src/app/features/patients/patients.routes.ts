import { Routes } from '@angular/router';

export const patientsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/patients-page/patients-page').then((m) => m.PatientsPage),
  },
  {
    // O `:id` chega no `input.required<string>()` da página via withComponentInputBinding().
    path: ':id',
    loadComponent: () =>
      import('./pages/patient-detail-page/patient-detail-page').then((m) => m.PatientDetailPage),
  },
];
