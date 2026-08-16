import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { messageFromError } from '../../data/api-error';
import { analysisBadgeOf, jointSummaryOf, scoresOf } from '../../data/encounter-summary';
import { EncounterDetail } from '../../data/patient.model';
import { PatientsService } from '../../data/patients.service';

/**
 * A consulta reaberta: o contexto clínico e a escolha do que examinar.
 *
 * Uma consulta guarda dois exames independentes — o mapa corporal com os índices
 * de atividade, e a análise de imagens — e nenhum dos dois é "o" achado. Abrir
 * direto em um deles escondia o outro atrás de um caminho que ninguém descobria,
 * e empilhar os dois na mesma tela faria a página carregar imagens térmicas que o
 * médico talvez nem tenha vindo ver.
 *
 * Esta página, então, não mostra achado nenhum: mostra de quem é a consulta, o
 * que cada exame tem, e deixa a escolha — cada exame vive na sua própria rota,
 * reusando a tela em que foi feito.
 */
@Component({
  selector: 'app-encounter-detail-page',
  imports: [DatePipe, RouterLink, LucideDynamicIcon],
  templateUrl: './encounter-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncounterDetailPage {
  /** Vem do `:encounterId` da rota, via withComponentInputBinding(). */
  readonly encounterId = input.required<string>();

  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);

  protected readonly detail = signal<EncounterDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);

  protected readonly scores = computed(() => {
    const encounter = this.detail();
    return encounter ? scoresOf(encounter) : [];
  });
  protected readonly jointSummary = computed(() => {
    const encounter = this.detail();
    return encounter ? jointSummaryOf(encounter) : null;
  });
  protected readonly analysisBadge = computed(() => {
    const encounter = this.detail();
    return encounter ? analysisBadgeOf(encounter) : null;
  });

  /**
   * A análise de imagens pode ser aberta?
   *
   * Em `uploading` os arquivos podem não estar no bucket. Levar o médico até a
   * tela do analisador para ele encontrar imagens quebradas é pior do que dizer
   * aqui que o envio não terminou.
   */
  protected readonly canOpenAnalysis = computed(() => this.analysisBadge()?.pending === false);

  constructor() {
    effect(() => this.load(this.encounterId()));
  }

  protected toggleConfirmDelete(): void {
    this.confirmingDelete.update((open) => !open);
    this.error.set(null);
  }

  protected confirmDelete(): void {
    const consulta = this.detail();
    if (!consulta || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.error.set(null);
    this.patients.deleteEncounter(consulta.id).subscribe({
      // Volta para o paciente, e não para a lista: é o contexto de onde a consulta
      // foi aberta, e ele recarrega já sem ela. Sem `deleting.set(false)` — a página
      // está saindo, e desligar a flag reabilitaria o botão por um instante.
      next: () => void this.router.navigate(['/pacientes', consulta.patient.id]),
      error: (cause: unknown) => {
        this.error.set(messageFromError(cause));
        this.deleting.set(false);
        this.confirmingDelete.set(false);
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.patients.getEncounter(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: (cause: unknown) => {
        this.error.set(messageFromError(cause));
        this.loading.set(false);
      },
    });
  }
}
