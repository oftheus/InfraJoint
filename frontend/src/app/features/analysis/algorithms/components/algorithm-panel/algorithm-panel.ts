import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LucideDynamicIcon } from '@lucide/angular';

import { AlgorithmInput, AlgorithmResult, ResearchAlgorithm } from '../../algorithm.model';
import { RESEARCH_ALGORITHMS } from '../../registry';

/**
 * Painel de algoritmos: escolher, rodar, ler o resultado.
 *
 * A tela é a mesma para todo algoritmo: a frase em cima, os números embaixo. Nenhum
 * algoritmo traz apresentação própria — é o que faz plugar um novo custar só a conta.
 *
 * Componente burro de propósito — recebe a entrada pronta e mostra o resultado. Não
 * conhece paciente nem HTTP, e o resultado não sai daqui: nada é persistido, no fluxo
 * térmico como no analisador avulso.
 */
@Component({
  selector: 'app-algorithm-panel',
  imports: [LucideDynamicIcon, DecimalPipe],
  templateUrl: './algorithm-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmPanel {
  /** Nulo enquanto não há análise processada. */
  readonly algorithmInput = input<AlgorithmInput | null>(null);
  protected readonly selectedSlug = signal(RESEARCH_ALGORITHMS[0]?.slug ?? '');
  protected readonly result = signal<AlgorithmResult | null>(null);
  /** Qual algoritmo produziu `result()` — o relatório precisa se identificar. */
  protected readonly ranAlgorithm = signal<ResearchAlgorithm | null>(null);

  protected readonly options = RESEARCH_ALGORITHMS;

  protected readonly selected = computed(() =>
    RESEARCH_ALGORITHMS.find((algorithm) => algorithm.slug === this.selectedSlug()),
  );

  /**
   * Por que nenhum algoritmo pode rodar agora, ou null quando podem.
   *
   * É uma só para todos, e não uma por algoritmo: a pré-condição é a mesma — sem
   * articulação medida não há o que calcular. Cobrada aqui, uma vez, para nenhum
   * `run()` precisar repetir a guarda.
   *
   * Acionável, e não descritiva: quando o painel aparece a imagem já está carregada,
   * então o que falta é sempre a medição das articulações.
   */
  protected readonly blocked = computed(() => {
    const input = this.algorithmInput();
    return !input || !input.frames.some((frame) => frame.joints.length > 0)
      ? 'Detecte as articulações para executar um algoritmo.'
      : null;
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

  protected select(slug: string): void {
    this.selectedSlug.set(slug);
    this.limpar();
  }

  protected run(): void {
    const algorithm = this.selected();
    const input = this.algorithmInput();
    if (!algorithm || this.blocked() || !input) {
      return;
    }
    this.result.set(algorithm.run(input));
    this.ranAlgorithm.set(algorithm);
  }

  private limpar(): void {
    if (this.result() === null) {
      return;
    }
    this.result.set(null);
    this.ranAlgorithm.set(null);
  }
}
