import { Routes } from '@angular/router';
import { LoginPage } from './presentation/pages/login-page/login-page';

export const authRoutes: Routes = [
  {
    path: '',
    component: LoginPage,
  },
];
