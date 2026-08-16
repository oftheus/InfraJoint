import {
  AnalyzerReadout,
  SequenceReadout,
  collectSequenceAnalysis,
  collectSingleAnalysis,
  uploadKey,
} from './analyzer-collect';

function arquivo(nome: string, tipo: string): File {
  return new File(['conteúdo'], nome, { type: tipo });
}

function readout(overrides: Partial<AnalyzerReadout> = {}): AnalyzerReadout {
  return {
    matrix: { width: 640, height: 480, values: new Float64Array(1) },
    activeMatrix: { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
    mode: 'auto',
    autoMethod: 'silhouette',
    agreement: null,
    correction: null,
    jointRois: [],
    opticalFile: arquivo('v.jpeg', 'image/jpeg'),
    thermalFile: arquivo('t.jpeg', 'image/jpeg'),
    matrixFile: arquivo('m.csv', 'text/csv'),
    ...overrides,
  };
}

describe('collectSingleAnalysis', () => {
  it('declara os três arquivos e devolve o mapa para casar com as URLs', () => {
    const coletado = collectSingleAnalysis(readout())!;

    expect(coletado.payload.captures).toHaveLength(1);
    const captura = coletado.payload.captures[0] as Record<string, unknown>;
    expect(Object.keys(captura['files'] as object).sort()).toEqual([
      'matrix',
      'optical',
      'thermal',
    ]);
    expect([...coletado.files.keys()].sort()).toEqual([
      uploadKey(0, 'matrix'),
      uploadKey(0, 'optical'),
      uploadKey(0, 'thermal'),
    ]);
  });

  it('declara o content_type do próprio arquivo', () => {
    // Precisa bater com o que o backend assina; divergir faz o R2 responder 403.
    const coletado = collectSingleAnalysis(readout())!;
    const files = (coletado.payload.captures[0] as Record<string, unknown>)['files'] as Record<
      string,
      { content_type: string }
    >;
    expect(files['matrix'].content_type).toBe('text/csv');
    expect(files['optical'].content_type).toBe('image/jpeg');
  });

  it('omite o arquivo que não foi carregado', () => {
    const coletado = collectSingleAnalysis(readout({ thermalFile: null }))!;
    expect(coletado.files.has(uploadKey(0, 'thermal'))).toBe(false);
    expect(coletado.files.size).toBe(2);
  });

  it('devolve null sem alinhamento — não há medição a gravar', () => {
    // Gravar assim deixaria a consulta presa em analysis_status='uploading'.
    expect(collectSingleAnalysis(readout({ activeMatrix: null }))).toBeNull();
    expect(collectSingleAnalysis(readout({ matrix: null }))).toBeNull();
  });

  it('devolve null quando nenhum arquivo foi carregado', () => {
    const vazio = readout({ opticalFile: null, thermalFile: null, matrixFile: null });
    expect(collectSingleAnalysis(vazio)).toBeNull();
  });

  it('a captura avulsa não tem posição na sequência', () => {
    const captura = collectSingleAnalysis(readout())!.payload.captures[0] as Record<
      string,
      unknown
    >;
    expect(captura['capture_index']).toBe(0);
    expect(captura['phase']).toBeNull();
    expect(captura['elapsed_seconds']).toBeNull();
  });
});

function captura(index: number, overrides: Partial<SequenceReadout> = {}): SequenceReadout {
  return {
    index,
    kind: index === 0 ? 'baseline' : 'dynamic',
    label: index === 0 ? 'Est' : `Din${String(index).padStart(2, '0')}`,
    timeSeconds: index * 15,
    matrix: { width: 640, height: 480, values: new Float64Array(1) },
    alignment: { a: 0.5, b: 0, tx: 1, c: 0, d: 0.5, ty: 2 },
    autoMethod: 'silhouette',
    agreement: null,
    correction: null,
    issue: null,
    jointRois: [],
    opticalFile: arquivo(`v${index}.jpeg`, 'image/jpeg'),
    thermalFile: arquivo(`t${index}.jpeg`, 'image/jpeg'),
    matrixFile: arquivo(`m${index}.csv`, 'text/csv'),
    ...overrides,
  };
}

describe('collectSequenceAnalysis', () => {
  it('N capturas viram N payloads, sem discriminador', () => {
    const coletado = collectSequenceAnalysis(Array.from({ length: 21 }, (_, i) => captura(i)))!;

    expect(coletado.payload.captures).toHaveLength(21);
    // Três arquivos por captura, casados por índice com as URLs assinadas.
    expect(coletado.files.size).toBe(63);
    expect(coletado.files.get(uploadKey(7, 'matrix'))!.name).toBe('m7.csv');
  });

  it('preserva a posição de cada captura na sequência', () => {
    const coletado = collectSequenceAnalysis([captura(0), captura(1), captura(2)])!;
    const fases = coletado.payload.captures.map((c) => (c as Record<string, unknown>)['phase']);
    const tempos = coletado.payload.captures.map(
      (c) => (c as Record<string, unknown>)['elapsed_seconds'],
    );

    // Exatamente uma basal — o banco cobra isso com índice parcial único.
    expect(fases).toEqual(['baseline', 'dynamic', 'dynamic']);
    expect(tempos).toEqual([0, 15, 30]);
  });

  it('grava a captura que falhou, com o motivo, em vez de descartá-la', () => {
    // Descartar esconderia por que a curva tem um buraco.
    const quebrada = captura(3, { alignment: null, autoMethod: null, issue: 'sem alinhamento' });
    const coletado = collectSequenceAnalysis([captura(0), quebrada])!;

    const registro = coletado.payload.captures[1] as Record<string, unknown>;
    expect(registro['issue']).toBe('sem alinhamento');
    expect(registro['align_a']).toBeNull();
    expect(registro['alignment_method']).toBeNull();
    // Os arquivos dela sobem assim mesmo — o dado bruto continua sendo o dado bruto.
    expect(coletado.files.has(uploadKey(3, 'optical'))).toBe(true);
  });

  it('as medições vêm prontas, não recalculadas', () => {
    const rois = [{ key: 'Direita:0', label: 'Punho' }] as never;
    const coletado = collectSequenceAnalysis([captura(0, { jointRois: rois })])!;

    // São as mesmas que a curva desenhou; recalcular abriria espaço para o
    // prontuário mostrar número diferente do que o médico viu.
    expect((coletado.payload.captures[0] as Record<string, unknown>)['measurements']).toBe(rois);
  });

  it('sequência vazia não vira análise', () => {
    expect(collectSequenceAnalysis([])).toBeNull();
  });
});
