import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  LucideCamera,
  LucideChartNoAxesCombined,
  LucideChevronDown,
  LucideFlame,
  LucideHouse,
  LucideLayers,
  LucideLogOut,
  LucideArrowLeft,
  LucideMenu,
  LucidePersonStanding,
  LucideSettings,
  LucideShield,
  LucideStethoscope,
  LucideTarget,
  LucideThermometer,
  LucideTimeline,
  LucideTrash2,
  LucideUserRound,
  LucideUsersRound,
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
      LucideChevronDown,
      LucideFlame,
      LucideHouse,
      LucideLayers,
      LucideLogOut,
      LucideArrowLeft,
      LucideMenu,
      LucidePersonStanding,
      LucideSettings,
      LucideShield,
      LucideStethoscope,
      LucideTarget,
      LucideThermometer,
      LucideTimeline,
      LucideTrash2,
      LucideUserRound,
      LucideUsersRound,
      LucideWind,
      LucideWorkflow,
      LucideX,
    ),
  ],
};
