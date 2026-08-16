import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Patient } from '../../../../patients/data/patient.model';
import { PatientsService } from '../../../../patients/data/patients.service';
import { messageFromError } from '../../../../patients/data/api-error';

/**
 * Primeira etapa do fluxo: escolher o paciente a quem a análise será atrelada.
 *
 * Emite o paciente escolhido e não guarda nada — quem retém o estado do fluxo é
 * o container. Criar um paciente aqui é a única escrita que acontece antes do
 * fim: sem paciente não há a quem atrelar, e ele é um cadastro por si só, não um
 * rascunho da análise.
 */
@Component({
  selector: 'app-patient-step',
  imports: [FormsModule],
  templateUrl: './patient-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientStep {
  readonly selected = output<Patient>();

  private readonly patients = inject(PatientsService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly list = signal<readonly Patient[]>([]);
  protected readonly filter = signal('');
  protected readonly creating = signal(false);
  protected readonly newName = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.patients.list().subscribe({
      next: (patients) => {
        this.list.set(patients);
        this.loading.set(false);
      },
      error: (cause: unknown) => {
        this.error.set(messageFromError(cause));
        this.loading.set(false);
      },
    });
  }

  protected get visible(): readonly Patient[] {
    const term = this.filter().trim().toLowerCase();
    const all = this.list();
    return term ? all.filter((p) => p.full_name.toLowerCase().includes(term)) : all;
  }

  protected choose(patient: Patient): void {
    this.selected.emit(patient);
  }

  protected startCreating(): void {
    this.creating.set(true);
    this.newName.set(this.filter().trim());
  }

  protected cancelCreating(): void {
    this.creating.set(false);
    this.newName.set('');
    this.error.set(null);
  }

  protected create(): void {
    const fullName = this.newName().trim();
    if (!fullName || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.patients.create({ full_name: fullName }).subscribe({
      next: (patient) => {
        this.saving.set(false);
        this.creating.set(false);
        this.selected.emit(patient);
      },
      error: (cause: unknown) => {
        this.error.set(messageFromError(cause));
        this.saving.set(false);
      },
    });
  }
}
