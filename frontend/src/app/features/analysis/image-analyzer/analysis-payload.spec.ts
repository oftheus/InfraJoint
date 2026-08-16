import {
  CapturePosition,
  CaptureSource,
  RoiStatsFn,
  captureFromSequence,
  captureFromSingle,
} from './analysis-payload';
import { AffineMatrix, ThermalMatrix } from './image-analyzer.model';
import { JointRoi } from './joint-rois';

const IDENTIDADE: AffineMatrix = { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 };

const MATRIZ: ThermalMatrix = { width: 640, height: 480, values: new Float64Array(1) };

/** Cálculo trivial: o módulo é testado, não o roi-stats (que tem spec próprio). */
const stats: RoiStatsFn = () => ({
  mean: 33.5,
  median: 33.4,
  max: 34.2,
  min: 32.1,
  area: 100,
  count: 98,
});

function jointRoi(label: string): JointRoi {
  return {
    side: 'Direita',
    landmarkId: 0,
    label,
    key: `Direita:0`,
    rgb: { x: 10, y: 10 },
    csv: { x: 5, y: 5 },
    shape: 'circle',
    rxCsv: 10,
    ryCsv: 10,
    stats: { mean: 33, median: 33, max: 34, min: 32, area: 80, count: 78 },
    skinCoverage: 0.9,
    edited: false,
  } as JointRoi;
}

function source(overrides: Partial<CaptureSource> = {}): CaptureSource {
  return {
    matrix: MATRIZ,
    alignment: IDENTIDADE,
    mode: 'auto',
    autoMethod: 'silhouette',
    agreement: null,
    correction: null,
    jointRois: [jointRoi('Punho')],
    rois: [],
    files: { optical: { size: 100 }, thermal: { size: 200 }, matrix: { size: 300 } },
    ...overrides,
  };
}

function posicao(i: number): CapturePosition {
  return {
    captureIndex: i,
    phase: i === 0 ? 'baseline' : 'dynamic',
    label: i === 0 ? 'Base' : `Din ${i}`,
    elapsedSeconds: i * 30,
  };
}

describe('analysis-payload', () => {
  // O teste que o plano pede: N=1 e N=21 no MESMO teste, para provar que avulsa e
  // sequência não são dois fluxos — a diferença é só a cardinalidade.
  it.each([1, 21])('serializa %i captura(s) pelo mesmo caminho', (n) => {
    const capturas = captureFromSequence(
      Array.from({ length: n }, (_, i) => ({ source: source(), position: posicao(i) })),
      stats,
    );

    expect(capturas).toHaveLength(n);
    expect(capturas.map((c) => c.capture_index)).toEqual([...Array(n).keys()]);
    expect(capturas.filter((c) => c.phase === 'baseline')).toHaveLength(1);
    expect(capturas.every((c) => c.alignment_method === 'silhouette')).toBe(true);
  });

  it('avulsa é uma sequência de um elemento, com posição nula', () => {
    const [captura] = captureFromSingle(source(), stats);

    // O banco precisa distinguir "não sei em que fase" de "é basal".
    expect(captura.phase).toBeNull();
    expect(captura.label).toBeNull();
    expect(captura.elapsed_seconds).toBeNull();
    expect(captura.capture_index).toBe(0);
  });

  it('achata a afim nas seis colunas de alinhamento', () => {
    const [captura] = captureFromSingle(
      source({ alignment: { a: 0.5, b: 0.1, tx: 3, c: -0.1, d: 0.5, ty: 7 } }),
      stats,
    );

    expect({
      a: captura.align_a,
      b: captura.align_b,
      tx: captura.align_tx,
      c: captura.align_c,
      d: captura.align_d,
      ty: captura.align_ty,
    }).toEqual({ a: 0.5, b: 0.1, tx: 3, c: -0.1, d: 0.5, ty: 7 });
  });

  it('modo manual registra o método como manual, não o automático anterior', () => {
    const [auto] = captureFromSingle(source({ mode: 'auto', autoMethod: 'fiducial' }), stats);
    const [manual] = captureFromSingle(source({ mode: 'manual', autoMethod: 'fiducial' }), stats);

    expect(auto.alignment_method).toBe('fiducial');
    expect(manual.alignment_method).toBe('manual');
  });

  it('grava as ROIs manuais como NÚMERO, não como string formatada', () => {
    const [captura] = captureFromSingle(
      source({ rois: [{ id: 1, shape: 'circle', cx: 100, cy: 80, rx: 20, ry: 20 }] }),
      stats,
    );

    const [roi] = captura.manual_rois;
    // A armadilha que o plano aponta: `roiResults()` formata com formatCelsius e
    // devolveria '33.5 °C'. Gravar string tornaria o dado inútil para cálculo.
    expect(typeof roi.mean).toBe('number');
    expect(roi.mean).toBe(33.5);
    expect(roi).toMatchObject({ id: 1, shape: 'circle', csv_x: 100, csv_y: 80 });
  });

  it('não perde ROI manual quando há várias', () => {
    const [captura] = captureFromSingle(
      source({
        rois: [
          { id: 1, shape: 'circle', cx: 10, cy: 10, rx: 5, ry: 5 },
          { id: 2, shape: 'ellipse', cx: 20, cy: 30, rx: 8, ry: 4 },
        ],
      }),
      stats,
    );

    expect(captura.manual_rois.map((r) => r.id)).toEqual([1, 2]);
    expect(captura.manual_rois[1].shape).toBe('ellipse');
  });

  it('passa as medições articulares adiante sem transformar', () => {
    const rois = [jointRoi('Punho'), jointRoi('MCP 1')];
    const [captura] = captureFromSingle(source({ jointRois: rois }), stats);

    // `measurements` é gravado como veio do domínio: JointRoi[] já é a forma.
    expect(captura.measurements).toBe(rois);
  });

  it('mantém nulos quando não houve concordância nem correção fiducial', () => {
    const [captura] = captureFromSingle(source(), stats);
    expect(captura.agreement).toBeNull();
    expect(captura.fiducial_correction).toBeNull();
  });
});
