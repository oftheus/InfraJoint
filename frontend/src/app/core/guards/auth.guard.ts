import { CanMatchFn, Router } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { readAuthToken } from '../security/auth-token.storage';

export const authGuard: CanMatchFn = () => {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);
  const token = readAuthToken(platformId);

  return token ? true : router.createUrlTree(['/login']);
};
