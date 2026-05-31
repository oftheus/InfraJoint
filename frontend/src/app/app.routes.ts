import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/presentation/pages/home-page/home-page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/presentation/pages/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
