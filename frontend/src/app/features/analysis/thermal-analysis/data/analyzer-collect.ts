/**
 * Lê o estado do analisador e produz o que a Fase 5 precisa: o corpo do POST e os
 * arquivos a subir, casados por captura e tipo.
 *
 * Recebe uma leitura estrutural, não o componente — assim é testável sem montar as
 * 1251 linhas da página, e a página não precisa saber que isto existe.
 */

import {
  AlignmentMethod,
  CaptureFilesPayload,
  captureFromSingle,
} from '../../image-analyzer/analysis-payload';
import { AffineMatrix, ThermalMatrix } from '../../image-analyzer/image-analyzer.model';
import { SilhouetteAgreement } from '../../image-analyzer/alignment-quality';
import { FiducialCorrection } from '../../image-analyzer/fiducial-markers';
import { JointRoi } from '../../image-analyzer/joint-rois';
import { AnalysisCreate, CaptureFileKind } from '../../../patients/data/patient.model';

/** O que o fluxo lê do analisador. Espelha os signais públicos da página. */
export interface AnalyzerReadout {
  readonly matrix: ThermalMatrix | null;
  readonly activeMatrix: AffineMatrix | null;
  readonly mode: 'auto' | 'manual';
  readonly autoMethod: AlignmentMethod | null;
  readonly agreement: SilhouetteAgreement | null;
  readonly correction: FiducialCorrection | null;
  readonly jointRois: readonly JointRoi[];
  readonly opticalFile: File | null;
  readonly thermalFile: File | null;
  readonly matrixFile: File | null;
}

/** Chave que casa uma URL assinada com o arquivo dela. */
export function uploadKey(captureIndex: number, kind: CaptureFileKind): string {
  return `${captureIndex}:${kind}`;
}

export interface CollectedAnalysis {
  readonly payload: AnalysisCreate;
  readonly files: ReadonlyMap<string, File>;
}

/** Uma captura da sequência, já processada, com as ROIs que a curva desenhou. */
export interface SequenceReadout {
  readonly index: number;
  readonly kind: 'baseline' | 'dynamic';
  readonly label: string;
  readonly timeSeconds: number;
  readonly matrix: ThermalMatrix;
  readonly alignment: AffineMatrix | null;
  readonly autoMethod: AlignmentMethod | null;
  readonly agreement: SilhouetteAgreement | null;
  readonly correction: FiducialCorrection | null;
  readonly issue: string | null;
  readonly jointRois: readonly JointRoi[];
  readonly opticalFile: File;
  readonly thermalFile: File;
  readonly matrixFile: File;
}

/**
 * Monta a análise em sequência.
 *
 * Não é um segundo fluxo: cada captura vira o mesmo `CapturePayload` da avulsa, só
 * que com posição preenchida. É a mesma decisão do banco, que não tem discriminador
 * `single`/`sequence` — a cardinalidade É a diferença.
 *
 * Uma captura que falhou no processamento entra assim mesmo, com `issue` preenchido e
 * medições vazias. Descartá-la esconderia por que a curva tem um buraco.
 */
export function collectSequenceAnalysis(
  capturas: readonly SequenceReadout[],
): CollectedAnalysis | null {
  if (capturas.length === 0) {
    return null;
  }

  const arquivos = new Map<string, File>();
  const payloads = capturas.map((captura) => {
    const declarados: Record<string, { size: number; content_type: string }> = {};
    const candidatos: readonly [CaptureFileKind, File][] = [
      ['optical', captura.opticalFile],
      ['thermal', captura.thermalFile],
      ['matrix', captura.matrixFile],
    ];
    for (const [kind, file] of candidatos) {
      declarados[kind] = {
        size: file.size,
        content_type: file.type || 'application/octet-stream',
      };
      arquivos.set(uploadKey(captura.index, kind), file);
    }

    const alinhamento = captura.alignment;
    return {
      capture_index: captura.index,
      phase: captura.kind,
      label: captura.label,
      elapsed_seconds: captura.timeSeconds,

      align_a: alinhamento?.a ?? null,
      align_b: alinhamento?.b ?? null,
      align_tx: alinhamento?.tx ?? null,
      align_c: alinhamento?.c ?? null,
      align_d: alinhamento?.d ?? null,
      align_ty: alinhamento?.ty ?? null,
      alignment_method: captura.autoMethod,

      agreement: captura.agreement,
      fiducial_correction: captura.correction,
      measurements: captura.jointRois,
      issue: captura.issue,
      files: declarados,
    } as unknown as Record<string, unknown>;
  });

  return { payload: { captures: payloads }, files: arquivos };
}

/**
 * Monta a análise avulsa, ou `null` quando não há o que gravar.
 *
 * Sem matriz ou sem alinhamento não existe medição — e gravar uma análise vazia
 * deixaria a consulta presa em `analysis_status='uploading'` para sempre.
 */
export function collectSingleAnalysis(readout: AnalyzerReadout): CollectedAnalysis | null {
  if (!readout.matrix || !readout.activeMatrix) {
    return null;
  }

  const arquivos = new Map<string, File>();
  const declarados: Record<string, { size: number; content_type: string }> = {};
  const candidatos: readonly [CaptureFileKind, File | null][] = [
    ['optical', readout.opticalFile],
    ['thermal', readout.thermalFile],
    ['matrix', readout.matrixFile],
  ];
  for (const [kind, file] of candidatos) {
    if (file) {
      declarados[kind] = {
        size: file.size,
        // Precisa ser o mesmo que o backend assina e o browser envia; divergir dá 403.
        content_type: file.type || 'application/octet-stream',
      };
      arquivos.set(uploadKey(0, kind), file);
    }
  }
  if (arquivos.size === 0) {
    return null;
  }

  const [captura] = captureFromSingle({
    matrix: readout.matrix,
    alignment: readout.activeMatrix,
    mode: readout.mode,
    autoMethod: readout.autoMethod,
    agreement: readout.agreement,
    correction: readout.correction,
    jointRois: readout.jointRois,
    files: declarados as CaptureFilesPayload,
  });

  return {
    payload: { captures: [captura as unknown as Record<string, unknown>] },
    files: arquivos,
  };
}
