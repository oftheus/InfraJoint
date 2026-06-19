import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import {
  LucideCamera,
  LucideChartNoAxesCombined,
  LucideFlame,
  LucideHouse,
  LucideLayers,
  LucideLogOut,
  LucideMenu,
  LucideSettings,
  LucideStethoscope,
  LucideTarget,
  LucideThermometer,
  LucideTimeline,
  LucideUserRound,
  LucideWind,
  LucideWorkflow,
  LucideX,
  provideLucideIcons,
} from '@lucide/angular';

import { appRoutes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

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
    // Eagerly instantiate AuthService so the session is resolved at startup.
    provideAppInitializer(() => {
      inject(AuthService);
    }),
    provideClientHydration(withEventReplay()),
    provideLucideIcons(
      LucideCamera,
      LucideChartNoAxesCombined,
      LucideFlame,
      LucideHouse,
      LucideLayers,
      LucideLogOut,
      LucideMenu,
      LucideSettings,
      LucideStethoscope,
      LucideTarget,
      LucideThermometer,
      LucideTimeline,
      LucideUserRound,
      LucideWind,
      LucideWorkflow,
      LucideX,
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
