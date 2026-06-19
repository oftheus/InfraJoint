import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgOptimizedImage } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { filter } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';

/** A single entry in the sidebar's main navigation menu. */
interface NavItem {
  /** Visible label. */
  readonly label: string;
  /** Registered Lucide icon name shown to the left of the label. */
  readonly icon: string;
  /** Router path the item navigates to. */
  readonly route: string;
}

/**
 * Layout shell for the authenticated area of the application.
 *
 * Renders a persistent left sidebar (logo, user profile, navigation, logout)
 * alongside the routed page content. On small screens the sidebar collapses
 * into an off-canvas drawer toggled from a mobile top bar.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [NgOptimizedImage, RouterLink, RouterOutlet, LucideDynamicIcon],
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

  /** Main navigation entries — append here to add Analysis, Projects, etc. */
  protected readonly navItems: readonly NavItem[] = [
    { label: 'Dashboard', icon: 'house', route: '/dashboard' },
  ];

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
    // Close the mobile drawer whenever navigation completes.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.sidebarOpen.set(false));
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
}
