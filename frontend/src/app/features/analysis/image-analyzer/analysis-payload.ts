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

import { AffineMatrix, AlignmentMode, ThermalMatrix } from './image-analyzer.model';
import { SilhouetteAgreement } from './alignment-quality';
import { FiducialCorrection } from './fiducial-markers';
import { JointRoi } from './joint-rois';

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
  readonly files: CaptureFilesPayload;
}

/** Onde a captura fica na sequência. Tudo nulo na avulsa. */
export interface CapturePosition {
  readonly captureIndex: number;
  readonly phase: CapturePhase | null;
  readonly label: string | null;
  readonly elapsedSeconds: number | null;
}

/** Constrói uma captura. É o caminho único: avulsa e sequência passam por aqui. */
export function captureFrom(source: CaptureSource, position: CapturePosition): CapturePayload {
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
    files: source.files,
  };
}

/**
 * Análise avulsa: uma captura só, sem posição na sequência.
 *
 * `phase` nulo é significativo — uma captura solta pode ser basal, pós-estresse
 * ou teste de bancada, e o banco precisa distinguir isso de "é basal".
 */
export function captureFromSingle(source: CaptureSource): CapturePayload[] {
  return [captureFrom(source, { captureIndex: 0, phase: null, label: null, elapsedSeconds: null })];
}

/** Sequência: N capturas, a primeira basal e as demais dinâmicas. */
export function captureFromSequence(
  sources: readonly { readonly source: CaptureSource; readonly position: CapturePosition }[],
): CapturePayload[] {
  return sources.map(({ source, position }) => captureFrom(source, position));
}
