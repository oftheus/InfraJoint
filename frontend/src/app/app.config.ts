import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  LucideCamera,
  LucideChartNoAxesCombined,
  LucideFlame,
  LucideLayers,
  LucideSettings,
  LucideStethoscope,
  LucideTarget,
  LucideThermometer,
  LucideTimeline,
  LucideUserRound,
  LucideWind,
  LucideWorkflow,
  provideLucideIcons,
} from '@lucide/angular';

import { appRoutes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { authTokenInterceptor } from './core/interceptors/auth-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
    provideAnimations(),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideLucideIcons(
      LucideCamera,
      LucideChartNoAxesCombined,
      LucideFlame,
      LucideLayers,
      LucideSettings,
      LucideStethoscope,
      LucideTarget,
      LucideThermometer,
      LucideTimeline,
      LucideUserRound,
      LucideWind,
      LucideWorkflow,
    ),
  ],
};
