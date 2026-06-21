import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass, NgOptimizedImage } from '@angular/common';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { filter } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { UserRole } from '../../../core/auth/profile.model';

/** A single clickable entry in the sidebar navigation. */
interface NavLink {
  readonly kind: 'link';
  /** Visible label. */
  readonly label: string;
  /** Registered Lucide icon name shown to the left of the label. */
  readonly icon: string;
  /** Router path the item navigates to. */
  readonly route: string;
  /** When set, the entry is only shown to users holding this role. */
  readonly requiredRole?: UserRole;
}

/** A collapsible group of navigation links (a section with children). */
interface NavGroup {
  readonly kind: 'group';
  readonly label: string;
  readonly icon: string;
  readonly children: readonly NavLink[];
  /** When set, the whole section is only shown to users holding this role. */
  readonly requiredRole?: UserRole;
}

type NavEntry = NavLink | NavGroup;

/**
 * Layout shell for the authenticated area of the application.
 *
 * Renders a persistent left sidebar (logo, user profile, navigation, logout)
 * alongside the routed page content. On small screens the sidebar collapses
 * into an off-canvas drawer toggled from a mobile top bar.
 *
 * The navigation supports flat links and collapsible groups, role-based
 * visibility, active-route highlighting and auto-expansion of the active group.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [
    NgClass,
    NgOptimizedImage,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideDynamicIcon,
  ],
  templateUrl: './auth-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly profile = this.auth.profile;

  /** Whether the off-canvas drawer is open (mobile only). */
  protected readonly sidebarOpen = signal(false);

  /** Labels of the groups currently expanded in the sidebar. */
  private readonly expandedGroups = signal<ReadonlySet<string>>(new Set());

  /** Current route path (without query/fragment), kept in sync on navigation. */
  private readonly currentUrl = signal(this.toPath(this.router.url));

  /**
   * Full navigation tree. Append links/groups here to add new modules; the
   * `requiredRole` flag gates visibility and groups render as collapsible
   * sections automatically.
   */
  private readonly navEntries: readonly NavEntry[] = [
    { kind: 'link', label: 'Dashboard', icon: 'house', route: '/dashboard' },
    { kind: 'link', label: 'Pacientes', icon: 'user-round', route: '/pacientes' },
    {
      kind: 'group',
      label: 'Análise',
      icon: 'stethoscope',
      children: [
        {
          kind: 'link',
          label: 'Analisador de imagens',
          icon: 'camera',
          route: '/analise/analisador-de-imagens',
        },
        {
          kind: 'link',
          label: 'Mapa corporal + CDAI/DAS28',
          icon: 'person-standing',
          route: '/analise/mapa-corporal',
        },
        {
          kind: 'link',
          label: 'Análise térmica',
          icon: 'thermometer',
          route: '/analise/analise-termica',
        },
      ],
    },
    {
      kind: 'group',
      label: 'Pesquisa',
      icon: 'chart-no-axes-combined',
      children: [
        { kind: 'link', label: 'Algoritmos', icon: 'workflow', route: '/pesquisa/algoritmos' },
      ],
    },
    {
      kind: 'group',
      label: 'Administração',
      icon: 'shield',
      requiredRole: 'admin',
      children: [
        { kind: 'link', label: 'Usuários', icon: 'users-round', route: '/administracao/usuarios' },
        { kind: 'link', label: 'Dataset', icon: 'layers', route: '/administracao/dataset' },
        {
          kind: 'link',
          label: 'Configurações',
          icon: 'settings',
          route: '/administracao/configuracoes',
        },
      ],
    },
  ];

  /** Navigation tree filtered down to what the current user is allowed to see. */
  protected readonly visibleNav = computed<readonly NavEntry[]>(() => {
    const role = this.profile()?.role;
    return this.navEntries
      .filter((entry) => this.canSee(entry, role))
      .map((entry) =>
        entry.kind === 'group'
          ? { ...entry, children: entry.children.filter((child) => this.canSee(child, role)) }
          : entry,
      )
      .filter((entry) => entry.kind === 'link' || entry.children.length > 0);
  });

  /** First name for the greeting, falling back to the email handle. */
  protected readonly greetingName = computed(() => {
    const fullName = this.profile()?.full_name?.trim();
    if (fullName) {
      return fullName.split(/\s+/)[0];
    }
    const email = this.user()?.email;
    return email ? email.split('@')[0] : 'usuário';
  });

  /** Initials fallback shown when the profile has no avatar image. */
  protected readonly initials = computed(() => {
    const parts = (this.profile()?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return (this.user()?.email?.[0] ?? '?').toUpperCase();
    }
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  });

  constructor() {
    // Expand the group that owns the route we land on (e.g. deep links / refresh).
    this.expandActiveGroup(this.currentUrl());

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        // Close the mobile drawer and keep active state in sync on navigation.
        this.sidebarOpen.set(false);
        const path = this.toPath(event.urlAfterRedirects);
        this.currentUrl.set(path);
        this.expandActiveGroup(path);
      });
  }

  protected isExpanded(label: string): boolean {
    return this.expandedGroups().has(label);
  }

  protected toggleGroup(label: string): void {
    this.expandedGroups.update((groups) => {
      const next = new Set(groups);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  /** Whether any link inside the group matches the current route. */
  protected isGroupActive(group: NavGroup): boolean {
    return group.children.some((child) => this.isLinkActive(child.route));
  }

  protected openSidebar(): void {
    this.sidebarOpen.set(true);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    // Global state updates via onAuthStateChange; just route home.
    await this.router.navigate(['/']);
  }

  private canSee(entry: NavEntry, role: UserRole | undefined): boolean {
    return !entry.requiredRole || entry.requiredRole === role;
  }

  private isLinkActive(route: string): boolean {
    const url = this.currentUrl();
    return url === route || url.startsWith(`${route}/`);
  }

  private expandActiveGroup(path: string): void {
    const active = this.navEntries.find(
      (entry): entry is NavGroup =>
        entry.kind === 'group' &&
        entry.children.some((child) => path === child.route || path.startsWith(`${child.route}/`)),
    );
    if (active) {
      this.expandedGroups.update((groups) => new Set(groups).add(active.label));
    }
  }

  private toPath(url: string): string {
    return url.split(/[?#]/)[0];
  }
}
