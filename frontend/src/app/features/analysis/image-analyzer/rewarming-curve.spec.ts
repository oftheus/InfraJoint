import { CurveFrame, CurveRoi, buildRewarmingSeries } from './rewarming-curve';

function roi(side: CurveRoi['side'], landmarkId: number, mean: number): CurveRoi {
  return { side, landmarkId, label: `#${landmarkId}`, stats: { mean, max: mean + 1, min: mean - 1 } };
}

describe('buildRewarmingSeries', () => {
  // Baseline at t0 warm, cold at Din01, rewarming by Din02 (MCP 3 = landmark 9).
  const frames: CurveFrame[] = [
    { timeSeconds: 0, kind: 'baseline', rois: [roi('Esquerda', 9, 32), roi('Direita', 9, 31.5)] },
    { timeSeconds: 15, kind: 'dynamic', rois: [roi('Esquerda', 9, 24), roi('Direita', 9, 23)] },
    { timeSeconds: 30, kind: 'dynamic', rois: [roi('Esquerda', 9, 27), roi('Direita', 9, 26)] },
  ];

  it('builds one series per side with the baseline at t₀', () => {
    const series = buildRewarmingSeries(frames, [9], 'mean');
    expect(series.map((s) => s.key)).toEqual(['Esquerda:9', 'Direita:9']);
    const left = series[0];
    expect(left.label).toBe('E MCP 3');
    expect(left.points.map((p) => p.timeSeconds)).toEqual([0, 15, 30]);
    expect(left.points.map((p) => p.value)).toEqual([32, 24, 27]);
    expect(left.baselineValue).toBe(32);
  });

  it('honors the selected statistic', () => {
    const series = buildRewarmingSeries(frames, [9], 'max');
    expect(series[0].points[0].value).toBe(33); // mean 32 + 1
  });

  it('turns missing joints into gaps (NaN) and drops absent hands', () => {
    const withHole: CurveFrame[] = [
      frames[0],
      { timeSeconds: 15, kind: 'dynamic', rois: [] }, // detection failed on Din01
      frames[2],
    ];
    const series = buildRewarmingSeries(withHole, [9], 'mean');
    expect(series).toHaveLength(2);
    expect(Number.isNaN(series[0].points[1].value)).toBe(true);

    // A hand that never appears yields no series at all.
    const leftOnly = frames.map((f) => ({ ...f, rois: f.rois.filter((r) => r.side === 'Esquerda') }));
    expect(buildRewarmingSeries(leftOnly, [9], 'mean').map((s) => s.side)).toEqual(['Esquerda']);
  });

  it('sorts frames by time regardless of input order', () => {
    const series = buildRewarmingSeries([frames[2], frames[0], frames[1]], [9], 'mean');
    expect(series[0].points.map((p) => p.timeSeconds)).toEqual([0, 15, 30]);
    expect(series[0].baselineValue).toBe(32);
  });
});
