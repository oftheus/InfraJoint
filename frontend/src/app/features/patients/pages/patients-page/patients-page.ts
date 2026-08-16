import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { duplicatesFromError, messageFromError } from '../../data/api-error';
import { Patient, PatientCreate, SEX_OPTIONS, Sex } from '../../data/patient.model';
import { PatientsService } from '../../data/patients.service';

@Component({
  selector: 'app-patients-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, LucideDynamicIcon],
  templateUrl: './patients-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientsPage {
  private readonly patientsService = inject(PatientsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly patients = signal<readonly Patient[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  /**
   * Homônimos que a API devolveu ao recusar o cadastro.
   *
   * Enquanto houver algum, o botão de salvar vira "cadastrar assim mesmo": é o
   * segundo pedido, e só ele leva `allow_duplicate`. Não é estado do formulário —
   * some assim que o nome muda, porque aí o aviso é sobre outra pessoa.
   */
  protected readonly duplicates = signal<readonly Patient[]>([]);

  protected readonly sexOptions = SEX_OPTIONS;

  protected readonly form = this.formBuilder.group({
    full_name: ['', [Validators.required, Validators.maxLength(200)]],
    birth_date: [''],
    sex: ['' as Sex | ''],
    phone: [''],
    primary_diagnosis: [''],
  });

  constructor() {
    this.load();
    // Mudou o nome, mudou a pergunta: o aviso anterior falava de outra pessoa.
    this.form.controls.full_name.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.duplicates.set([]));
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.patientsService.list().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.loading.set(false);
      },
      error: (failure) => {
        this.error.set(messageFromError(failure));
        this.loading.set(false);
      },
    });
  }

  protected toggleForm(): void {
    this.formOpen.update((open) => !open);
    this.error.set(null);
    this.duplicates.set([]);
  }

  /**
   * Envia o cadastro. `confirmado` é o segundo clique, depois de a tela mostrar os
   * homônimos — só ele autoriza a API a criar um paciente com nome repetido.
   */
  protected submit(confirmado = false): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    this.patientsService.create(this.toPayload(), confirmado).subscribe({
      next: (created) => {
        this.patients.update((current) => [created, ...current]);
        this.form.reset();
        this.duplicates.set([]);
        this.formOpen.set(false);
        this.saving.set(false);
      },
      error: (failure) => {
        // Homônimo não é erro: é uma pergunta. O formulário fica como está, com a
        // lista de quem já existe ao lado do botão que confirma.
        this.duplicates.set(duplicatesFromError(failure) ?? []);
        this.error.set(this.duplicates().length > 0 ? null : messageFromError(failure));
        this.saving.set(false);
      },
    });
  }

  /** Campo vazio significa "não informado", e o backend espera `null`, não `''`. */
  private toPayload(): PatientCreate {
    const raw = this.form.getRawValue();
    return {
      full_name: raw.full_name.trim(),
      birth_date: blankToNull(raw.birth_date),
      sex: raw.sex === '' ? null : raw.sex,
      phone: blankToNull(raw.phone),
      primary_diagnosis: blankToNull(raw.primary_diagnosis),
    };
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
