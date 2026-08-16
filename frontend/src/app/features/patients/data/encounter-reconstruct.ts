/**
 * Tradução do que foi gravado para o que o analisador consome.
 *
 * O alinhamento e as ROIs manuais: a composição da sobreposição, a curva e as ROIs
 * articulares voltaram a ser responsabilidade da própria `ImageAnalyzerPage`, que a
 * consulta reaberta agora reusa em vez de imitar.
 */

import {
  AffineMatrix,
  RoiSelection,
  RoiShape,
} from '../../analysis/image-analyzer/image-analyzer.model';
import { CaptureDetail } from './patient.model';

/**
 * A afim RGB→CSV gravada, ou `null` quando a captura não chegou a alinhar.
 *
 * Vir do banco é o ponto: sem isto a consulta reaberta teria que realinhar, e duas
 * aberturas da mesma consulta poderiam mostrar números diferentes.
 */
export function alignmentOf(capture: CaptureDetail): AffineMatrix | null {
  const { align_a, align_b, align_tx, align_c, align_d, align_ty } = capture;
  if (
    align_a === null ||
    align_b === null ||
    align_tx === null ||
    align_c === null ||
    align_d === null ||
    align_ty === null
  ) {
    return null;
  }
  return { a: align_a, b: align_b, tx: align_tx, c: align_c, d: align_d, ty: align_ty };
}

/**
 * As ROIs manuais gravadas, ou `null` quando a captura não teve nenhuma.
 *
 * Só a geometria volta — id, forma, centro e raios, todos em pixels da foto óptica,
 * exatamente como foram desenhados. As temperaturas gravadas ao lado não são lidas
 * de propósito: a página as recalcula da matriz, e conferir dois números que deviam
 * ser iguais é como se descobre que o alinhamento mudou.
 *
 * Uma ROI com campo faltando ou fora de tipo é descartada, e não derruba as outras:
 * o jsonb não tem esquema, e uma linha antiga não deve custar as ROIs boas.
 */
export function manualRoisOf(capture: CaptureDetail): readonly RoiSelection[] | null {
  const rois: RoiSelection[] = [];
  for (const bruto of capture.manual_rois) {
    const { id, shape, cx, cy, rx, ry } = bruto as Record<string, unknown>;
    if (
      typeof id === 'number' &&
      (shape === 'circle' || shape === 'ellipse') &&
      isFiniteNumber(cx) &&
      isFiniteNumber(cy) &&
      isFiniteNumber(rx) &&
      isFiniteNumber(ry)
    ) {
      rois.push({ id, shape: shape as RoiShape, cx, cy, rx, ry });
    }
  }
  return rois.length > 0 ? rois : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
