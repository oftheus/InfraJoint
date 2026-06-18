import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.homeRoutes),
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'register',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.registerRoutes),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
