import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { messageFromError } from '../../data/api-error';
import { Encounter, Patient, SEX_OPTIONS, Sex } from '../../data/patient.model';
import { PatientsService } from '../../data/patients.service';

@Component({
  selector: 'app-patient-detail-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, LucideDynamicIcon],
  templateUrl: './patient-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDetailPage {
  /** Vem de `withComponentInputBinding()`; casa com o `:id` da rota. */
  readonly id = input.required<string>();

  private readonly patientsService = inject(PatientsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  /**
   * Sem as consultas de propósito: elas moram só em `encounters`.
   *
   * Guardar o `PatientDetail` inteiro deixaria uma segunda cópia da lista aqui, que
   * envelheceria a cada consulta criada — e a próxima pessoa a ler `patient().encounters`
   * pegaria dado velho sem nenhum aviso.
   */
  protected readonly patient = signal<Patient | null>(null);
  protected readonly encounters = signal<readonly Encounter[]>([]);
  protected readonly loading = signal(true);
  protected readonly savingPatient = signal(false);
  protected readonly savingEncounter = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly encounterFormOpen = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);

  protected readonly sexOptions = SEX_OPTIONS;

  protected readonly patientForm = this.formBuilder.group({
    full_name: ['', [Validators.required, Validators.maxLength(200)]],
    birth_date: [''],
    sex: ['' as Sex | ''],
    phone: [''],
    primary_diagnosis: [''],
  });

  protected readonly encounterForm = this.formBuilder.group({
    reason: [''],
    clinical_notes: [''],
  });

  constructor() {
    // Não dá para carregar no construtor: signal input required só tem valor depois do
    // binding, e ler antes disso levanta NG0950. O effect roda quando `id` está pronto —
    // e roda de novo se a rota mudar para outro paciente sem recriar o componente.
    effect(() => this.load(this.id()));
  }

  private load(patientId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.patientsService.get(patientId).subscribe({
      next: (detail) => {
        this.patient.set(detail);
        this.encounters.set(detail.encounters);
        this.patientForm.patchValue({
          full_name: detail.full_name,
          birth_date: detail.birth_date ?? '',
          sex: detail.sex ?? '',
          phone: detail.phone ?? '',
          primary_diagnosis: detail.primary_diagnosis ?? '',
        });
        this.loading.set(false);
      },
      error: (failure) => {
        this.error.set(messageFromError(failure));
        this.loading.set(false);
      },
    });
  }

  protected sexLabel(sex: Sex | null): string | null {
    return SEX_OPTIONS.find((option) => option.value === sex)?.label ?? null;
  }

  protected toggleEditing(): void {
    this.editing.update((open) => !open);
    this.error.set(null);
  }

  protected savePatient(): void {
    if (this.patientForm.invalid || this.savingPatient()) {
      this.patientForm.markAllAsTouched();
      return;
    }

    this.savingPatient.set(true);
    this.error.set(null);

    const raw = this.patientForm.getRawValue();
    const changes = {
      full_name: raw.full_name.trim(),
      birth_date: blankToNull(raw.birth_date),
      sex: raw.sex === '' ? null : raw.sex,
      phone: blankToNull(raw.phone),
      primary_diagnosis: blankToNull(raw.primary_diagnosis),
    };

    this.patientsService.update(this.id(), changes).subscribe({
      next: (updated) => {
        this.patient.set(updated);
        this.editing.set(false);
        this.savingPatient.set(false);
      },
      error: (failure) => {
        this.error.set(messageFromError(failure));
        this.savingPatient.set(false);
      },
    });
  }

  protected toggleConfirmDelete(): void {
    this.confirmingDelete.update((open) => !open);
    this.error.set(null);
  }

  protected confirmDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    this.patientsService.delete(this.id()).subscribe({
      next: () => {
        // Sem `deleting.set(false)`: a página está saindo, e desligar a flag antes da
        // navegação reabilitaria o botão por um instante.
        void this.router.navigate(['/pacientes']);
      },
      error: (failure) => {
        this.error.set(messageFromError(failure));
        this.deleting.set(false);
        this.confirmingDelete.set(false);
      },
    });
  }

  protected toggleEncounterForm(): void {
    this.encounterFormOpen.update((open) => !open);
    this.error.set(null);
  }

  protected createEncounter(): void {
    if (this.savingEncounter()) {
      return;
    }

    this.savingEncounter.set(true);
    this.error.set(null);

    const raw = this.encounterForm.getRawValue();
    this.patientsService
      .createEncounter(this.id(), {
        reason: blankToNull(raw.reason),
        clinical_notes: blankToNull(raw.clinical_notes),
      })
      .subscribe({
        next: (created) => {
          this.encounters.update((current) => [created, ...current]);
          this.encounterForm.reset();
          this.encounterFormOpen.set(false);
          this.savingEncounter.set(false);
        },
        error: (failure) => {
          this.error.set(messageFromError(failure));
          this.savingEncounter.set(false);
        },
      });
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
