import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Auth-dependent routes rely on the browser-only Supabase session, so they
  // are client-rendered rather than prerendered.
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },
  { path: 'dashboard', renderMode: RenderMode.Client },
  { path: 'pacientes', renderMode: RenderMode.Client },
  { path: 'analise/**', renderMode: RenderMode.Client },
  { path: 'pesquisa/**', renderMode: RenderMode.Client },
  { path: 'administracao/**', renderMode: RenderMode.Client },
  { path: 'perfil', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
