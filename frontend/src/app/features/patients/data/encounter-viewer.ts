/**
 * Monta, a partir do que foi gravado, as capturas que o analisador consome.
 *
 * A consulta reaberta **é** a tela do analisador — não uma cópia dela. Este módulo
 * só traduz: baixa os arquivos do bucket, decodifica a matriz e devolve
 * `SequenceCapture[]` no formato que `ImageAnalyzerPage.restoreAnalysis()` espera.
 *
 * O que NÃO acontece aqui é tão importante quanto o que acontece: nada é
 * redetectado e nada é realinhado. A afim e as medições vêm do banco, e é isso que
 * faz a consulta reaberta mostrar os números do dia em que foi feita.
 */

import { imageToThumbnail, loadImage } from '../../analysis/image-analyzer/dom-images';
import { JointRoi } from '../../analysis/image-analyzer/joint-rois';
import { SequenceCapture } from '../../analysis/image-analyzer/sequence.model';
import { decodeThermalCsv, parseThermalCsv } from '../../analysis/image-analyzer/thermal-csv';
import { ThermalMatrix } from '../../analysis/image-analyzer/image-analyzer.model';
import { alignmentOf } from './encounter-reconstruct';
import { CaptureDetail } from './patient.model';

/** Mesma largura que o analisador usa ao processar uma sequência. */
const THUMBNAIL_WIDTH = 96;

/** Matriz vazia para capturas cujo CSV não voltou: o analisador trata width 0. */
const MATRIZ_VAZIA: ThermalMatrix = { width: 0, height: 0, values: new Float64Array(0) };

async function baixarArquivo(url: string, nome: string, tipo: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], nome, { type: tipo });
}

/**
 * Baixa e converte uma captura gravada.
 *
 * Devolve `null` quando a foto óptica não está disponível — sem ela não há o que
 * mostrar, e o analisador exige um `HTMLImageElement` de base.
 */
async function restaurarCaptura(detail: CaptureDetail): Promise<SequenceCapture | null> {
  const optical = detail.files['optical']?.url;
  const thermal = detail.files['thermal']?.url;
  if (!optical || !thermal) {
    return null;
  }

  const [opticalFile, thermalFile] = await Promise.all([
    baixarArquivo(optical, `c${detail.capture_index}_DAR.jpeg`, 'image/jpeg'),
    baixarArquivo(thermal, `c${detail.capture_index}_IR.jpeg`, 'image/jpeg'),
  ]);

  let matrix = MATRIZ_VAZIA;
  let matrixFile = new File([], `c${detail.capture_index}.csv`, { type: 'text/csv' });
  const matrixUrl = detail.files['matrix']?.url;
  if (matrixUrl) {
    matrixFile = await baixarArquivo(matrixUrl, matrixFile.name, 'text/csv');
    matrix = parseThermalCsv(decodeThermalCsv(await matrixFile.arrayBuffer()));
  }

  return {
    // `phase` é nulo na análise avulsa — o banco distingue "não sei" de "é basal".
    // A curva não aceita nulo, e uma captura solta é dinâmica para efeito de série.
    kind: detail.phase ?? 'dynamic',
    index: detail.capture_index,
    label: detail.label ?? '',
    timeSeconds: detail.elapsed_seconds ?? 0,
    optical: opticalFile,
    thermal: thermalFile,
    matrixFile,
    matrix,
    alignment: alignmentOf(detail),
    autoMethod: detail.alignment_method,
    agreement: detail.agreement as SequenceCapture['agreement'],
    correction: detail.fiducial_correction as SequenceCapture['correction'],
    // Landmarks não são persistidos, e não precisam ser: `restoredJoints` já é o
    // resultado deles. O analisador prefere as gravadas quando existem.
    hands: [],
    skinMask: null,
    // A miniatura não é persistida — é elemento de UI, não dado clínico. Sai da
    // própria térmica baixada, com a mesma largura que o analisador usa.
    thumbnail: imageToThumbnail(await loadImage(thermalFile), THUMBNAIL_WIDTH),
    jointOverrides: new Map(),
    issue: detail.issue,
    // `null` quando nada foi medido — e não um array vazio. A ausência de medições
    // não é "zero articulações": um array vazio tem precedência sobre os landmarks
    // e deixava "Detectar articulações" sem efeito nenhum na consulta reaberta,
    // justamente no caso em que ela é a única forma de ver ROI articular.
    restoredJoints:
      detail.measurements.length > 0
        ? (detail.measurements as unknown as readonly JointRoi[])
        : null,
  };
}

/** Converte todas as capturas da consulta, na ordem em que foram gravadas. */
export async function restoreCaptures(
  captures: readonly CaptureDetail[],
): Promise<readonly SequenceCapture[]> {
  const restauradas = await Promise.all(captures.map((c) => restaurarCaptura(c)));
  return restauradas.filter((c): c is SequenceCapture => c !== null);
}
