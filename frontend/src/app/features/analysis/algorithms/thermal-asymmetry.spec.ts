import { AlgorithmFrame, AlgorithmInput, AlgorithmJoint } from './algorithm.model';
import { thermalAsymmetry } from './thermal-asymmetry';

function joint(
  side: AlgorithmJoint['side'],
  landmarkId: number,
  mean: number,
  skinCoverage = 0.9,
): AlgorithmJoint {
  return {
    key: `${side}:${landmarkId}`,
    side,
    landmarkId,
    label: landmarkId === 9 ? 'MCP 3' : `#${landmarkId}`,
    mean,
    median: mean,
    max: mean + 1,
    min: mean - 1,
    skinCoverage,
    sampleCount: 280,
  };
}

function frame(
  joints: readonly AlgorithmJoint[],
  timeSeconds: number | null = null,
): AlgorithmFrame {
  return {
    captureIndex: 0,
    phase: timeSeconds === null ? null : 'dynamic',
    timeSeconds,
    quality: { alignmentMethod: 'silhouette', agreementNormalized: 0.8, issue: null },
    joints,
  };
}

function input(frames: readonly AlgorithmFrame[]): AlgorithmInput {
  return {
    frames,
  };
}

describe('thermalAsymmetry — análise avulsa', () => {
  it('reports the largest difference and which hand is warmer', () => {
    const result = thermalAsymmetry.run(
      input([
        frame([
          joint('Esquerda', 9, 33.8),
          joint('Direita', 9, 32.4),
          joint('Esquerda', 5, 33.0),
          joint('Direita', 5, 32.8),
        ]),
      ]),
    );

    expect(result.status).toBe('ok');
    // Asserção sobre o número, e não sobre a frase: mudar a redação do resumo não
    // pode quebrar o teste da conta.
    expect(result.values[0].label).toBe('MCP 3');
    expect(result.values[0].value).toBeCloseTo(1.4, 5);
    expect(result.values[0].unit).toBe('°C');
    expect(result.summary).toContain('esquerda mais quente');
  });

  it('orders the table from the largest difference down', () => {
    const result = thermalAsymmetry.run(
      input([
        frame([
          joint('Esquerda', 5, 33.0),
          joint('Direita', 5, 32.8),
          joint('Esquerda', 9, 33.8),
          joint('Direita', 9, 32.4),
        ]),
      ]),
    );

    expect(result.values.map((v) => v.label)).toEqual(['MCP 3', '#5']);
  });

  it('reports symmetric hands as a near-zero difference, not as a failure', () => {
    const result = thermalAsymmetry.run(
      input([frame([joint('Esquerda', 9, 33), joint('Direita', 9, 33)])]),
    );

    expect(result.status).toBe('ok');
    expect(result.values[0].value).toBe(0);
  });

  it('cannot answer with a single hand, and says why', () => {
    const result = thermalAsymmetry.run(
      input([frame([joint('Esquerda', 9, 33), joint('Esquerda', 5, 32)])]),
    );

    expect(result.status).toBe('insufficient-data');
    expect(result.summary).toContain('sem par correspondente');
    expect(result.values).toEqual([]);
  });

  it('drops a pair whose skin coverage is too low, and counts it in the report', () => {
    const result = thermalAsymmetry.run(
      input([
        frame([
          joint('Esquerda', 9, 33.8),
          joint('Direita', 9, 32.4),
          joint('Esquerda', 5, 33.0, 0.1),
          joint('Direita', 5, 32.0),
        ]),
      ]),
    );

    expect(result.status).toBe('ok');
    expect(result.summary).toContain('1 descartado');
    // O par descartado não pode ter entrado nos números.
    expect(result.values.map((v) => v.label)).toEqual(['MCP 3']);
  });

  it('cannot answer when every pair is below the coverage threshold', () => {
    const result = thermalAsymmetry.run(
      input([frame([joint('Esquerda', 9, 33.8, 0.1), joint('Direita', 9, 32.4, 0.1)])]),
    );

    expect(result.status).toBe('insufficient-data');
    expect(result.summary).toContain('cobertura de pele');
  });

  it('ignores a measurement that has no temperature at all', () => {
    const result = thermalAsymmetry.run(
      input([frame([joint('Esquerda', 9, NaN), joint('Direita', 9, 32.4)])]),
    );

    expect(result.status).toBe('insufficient-data');
  });
});

describe('thermalAsymmetry — sequência carregada', () => {
  const sequencia = [
    frame([joint('Esquerda', 9, 33.8), joint('Direita', 9, 32.4)], 0),
    frame([joint('Esquerda', 9, 25), joint('Direita', 9, 21)], 15),
  ];

  it('uses only the first capture, and says so', () => {
    // O nome do algoritmo já avisa; o resumo repete para quem só lê o resultado.
    const result = thermalAsymmetry.run(input(sequencia));

    expect(result.status).toBe('ok');
    expect(result.summary).toContain('primeira captura');
    expect(result.summary).toContain('das 2 carregadas');
    // 1,4 é da primeira captura; 4 seria da segunda, que ele não usa.
    expect(result.values[0].value).toBeCloseTo(1.4, 5);
  });

  it('says nothing about the origin when there is only one capture', () => {
    const result = thermalAsymmetry.run(input([sequencia[0]]));

    expect(result.summary).not.toContain('primeira captura');
  });
});
