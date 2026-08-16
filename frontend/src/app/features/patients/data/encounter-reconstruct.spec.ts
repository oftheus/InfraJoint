import { CaptureDetail } from './patient.model';
import { alignmentOf, manualRoisOf } from './encounter-reconstruct';

function captura(partial: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    id: 'c1',
    capture_index: 0,
    phase: 'baseline',
    label: 'Base',
    elapsed_seconds: 0,
    align_a: 0.5,
    align_b: 0,
    align_tx: 3,
    align_c: 0,
    align_d: 0.5,
    align_ty: 7,
    alignment_method: 'silhouette',
    agreement_normalized: 0.87,
    agreement: null,
    fiducial_correction: null,
    measurements: [],
    manual_rois: [],
    issue: null,
    files: {},
    ...partial,
  };
}

describe('alignmentOf', () => {
  it('remonta a afim gravada, que é o que evita realinhar ao reabrir', () => {
    expect(alignmentOf(captura())).toEqual({ a: 0.5, b: 0, tx: 3, c: 0, d: 0.5, ty: 7 });
  });

  it('devolve null quando a captura não chegou a alinhar', () => {
    // Basta um componente ausente: uma afim pela metade seria pior que nenhuma.
    expect(alignmentOf(captura({ align_a: null }))).toBeNull();
    expect(alignmentOf(captura({ align_ty: null }))).toBeNull();
  });
});

describe('manualRoisOf', () => {
  const desenhada = { id: 1, shape: 'circle', cx: 100, cy: 80, rx: 20, ry: 20 };

  it('devolve só a geometria — a temperatura é recalculada da matriz', () => {
    const rois = manualRoisOf(captura({ manual_rois: [{ ...desenhada, mean: 34.1, csv_x: 53 }] }))!;
    expect(rois).toEqual([{ id: 1, shape: 'circle', cx: 100, cy: 80, rx: 20, ry: 20 }]);
  });

  it('distingue captura sem ROI manual de lista vazia', () => {
    // `null` é o que faz a página não mexer nas ROIs; `[]` seria "apague as que há".
    expect(manualRoisOf(captura())).toBeNull();
  });

  it('descarta ROI malformada sem levar as boas junto', () => {
    const rois = manualRoisOf(
      captura({
        manual_rois: [desenhada, { id: 2, shape: 'circle', cx: null, cy: 1, rx: 1, ry: 1 }],
      }),
    )!;
    expect(rois.map((roi) => roi.id)).toEqual([1]);
  });
});
