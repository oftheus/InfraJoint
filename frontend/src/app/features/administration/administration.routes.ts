import { Routes } from '@angular/router';

/**
 * "Administração" section routes. Admin-only area surfaced in the sidebar only
 * for users with the `admin` role. Add new admin modules here as child routes.
 */
export const administrationRoutes: Routes = [
  { path: '', redirectTo: 'usuarios', pathMatch: 'full' },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./pages/users-page/users-page').then((m) => m.UsersPage),
  },
  {
    path: 'dataset',
    loadComponent: () =>
      import('./pages/dataset-page/dataset-page').then((m) => m.DatasetPage),
  },
  {
    // Reuses the existing Settings screen, now reachable as Administração > Configurações.
    path: 'configuracoes',
    loadChildren: () =>
      import('../settings/settings.routes').then((m) => m.settingsRoutes),
  },
];
