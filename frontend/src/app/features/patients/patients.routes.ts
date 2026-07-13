import { Routes } from '@angular/router';

export const patientsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/patients-page/patients-page').then((m) => m.PatientsPage),
  },
];
