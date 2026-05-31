import { isPlatformBrowser } from '@angular/common';

export const AUTH_TOKEN_STORAGE_KEY = 'infrajoint.auth.token';

export const readAuthToken = (platformId: object): string | null => {
  if (!isPlatformBrowser(platformId)) {
    return null;
  }

  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};
