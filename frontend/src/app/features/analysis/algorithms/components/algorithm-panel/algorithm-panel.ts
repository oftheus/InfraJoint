import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import { AlgorithmInput, AlgorithmResult, ResearchAlgorithm } from '../../algorithm.model';
import { RESEARCH_ALGORITHMS } from '../../registry';
import { renderReport } from '../../report-markdown';

/** Um algoritmo na lista, já sabendo se pode rodar sobre a entrada atual. */
interface AlgorithmOption {
  readonly algorithm: ResearchAlgorithm;
  /** Motivo de estar indisponível, ou null quando pode rodar. */
  readonly blocked: string | null;
}

/**
 * Painel de algoritmos: escolher, rodar, ler o relatório.
 *
 * Componente burro de propósito — recebe a entrada pronta e devolve o resultado. Não
 * conhece paciente, HTTP nem persistência, e é por isso que o analisador avulso pode
 * exibi-lo sem virar tela que grava.
 */
@Component({
  selector: 'app-algorithm-panel',
  imports: [LucideDynamicIcon],
  // O relatório entra por `innerHTML`, então estilos encapsulados não o alcançam.
  // `::ng-deep` sob `:host` limita o vazamento ao subárvore deste componente.
  styles: `
    :host ::ng-deep .algorithm-report p {
      margin-bottom: 0.75rem;
    }
    :host ::ng-deep .algorithm-report strong {
      font-weight: 600;
    }
    :host ::ng-deep .algorithm-report table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.75rem 0;
    }
    :host ::ng-deep .algorithm-report th,
    :host ::ng-deep .algorithm-report td {
      border-bottom: 1px solid #f1f5f9;
      padding: 0.375rem 0.5rem;
      text-align: left;
    }
    :host ::ng-deep .algorithm-report th {
      font-weight: 600;
      color: #1b3a57;
    }
    :host ::ng-deep .algorithm-report td:not(:first-child),
    :host ::ng-deep .algorithm-report th:not(:first-child) {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    :host ::ng-deep .algorithm-report ul {
      list-style: disc;
      padding-left: 1.25rem;
      margin-bottom: 0.75rem;
    }
  `,
  templateUrl: './algorithm-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmPanel {
  /** Nulo enquanto não há análise processada. */
  readonly algorithmInput = input<AlgorithmInput | null>(null);
  /** O resultado corrente, para quem quiser gravá-lo. Null quando não há. */
  readonly resultChange = output<AlgorithmResult | null>();

  protected readonly selectedSlug = signal(RESEARCH_ALGORITHMS[0]?.slug ?? '');
  protected readonly result = signal<AlgorithmResult | null>(null);
  /** Qual algoritmo produziu `result()` — o relatório precisa se identificar. */
  protected readonly ranAlgorithm = signal<ResearchAlgorithm | null>(null);

  protected readonly options = computed<readonly AlgorithmOption[]>(() => {
    const input = this.algorithmInput();
    return RESEARCH_ALGORITHMS.map((algorithm) => ({
      algorithm,
      blocked: this.motivoIndisponivel(algorithm, input),
    }));
  });

  protected readonly selected = computed(() =>
    this.options().find((option) => option.algorithm.slug === this.selectedSlug()),
  );

  protected readonly reportHtml = computed(() => {
    const result = this.result();
    return result ? renderReport(result.report) : '';
  });

  constructor() {
    // Mudou a análise, o resultado anterior deixou de valer: ele descreve outras
    // medições. Mantê-lo na tela seria mostrar um achado de outra captura.
    effect(() => {
      this.algorithmInput();
      // `untracked` não é detalhe: `limpar()` lê `result()`, e sem isto o effect
      // passaria a depender do próprio resultado — executar o algoritmo dispararia
      // o effect, que zeraria o resultado no mesmo ciclo. A tela ficava igual, como
      // se o botão não fizesse nada.
      untracked(() => this.limpar());
    });
  }

  /**
   * Por que este algoritmo não pode rodar agora.
   *
   * Existe para a tela dizer o motivo antes do clique, em vez de deixar cada `run()`
   * falhar do seu próprio jeito.
   */
  private motivoIndisponivel(
    algorithm: ResearchAlgorithm,
    input: AlgorithmInput | null,
  ): string | null {
    if (!input || input.frames.length === 0) {
      // Acionável, e não descritiva: quando o painel aparece a imagem já está
      // carregada, então o que falta é sempre a medição das articulações.
      return 'Detecte as articulações para executar um algoritmo.';
    }
    if (input.frames.length < algorithm.requires.minFrames) {
      return `Precisa de ao menos ${algorithm.requires.minFrames} capturas; há ${input.frames.length}.`;
    }
    if (
      algorithm.requires.needsBaseline &&
      !input.frames.some((frame) => frame.phase === 'baseline')
    ) {
      return 'Precisa de uma sequência com captura basal.';
    }
    return null;
  }

  protected select(slug: string): void {
    this.selectedSlug.set(slug);
    this.limpar();
  }

  protected run(): void {
    const option = this.selected();
    const input = this.algorithmInput();
    if (!option || option.blocked || !input) {
      return;
    }
    const result = option.algorithm.run(input);
    this.result.set(result);
    this.ranAlgorithm.set(option.algorithm);
    this.resultChange.emit(result);
  }

  private limpar(): void {
    if (this.result() === null) {
      return;
    }
    this.result.set(null);
    this.ranAlgorithm.set(null);
    this.resultChange.emit(null);
  }
}
