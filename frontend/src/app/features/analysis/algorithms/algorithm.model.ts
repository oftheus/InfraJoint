/**
 * Contratos dos algoritmos de pesquisa.
 *
 * Um algoritmo recebe as medições que o analisador produziu e devolve um texto. Só
 * isso — a estrutura da resposta é do algoritmo, não deste contrato. `status` existe
 * por um motivo único: a tela precisa saber, sem ler o texto, se desenha um resultado
 * ou um aviso.
 *
 * O desenho e as alternativas descartadas estão em `Algoritmos.MD`, na raiz do repo.
 */

import { HandSide } from '../image-analyzer/image-analyzer.model';

/** Sexo do paciente, como o backend o guarda. Nulo no analisador avulso. */
export type SubjectSex = 'F' | 'M' | 'O' | 'N';

/** Uma articulação medida, com a confiabilidade da medida ao lado do número. */
export interface AlgorithmJoint {
  /** Identidade estável, `side:landmarkId` — a mesma chave de `jointRoiKey()`. */
  readonly key: string;
  readonly side: HandSide;
  readonly landmarkId: number;
  /** Rótulo do mapa corporal, e.g. 'MCP 3'. */
  readonly label: string;
  readonly mean: number;
  readonly median: number;
  readonly max: number;
  readonly min: number;
  /** Fração da ROI que era pele (0–1). */
  readonly skinCoverage: number;
  /** Células efetivamente agregadas — `RoiStats.count`. */
  readonly sampleCount: number;
}

/**
 * Uma captura, com o que foi medido nela e o quanto se pode confiar.
 *
 * `joints` vazio é informação, não ausência de dado: a captura existiu e nada foi
 * medido nela. Descartá-la esconderia o buraco na sequência.
 */
export interface AlgorithmFrame {
  readonly captureIndex: number;
  /** Nulo na análise avulsa, onde não se sabe se a captura é basal. */
  readonly phase: 'baseline' | 'dynamic' | null;
  /** Segundos no eixo de reaquecimento. Nulo na avulsa, onde não há eixo. */
  readonly timeSeconds: number | null;
  readonly quality: {
    readonly alignmentMethod: 'silhouette' | 'fiducial' | 'manual' | null;
    /** Dice normalizado do alinhamento (0–1). Sem limiar clínico definido. */
    readonly agreementNormalized: number | null;
    readonly issue: string | null;
  };
  readonly joints: readonly AlgorithmJoint[];
}

/** O que todo algoritmo recebe. Uma análise avulsa é uma sequência de um frame. */
export interface AlgorithmInput {
  readonly schemaVersion: 1;
  /** Sem identificação: idade e sexo bastam para qualquer normalização. */
  readonly subject: {
    readonly ageYears: number | null;
    readonly sex: SubjectSex | null;
  };
  /** Ordenados por tempo. */
  readonly frames: readonly AlgorithmFrame[];
  /** O body map da consulta, quando houve. Nulo no analisador avulso. */
  readonly clinical: {
    readonly jointEvaluations: Readonly<
      Record<string, { readonly pain: boolean; readonly swelling: boolean }>
    > | null;
    readonly scores: Readonly<Record<string, unknown>>;
  } | null;
}

/**
 * O que todo algoritmo devolve.
 *
 * O resultado **é** o relatório. `status` não é redundante com ele: sem esse campo a
 * tela teria que interpretar o texto para saber se mostra um achado ou uma
 * justificativa de por que não houve achado.
 */
export interface AlgorithmResult {
  /** `insufficient-data` é resposta legítima, não erro: sequência ruim é caso comum. */
  readonly status: 'ok' | 'insufficient-data' | 'error';
  /** Markdown: parágrafo, lista, tabela, negrito. Nada além disso é validado. */
  readonly report: string;
}

/**
 * Um algoritmo plugado. Implementações são trocáveis atrás desta assinatura —
 * é o único padrão de projeto envolvido, e é o próprio conceito de "plugar".
 */
export interface ResearchAlgorithm {
  /** Identidade estável; vai gravada junto do resultado. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /**
   * O que ele exige da entrada.
   *
   * Existe para a tela poder desabilitar o algoritmo e dizer por quê, antes do
   * clique — em vez de cada `run()` falhar do seu próprio jeito.
   */
  readonly requires: {
    readonly minFrames: number;
    readonly needsBaseline: boolean;
  };
  run(input: AlgorithmInput): AlgorithmResult;
}
