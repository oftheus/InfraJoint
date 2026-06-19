import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protects routes that require an authenticated user.
 * Redirects to `/login` when there is no active session.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // These routes are client-rendered; allow SSR/prerender through and let the
  // guard make the real decision after hydration.
  if (!isBrowser) {
    return true;
  }

  // Wait for the initial session check so we never redirect prematurely while
  // auth state is still loading.
  await auth.ready;

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

/**
 * Guest-only routes (login / register). Authenticated users are sent to the
 * main authenticated area instead of seeing these screens.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  if (!isBrowser) {
    return true;
  }

  await auth.ready;

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
