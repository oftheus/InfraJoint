import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guard';

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.homeRoutes),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.registerRoutes),
  },
  {
    // Authenticated area: shares the sidebar layout shell.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/auth-shell/auth-shell').then((m) => m.AuthShell),
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
      },
      {
        path: 'pacientes',
        loadChildren: () =>
          import('./features/patients/patients.routes').then((m) => m.patientsRoutes),
      },
      {
        path: 'analise',
        loadChildren: () =>
          import('./features/analysis/analysis.routes').then((m) => m.analysisRoutes),
      },
      {
        path: 'pesquisa',
        loadChildren: () =>
          import('./features/research/research.routes').then((m) => m.researchRoutes),
      },
      {
        path: 'administracao',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadChildren: () =>
          import('./features/administration/administration.routes').then(
            (m) => m.administrationRoutes,
          ),
      },
      {
        path: 'perfil',
        loadChildren: () =>
          import('./features/profile/profile.routes').then((m) => m.profileRoutes),
      },
    ],
  },
  {
    path: '**', // redirect any unknown URL to the home page.
    redirectTo: '',
  },
];
