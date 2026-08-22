/**
 * Contratos dos algoritmos de pesquisa.
 *
 * Um algoritmo recebe as medições que o analisador produziu e devolve **dados**: uma
 * frase e uma lista de números com nome. Ele não formata nada — quem decide que 1.4
 * aparece como "1,4 °C", e que a lista vira tabela, é a tela, uma vez só, igual para
 * todos.
 *
 * Uma versão anterior devolvia markdown, e cada algoritmo montava a própria tabela com
 * `|`. Isso era o algoritmo fazendo o trabalho da tela: ~40 linhas de formatação
 * reescritas por algoritmo, números virando texto sem volta, e testes presos à
 * redação das frases.
 *
 * O desenho e as alternativas descartadas estão em `Algoritmos.MD`, na raiz do repo.
 */

import { HandSide } from '../image-analyzer/image-analyzer.model';

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
/**
 * O que todo algoritmo recebe: as capturas medidas. Uma análise avulsa é uma
 * sequência de um frame.
 *
 * Já carregou `subject` (idade, sexo) e `clinical` (body map, escores). Saíram porque
 * nenhum algoritmo os lia, e alimentá-los custava ~43 linhas na página do fluxo
 * térmico. Voltam junto com o primeiro algoritmo que normalize por idade ou cruze com
 * o body map — é um campo a mais aqui, e o resto nasce com o leitor.
 *
 * Continua sendo um objeto de um campo só, e não `AlgorithmFrame[]` direto, porque é
 * ele a costura: crescer o tipo não muda a assinatura de nenhum algoritmo já escrito.
 */
export interface AlgorithmInput {
  /** Ordenados por tempo. */
  readonly frames: readonly AlgorithmFrame[];
}

/**
 * O que todo algoritmo devolve.
 *
 * O resultado **é** o relatório. `status` não é redundante com ele: sem esse campo a
 * tela teria que interpretar o texto para saber se mostra um achado ou uma
 * justificativa de por que não houve achado.
 */
/** Uma linha do resultado: um número com nome, e a unidade quando houver. */
export interface AlgorithmValue {
  readonly label: string;
  readonly value: number;
  /** Ausente quando o número não tem unidade — uma contagem, uma proporção. */
  readonly unit?: string;
}

export interface AlgorithmResult {
  /** `insufficient-data` é resposta legítima, não erro: sequência ruim é caso comum. */
  readonly status: 'ok' | 'insufficient-data';
  /**
   * O achado em prosa, texto puro. Uma ou duas frases — para vários algoritmos é a
   * resposta inteira.
   */
  readonly summary: string;
  /**
   * Os números do resultado. Vazio quando o achado não é numérico (uma classificação,
   * um veredito), e aí a tela mostra só o `summary`.
   */
  readonly values: readonly AlgorithmValue[];
}

/**
 * Um algoritmo plugado. Implementações são trocáveis atrás desta assinatura —
 * é o único padrão de projeto envolvido, e é o próprio conceito de "plugar".
 */
export interface ResearchAlgorithm {
  /** Identidade estável, usada para selecionar o algoritmo na tela. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  run(input: AlgorithmInput): AlgorithmResult;
}
