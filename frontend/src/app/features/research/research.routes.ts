import { Routes } from '@angular/router';

/**
 * "Pesquisa" section routes. Add new research modules here as their own child
 * route under the sidebar's Pesquisa menu.
 */
export const researchRoutes: Routes = [
  { path: '', redirectTo: 'algoritmos', pathMatch: 'full' },
  {
    path: 'algoritmos',
    loadComponent: () =>
      import('./pages/algorithms-page/algorithms-page').then((m) => m.AlgorithmsPage),
  },
];
