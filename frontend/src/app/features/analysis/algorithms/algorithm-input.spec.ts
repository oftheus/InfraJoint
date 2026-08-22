import { JointRoi } from '../image-analyzer/joint-rois';
import { AlgorithmReadout, ReadoutFrame, toAlgorithmInput } from './algorithm-input';

function roi(side: JointRoi['side'], landmarkId: number, mean: number): JointRoi {
  return {
    side,
    landmarkId,
    label: `#${landmarkId}`,
    key: `${side}:${landmarkId}`,
    rgb: { x: 0, y: 0 },
    csv: { x: 0, y: 0 },
    shape: 'circle',
    rxCsv: 10,
    ryCsv: 10,
    stats: { mean, median: mean, max: mean + 1, min: mean - 1, area: 300, count: 280 },
    skinCoverage: 0.9,
    edited: false,
  };
}

function frame(overrides: Partial<ReadoutFrame> = {}): ReadoutFrame {
  return {
    captureIndex: 0,
    phase: null,
    timeSeconds: null,
    alignmentMethod: 'silhouette',
    agreementNormalized: 0.8,
    issue: null,
    jointRois: [roi('Esquerda', 9, 33)],
    ...overrides,
  };
}

function readout(frames: readonly ReadoutFrame[]): AlgorithmReadout {
  return { frames, subject: { ageYears: null, sex: null }, clinical: null };
}

describe('toAlgorithmInput', () => {
  it('turns a single analysis into one frame with no position in time', () => {
    const input = toAlgorithmInput(readout([frame()]));

    expect(input.schemaVersion).toBe(1);
    expect(input.frames).toHaveLength(1);
    expect(input.frames[0].phase).toBeNull();
    expect(input.frames[0].timeSeconds).toBeNull();
  });

  it('flattens each ROI into a joint, keeping the reliability fields', () => {
    const [joint] = toAlgorithmInput(readout([frame()])).frames[0].joints;

    expect(joint.key).toBe('Esquerda:9');
    expect(joint.mean).toBe(33);
    expect(joint.max).toBe(34);
    expect(joint.skinCoverage).toBe(0.9);
    expect(joint.sampleCount).toBe(280);
  });

  it('sorts frames by time even when they arrive out of order', () => {
    const input = toAlgorithmInput(
      readout([
        frame({ captureIndex: 2, timeSeconds: 30, phase: 'dynamic' }),
        frame({ captureIndex: 0, timeSeconds: 0, phase: 'baseline' }),
        frame({ captureIndex: 1, timeSeconds: 15, phase: 'dynamic' }),
      ]),
    );

    expect(input.frames.map((f) => f.timeSeconds)).toEqual([0, 15, 30]);
    expect(input.frames[0].phase).toBe('baseline');
  });

  it('keeps a failed capture as an empty frame instead of dropping it', () => {
    // Sumir com ela esconderia por que a sequência tem um buraco — mesma razão pela
    // qual `collectSequenceAnalysis` a mantém no que é gravado.
    const input = toAlgorithmInput(
      readout([
        frame({ captureIndex: 0, timeSeconds: 0, phase: 'baseline' }),
        frame({
          captureIndex: 1,
          timeSeconds: 15,
          phase: 'dynamic',
          jointRois: [],
          issue: 'alinhamento falhou',
          agreementNormalized: null,
        }),
      ]),
    );

    expect(input.frames).toHaveLength(2);
    expect(input.frames[1].joints).toEqual([]);
    expect(input.frames[1].quality.issue).toBe('alinhamento falhou');
  });

  it('replaces fields missing from a restored measurement instead of leaking undefined', () => {
    // Uma consulta gravada por versão anterior do analisador chega por um cast não
    // validado: o campo pode não existir, e `undefined` em conta viraria NaN sem rastro.
    const antiga = { ...roi('Direita', 5, 32) } as Record<string, unknown>;
    delete antiga['skinCoverage'];
    antiga['stats'] = { mean: 32 };

    const [joint] = toAlgorithmInput(
      readout([frame({ jointRois: [antiga as unknown as JointRoi] })]),
    ).frames[0].joints;

    expect(joint.skinCoverage).toBe(0);
    expect(joint.sampleCount).toBe(0);
    expect(Number.isNaN(joint.median)).toBe(true);
    expect(joint.mean).toBe(32);
  });
});
