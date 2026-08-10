import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { UserProfile, UserRole } from '../../../core/auth/profile.model';
import { AuthShell } from './auth-shell';

/** Shape of the private nav tree, narrowed to what these tests assert on. */
interface VisibleEntry {
  readonly label: string;
  readonly kind: 'link' | 'group';
}

function labelsFor(role: UserRole | undefined): readonly string[] {
  const profile = signal<UserProfile | null>(role ? ({ role } as UserProfile) : null);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { user: signal(null), profile, signOut: vi.fn() },
      },
    ],
  });

  const shell = TestBed.createComponent(AuthShell).componentInstance;
  const visibleNav = (shell as unknown as { visibleNav: () => readonly VisibleEntry[] }).visibleNav;
  return visibleNav().map((entry) => entry.label);
}

describe('AuthShell sidebar visibility', () => {
  it('hides Pacientes and Administração from a reader', () => {
    const labels = labelsFor('user');
    expect(labels).not.toContain('Pacientes');
    expect(labels).not.toContain('Administração');
    expect(labels).toContain('Dashboard');
  });

  it('shows Pacientes to a médico but not Administração', () => {
    const labels = labelsFor('medico');
    expect(labels).toContain('Pacientes');
    expect(labels).not.toContain('Administração');
  });

  // Regression guard: strict equality on a single `requiredRole` hid médico-scoped
  // entries from admins, who are supposed to see everything.
  it('shows both Pacientes and Administração to an admin', () => {
    const labels = labelsFor('admin');
    expect(labels).toContain('Pacientes');
    expect(labels).toContain('Administração');
  });

  it('hides every gated entry while the profile is still unresolved', () => {
    const labels = labelsFor(undefined);
    expect(labels).not.toContain('Pacientes');
    expect(labels).not.toContain('Administração');
  });
});
