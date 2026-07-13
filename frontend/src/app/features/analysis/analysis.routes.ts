import { Routes } from '@angular/router';

/**
 * "Análise" section routes. Groups the analysis tools shown under the sidebar's
 * Análise menu. Add new analysis modules here as their own child route.
 */
export const analysisRoutes: Routes = [
  { path: '', redirectTo: 'analisador-de-imagens', pathMatch: 'full' },
  {
    path: 'analisador-de-imagens',
    loadComponent: () =>
      import('./pages/image-analyzer-page/image-analyzer-page').then((m) => m.ImageAnalyzerPage),
  },
  {
    path: 'mapa-corporal',
    loadChildren: () => import('./body-map/body-map.routes').then((m) => m.bodyMapRoutes),
  },
  {
    path: 'analise-termica',
    loadComponent: () =>
      import('./pages/thermal-analysis-page/thermal-analysis-page').then(
        (m) => m.ThermalAnalysisPage,
      ),
  },
];
