/**
 * Converte o estado do analisador na entrada dos algoritmos.
 *
 * **Recebe uma leitura estrutural, não o componente** — mesmo recurso que
 * `AnalyzerReadout` usa em `thermal-analysis/data/analyzer-collect.ts`, e pela mesma
 * razão: assim isto é testável com um objeto literal, sem montar as 1251 linhas da
 * página, e a página não precisa saber que este módulo existe.
 *
 * As três situações em que um algoritmo roda — análise nova, fluxo térmico ao vivo e
 * consulta reaberta — já convergem no estado do analisador: a consulta gravada volta
 * para dentro dele por `restoreAnalysis()`. Por isso há uma conversão só.
 */

import { RoiStats } from '../image-analyzer/image-analyzer.model';
import { JointRoi } from '../image-analyzer/joint-rois';
import { AlgorithmFrame, AlgorithmInput, AlgorithmJoint } from './algorithm.model';

/** Uma captura como a página a expõe, antes da conversão. */
export interface ReadoutFrame {
  readonly captureIndex: number;
  readonly phase: 'baseline' | 'dynamic' | null;
  readonly timeSeconds: number | null;
  readonly alignmentMethod: 'silhouette' | 'fiducial' | 'manual' | null;
  readonly agreementNormalized: number | null;
  readonly issue: string | null;
  readonly jointRois: readonly JointRoi[];
}

/**
 * Número que veio de `jsonb`, ou o substituto.
 *
 * Medições restauradas de uma consulta antiga chegam por um cast não validado em
 * `encounter-viewer.ts`, então um campo pode simplesmente não existir. Deixar
 * `undefined` vazar viraria `undefined` em conta aritmética — o algoritmo receberia
 * `NaN` sem saber de onde veio. Aqui a ausência vira um valor explícito.
 */
function numeroOu(valor: unknown, ausente: number): number {
  return typeof valor === 'number' ? valor : ausente;
}

function toJoint(roi: JointRoi): AlgorithmJoint {
  // O tipo promete os campos; uma medição restaurada de `jsonb` pode não tê-los.
  const stats: Partial<RoiStats> = roi.stats ?? {};
  return {
    key: roi.key,
    side: roi.side,
    landmarkId: roi.landmarkId,
    label: roi.label,
    // Temperatura ausente é NaN, e não zero: 0 °C é uma leitura possível, e
    // confundir "não medido" com "muito frio" é o tipo de erro que não aparece.
    mean: numeroOu(stats.mean, NaN),
    median: numeroOu(stats.median, NaN),
    max: numeroOu(stats.max, NaN),
    min: numeroOu(stats.min, NaN),
    // Cobertura ausente vira 0: o algoritmo que filtra por confiabilidade deve
    // descartar a medição, não confiar nela por omissão.
    skinCoverage: numeroOu(roi.skinCoverage, 0),
    sampleCount: numeroOu(stats.count, 0),
  };
}

/** Monta a entrada. Os frames saem ordenados por tempo, com os sem tempo ao final. */
export function toAlgorithmInput(leitura: readonly ReadoutFrame[]): AlgorithmInput {
  const frames: AlgorithmFrame[] = leitura.map((frame) => ({
    captureIndex: frame.captureIndex,
    phase: frame.phase,
    timeSeconds: frame.timeSeconds,
    quality: {
      alignmentMethod: frame.alignmentMethod,
      agreementNormalized: frame.agreementNormalized,
      issue: frame.issue,
    },
    joints: frame.jointRois.map(toJoint),
  }));

  // A basal ordena em primeiro lugar com o seu 0, que não é um instante do eixo:
  // quem ajusta curva filtra por `phase`, não pela posição. Ver `AlgorithmFrame`.
  frames.sort((a, b) => (a.timeSeconds ?? Infinity) - (b.timeSeconds ?? Infinity));

  return { frames };
}
