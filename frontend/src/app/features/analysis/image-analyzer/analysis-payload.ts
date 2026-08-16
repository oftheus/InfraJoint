/**
 * Serialização de uma análise de imagens para o contrato da API clínica.
 *
 * Módulo puro, **fora** da página do analisador: ele recebe valores já lidos dos
 * signals e devolve o payload. É o que permite testá-lo sem montar 1251 linhas de
 * componente, e é o que impede a página de crescer mais um pedaço.
 *
 * **Avulsa e sequência não são dois fluxos.** A diferença entre elas é a
 * *cardinalidade* do array de capturas — uma avulsa é uma sequência de um
 * elemento, com `phase`, `label` e `elapsedSeconds` nulos. É a mesma decisão que
 * o banco toma ao não ter discriminador `single`/`sequence`, e a razão de
 * `captureFromSingle` e `captureFromSequence` desembocarem na mesma função.
 *
 * Este módulo **não** persiste nada nem conhece HTTP. Quem grava é o fluxo de
 * Análise Térmica; a tela solta do analisador continua sem caminho até a API.
 */

import {
  AffineMatrix,
  AlignmentMode,
  RoiSelection,
  RoiShape,
  ThermalMatrix,
} from './image-analyzer.model';
import { SilhouetteAgreement } from './alignment-quality';
import { FiducialCorrection } from './fiducial-markers';
import { JointRoi } from './joint-rois';
import { RoiStats } from './image-analyzer.model';

/** Como o alinhamento foi obtido. Espelha o check de `alignment_method`. */
export type AlignmentMethod = 'silhouette' | 'fiducial' | 'manual';

/** Posição da captura numa sequência. Nula na análise avulsa. */
export type CapturePhase = 'baseline' | 'dynamic';

/** Arquivos declarados no POST — tipo e tamanho, não conteúdo. */
export interface CaptureFilesPayload {
  readonly optical?: { readonly size: number };
  readonly thermal?: { readonly size: number };
  readonly matrix?: { readonly size: number };
}

/** Uma ROI manual com números — nunca as strings formatadas de `roiResults()`. */
export interface ManualRoiPayload {
  readonly id: number;
  readonly shape: RoiShape;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly csv_x: number;
  readonly csv_y: number;
  readonly mean: number;
  readonly median: number;
  readonly max: number;
  readonly min: number;
}

/** O corpo de uma captura no `POST /encounters/{id}/captures`. */
export interface CapturePayload {
  readonly capture_index: number;
  readonly phase: CapturePhase | null;
  readonly label: string | null;
  readonly elapsed_seconds: number | null;

  readonly align_a: number;
  readonly align_b: number;
  readonly align_tx: number;
  readonly align_c: number;
  readonly align_d: number;
  readonly align_ty: number;
  /**
   * Como o alinhamento foi obtido. Não há um `alignment_mode` ao lado: 'manual' já é
   * um dos valores daqui, e a segunda coluna só podia discordar desta.
   */
  readonly alignment_method: AlignmentMethod | null;

  readonly agreement: SilhouetteAgreement | null;
  readonly fiducial_correction: FiducialCorrection | null;

  readonly measurements: readonly JointRoi[];
  readonly manual_rois: readonly ManualRoiPayload[];
  readonly files: CaptureFilesPayload;
}

/** Estado de uma captura, lido dos signals da página. */
export interface CaptureSource {
  readonly matrix: ThermalMatrix;
  readonly alignment: AffineMatrix;
  readonly mode: AlignmentMode;
  readonly autoMethod: AlignmentMethod | null;
  readonly agreement: SilhouetteAgreement | null;
  readonly correction: FiducialCorrection | null;
  readonly jointRois: readonly JointRoi[];
  readonly rois: readonly RoiSelection[];
  readonly files: CaptureFilesPayload;
}

/** Onde a captura fica na sequência. Tudo nulo na avulsa. */
export interface CapturePosition {
  readonly captureIndex: number;
  readonly phase: CapturePhase | null;
  readonly label: string | null;
  readonly elapsedSeconds: number | null;
}

/**
 * Calcula as estatísticas de uma ROI manual em coordenadas de matriz.
 *
 * Injetado como função em vez de importado de `roi-stats` para o módulo
 * continuar puro e o teste poder fornecer um cálculo trivial.
 */
export type RoiStatsFn = (
  matrix: ThermalMatrix,
  shape: RoiShape,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) => RoiStats;

/** Escala uniforme embutida na afim — a mesma que a página usa para as ROIs. */
function similarityScaleOf(m: AffineMatrix): number {
  return Math.hypot(m.a, m.c);
}

function applyAffine(m: AffineMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.b * y + m.tx, y: m.c * x + m.d * y + m.ty };
}

function toManualRois(source: CaptureSource, stats: RoiStatsFn): readonly ManualRoiPayload[] {
  const scale = similarityScaleOf(source.alignment);
  return source.rois.map((roi) => {
    const center = applyAffine(source.alignment, roi.cx, roi.cy);
    // `computeRoiStats` recebe raio já em células, como na página.
    const s = stats(source.matrix, roi.shape, center.x, center.y, roi.rx * scale, roi.ry * scale);
    return {
      id: roi.id,
      shape: roi.shape,
      cx: roi.cx,
      cy: roi.cy,
      rx: roi.rx,
      ry: roi.ry,
      csv_x: Math.round(center.x),
      csv_y: Math.round(center.y),
      // Números, não `formatCelsius`. `roiResults()` formata para a tela e
      // devolveria string — gravar isso tornaria o dado inútil para cálculo.
      mean: s.mean,
      median: s.median,
      max: s.max,
      min: s.min,
    };
  });
}

/** Constrói uma captura. É o caminho único: avulsa e sequência passam por aqui. */
export function captureFrom(
  source: CaptureSource,
  position: CapturePosition,
  stats: RoiStatsFn,
): CapturePayload {
  const { alignment } = source;
  return {
    capture_index: position.captureIndex,
    phase: position.phase,
    label: position.label,
    elapsed_seconds: position.elapsedSeconds,

    align_a: alignment.a,
    align_b: alignment.b,
    align_tx: alignment.tx,
    align_c: alignment.c,
    align_d: alignment.d,
    align_ty: alignment.ty,
    // No modo manual não há método automático a registrar.
    alignment_method: source.mode === 'manual' ? 'manual' : source.autoMethod,

    agreement: source.agreement,
    fiducial_correction: source.correction,

    // `JointRoi[]` já é exatamente a forma que o banco guarda em `measurements`:
    // 22 itens lidos sempre por inteiro, nunca uma articulação isolada.
    measurements: source.jointRois,
    manual_rois: toManualRois(source, stats),
    files: source.files,
  };
}

/**
 * Análise avulsa: uma captura só, sem posição na sequência.
 *
 * `phase` nulo é significativo — uma captura solta pode ser basal, pós-estresse
 * ou teste de bancada, e o banco precisa distinguir isso de "é basal".
 */
export function captureFromSingle(source: CaptureSource, stats: RoiStatsFn): CapturePayload[] {
  return [
    captureFrom(source, { captureIndex: 0, phase: null, label: null, elapsedSeconds: null }, stats),
  ];
}

/** Sequência: N capturas, a primeira basal e as demais dinâmicas. */
export function captureFromSequence(
  sources: readonly { readonly source: CaptureSource; readonly position: CapturePosition }[],
  stats: RoiStatsFn,
): CapturePayload[] {
  return sources.map(({ source, position }) => captureFrom(source, position, stats));
}
