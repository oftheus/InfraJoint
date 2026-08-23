import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import { HandSide } from '../../analysis/image-analyzer/image-analyzer.model';
import { JointRoi } from '../../analysis/image-analyzer/joint-rois';
import {
  capturaFinal,
  capturaReferencia,
  curvasPorMao,
  delta,
  idadeNaConsulta,
  larguraImagem,
  linhaDeQualidade,
  linhasDeMedicao,
  montarRelatorio,
  nomeDoArquivo,
  numero,
  quadrosDaCurva,
} from './encounter-report';
import { moduloPdfMake } from './encounter-report.service';
import { CaptureDetail, EncounterDetail, Patient } from './patient.model';

// --- Fixtures ---------------------------------------------------------------

function roi(side: HandSide, landmarkId: number, mean: number, label = 'Punho'): JointRoi {
  return {
    side,
    landmarkId,
    label,
    key: `${side}:${landmarkId}`,
    rgb: { x: 0, y: 0 },
    csv: { x: 0, y: 0 },
    shape: 'circle',
    rxCsv: 10,
    ryCsv: 10,
    stats: { mean, median: mean, max: mean + 1, min: mean - 1, area: 100, count: 90 },
    skinCoverage: 0.9,
    edited: false,
  };
}

function captura(partial: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    id: 'c1',
    capture_index: 0,
    phase: null,
    label: null,
    elapsed_seconds: null,
    align_a: 1,
    align_b: 0,
    align_tx: 0,
    align_c: 0,
    align_d: 1,
    align_ty: 0,
    alignment_method: 'silhouette',
    agreement_normalized: 0.8,
    agreement: null,
    fiducial_correction: null,
    measurements: [],
    issue: null,
    files: {},
    ...partial,
  };
}

const paciente: Patient = {
  id: 'p1',
  full_name: 'Maria Álvares Sá',
  birth_date: '1980-06-15',
  sex: 'F',
  phone: null,
  primary_diagnosis: 'Artrite reumatoide',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function consulta(partial: Partial<EncounterDetail> = {}): EncounterDetail {
  return {
    id: 'e1',
    patient_id: 'p1',
    patient: paciente,
    occurred_at: '2026-08-15T12:00:00Z',
    reason: 'Retorno',
    clinical_notes: null,
    joint_evaluations: null,
    scores: {},
    analysis_status: null,
    capture_count: 0,
    created_at: '2026-08-15T12:00:00Z',
    captures: [],
    ...partial,
  };
}

const recursos = {
  imagens: [],
  grafico: null,
  medico: 'Dra. Alice',
  emitidoEm: new Date('2026-08-22T10:00:00Z'),
};

/** Todo o texto do documento, para asserções de presença de seção. */
function textoDe(node: unknown): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textoDe).join(' ');
  }
  if (typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).map(textoDe).join(' ');
  }
  return '';
}

// --- Formatação -------------------------------------------------------------

describe('numero', () => {
  it('usa vírgula decimal', () => {
    expect(numero(32.5, 1)).toBe('32,5');
  });

  it('devolve n/d para medição ausente, e não zero', () => {
    expect(numero(NaN, 1)).toBe('n/d');
  });
});

describe('delta', () => {
  it('marca o sinal do aumento', () => {
    expect(delta(2.6)).toBe('+2,6');
    expect(delta(-1.2)).toBe('-1,2');
  });
});

describe('idadeNaConsulta', () => {
  it('conta a idade na data da consulta, não na de hoje', () => {
    expect(idadeNaConsulta('1980-06-15', '2026-08-15T12:00:00Z')).toBe(46);
  });

  it('não arredonda para cima antes do aniversário', () => {
    expect(idadeNaConsulta('1980-12-15', '2026-08-15T12:00:00Z')).toBe(45);
  });

  it('devolve nulo sem data de nascimento', () => {
    expect(idadeNaConsulta(null, '2026-08-15T12:00:00Z')).toBeNull();
  });
});

// --- Avulsa × sequência -----------------------------------------------------

describe('capturaReferencia e capturaFinal', () => {
  it('na avulsa, a única captura é a referência e não há final', () => {
    const captures = [captura()];
    expect(capturaReferencia(captures)?.id).toBe('c1');
    expect(capturaFinal(captures)).toBeNull();
  });

  it('na sequência, a basal é a referência e a mais tardia é a final', () => {
    const captures = [
      captura({ id: 'base', phase: 'baseline', elapsed_seconds: 0 }),
      captura({ id: 'd1', phase: 'dynamic', elapsed_seconds: 30 }),
      captura({ id: 'd2', phase: 'dynamic', elapsed_seconds: 600 }),
    ];
    expect(capturaReferencia(captures)?.id).toBe('base');
    expect(capturaFinal(captures)?.id).toBe('d2');
  });

  it('acha a final mesmo quando as capturas vêm fora de ordem', () => {
    const captures = [
      captura({ id: 'd2', phase: 'dynamic', elapsed_seconds: 600 }),
      captura({ id: 'base', phase: 'baseline', elapsed_seconds: 0 }),
      captura({ id: 'd1', phase: 'dynamic', elapsed_seconds: 30 }),
    ];
    expect(capturaReferencia(captures)?.id).toBe('base');
    expect(capturaFinal(captures)?.id).toBe('d2');
  });
});

describe('linhasDeMedicao', () => {
  it('na avulsa, não há final nem variação', () => {
    const ref = captura({ measurements: [roi('Esquerda', 0, 31)] as unknown as Record<string, unknown>[] });
    const linhas = linhasDeMedicao(ref, null);

    const punho = linhas.find((l) => l.side === 'Esquerda' && l.label === 'Punho');
    expect(punho?.mean).toBe(31);
    expect(punho?.min).toBe(30);
    expect(punho?.max).toBe(32);
    expect(Number.isNaN(punho?.finalMean ?? 0)).toBe(true);
    expect(Number.isNaN(punho?.variacao ?? 0)).toBe(true);
  });

  it('na sequência, calcula a variação entre basal e final', () => {
    const ref = captura({
      phase: 'baseline',
      measurements: [roi('Esquerda', 0, 31)] as unknown as Record<string, unknown>[],
    });
    const fim = captura({
      phase: 'dynamic',
      measurements: [roi('Esquerda', 0, 33.5)] as unknown as Record<string, unknown>[],
    });
    const punho = linhasDeMedicao(ref, fim).find((l) => l.label === 'Punho');

    expect(punho?.finalMean).toBe(33.5);
    expect(punho?.variacao).toBeCloseTo(2.5);
  });

  it('articulação ausente na final vira NaN, e não zero', () => {
    const ref = captura({ measurements: [roi('Esquerda', 0, 31)] as unknown as Record<string, unknown>[] });
    const fim = captura({ measurements: [] });
    const punho = linhasDeMedicao(ref, fim).find((l) => l.label === 'Punho');

    expect(Number.isNaN(punho?.finalMean ?? 0)).toBe(true);
    expect(Number.isNaN(punho?.variacao ?? 0)).toBe(true);
  });

  it('omite a mão que nunca apareceu, em vez de listar onze travessões', () => {
    const ref = captura({ measurements: [roi('Esquerda', 0, 31)] as unknown as Record<string, unknown>[] });
    const linhas = linhasDeMedicao(ref, null);

    expect(linhas.every((l) => l.side === 'Esquerda')).toBe(true);
    expect(linhas).toHaveLength(11);
  });

  it('sem captura de referência não há tabela', () => {
    expect(linhasDeMedicao(null, null)).toEqual([]);
  });
});

// --- Imagens ---

describe('larguraImagem', () => {
  it('divide a largura útil entre as imagens da fileira', () => {
    // 515 pt de largura útil, menos dois vãos de 12, divididos por três.
    expect(larguraImagem(3)).toBeCloseTo(163.67, 1);
  });

  it('não deixa uma imagem sozinha ocupar meia página', () => {
    expect(larguraImagem(1)).toBe(240);
  });

  it('devolve zero quando não há imagem', () => {
    expect(larguraImagem(0)).toBe(0);
  });
});

// --- Curva ------------------------------------------------------------------

describe('quadrosDaCurva', () => {
  it('descarta a avulsa, que não tem eixo de tempo', () => {
    expect(quadrosDaCurva([captura()])).toEqual([]);
  });
});

describe('curvasPorMao', () => {
  it('faz a média das articulações de cada mão em cada instante', () => {
    const frames = quadrosDaCurva([
      captura({
        phase: 'baseline',
        elapsed_seconds: 0,
        measurements: [
          roi('Esquerda', 0, 30),
          roi('Esquerda', 5, 32, 'MCP 2'),
        ] as unknown as Record<string, unknown>[],
      }),
      captura({
        phase: 'dynamic',
        elapsed_seconds: 60,
        measurements: [
          roi('Esquerda', 0, 32),
          roi('Esquerda', 5, 34, 'MCP 2'),
        ] as unknown as Record<string, unknown>[],
      }),
    ]);
    const curvas = curvasPorMao(frames);

    expect(curvas).toHaveLength(1);
    expect(curvas[0].side).toBe('Esquerda');
    expect(curvas[0].points.map((p) => p.value)).toEqual([31, 33]);
  });

  it('ignora a articulação ausente na média em vez de contá-la como zero', () => {
    const frames = quadrosDaCurva([
      captura({
        phase: 'baseline',
        elapsed_seconds: 0,
        measurements: [
          roi('Esquerda', 0, 30),
          roi('Esquerda', 5, 32, 'MCP 2'),
        ] as unknown as Record<string, unknown>[],
      }),
      captura({
        phase: 'dynamic',
        elapsed_seconds: 60,
        // O punho sumiu neste quadro: a média do instante é só do MCP 2.
        measurements: [roi('Esquerda', 5, 34, 'MCP 2')] as unknown as Record<string, unknown>[],
      }),
    ]);

    expect(curvasPorMao(frames)[0].points.map((p) => p.value)).toEqual([31, 34]);
  });

  it('sem quadros, não há curva', () => {
    expect(curvasPorMao([])).toEqual([]);
  });
});

// --- Qualidade --------------------------------------------------------------

describe('linhaDeQualidade', () => {
  it('conta o método e dá a concordância mediana', () => {
    const frase = linhaDeQualidade([
      captura({ alignment_method: 'silhouette', agreement_normalized: 0.8 }),
      captura({ alignment_method: 'silhouette', agreement_normalized: 0.9 }),
      captura({ alignment_method: 'manual', agreement_normalized: null }),
    ]);

    expect(frase).toContain('silhueta em 2 de 3');
    expect(frase).toContain('ajuste manual em 1 de 3');
    expect(frase).toContain('concordância mediana 0,85');
  });

  it('não cita concordância quando nenhuma captura tem', () => {
    const frase = linhaDeQualidade([captura({ agreement_normalized: null })]);
    expect(frase).not.toContain('concordância');
  });

  it('avisa das capturas com ressalva', () => {
    const frase = linhaDeQualidade([
      captura({ issue: 'mão fora do quadro' }),
      captura({ issue: null }),
    ]);
    expect(frase).toContain('1 captura com ressalva');
  });
});

// --- Documento --------------------------------------------------------------

describe('nomeDoArquivo', () => {
  it('usa paciente e data, sem acento nem espaço', () => {
    expect(nomeDoArquivo(consulta())).toBe('consulta-maria-alvares-sa-2026-08-15.pdf');
  });
});

describe('montarRelatorio', () => {
  it('identifica paciente, médico e a consulta', () => {
    const texto = textoDe(montarRelatorio(consulta(), recursos).content);

    expect(texto).toContain('Maria Álvares Sá');
    expect(texto).toContain('Dra. Alice');
    expect(texto).toContain('Artrite reumatoide');
    expect(texto).toContain('46 anos');
  });

  it('diz que o envio ficou incompleto, em vez de calar a análise', () => {
    // Em `uploading` a API devolve `captures` vazia de propósito: os arquivos podem
    // não estar no bucket. Sem uma linha explícita, o relatório afirmaria por
    // omissão que não houve exame de imagem — e houve.
    const texto = textoDe(
      montarRelatorio(
        consulta({ analysis_status: 'uploading', capture_count: 3, captures: [] }),
        recursos,
      ).content,
    );

    expect(texto).toContain('3 capturas gravadas');
    expect(texto).toContain('envio de imagens incompleto');
    expect(texto).not.toContain('Análise termográfica');
  });

  it('descreve a sequência com o número de capturas e a duração', () => {
    const texto = textoDe(
      montarRelatorio(
        consulta({
          analysis_status: 'ready',
          capture_count: 3,
          captures: [
            captura({ id: 'b', phase: 'baseline', elapsed_seconds: 0 }),
            captura({ id: 'd1', phase: 'dynamic', elapsed_seconds: 300 }),
            captura({ id: 'd2', phase: 'dynamic', elapsed_seconds: 600 }),
          ],
        }),
        recursos,
      ).content,
    );

    expect(texto).toContain('Sequência de 3 capturas');
    expect(texto).toContain('uma basal e 2 dinâmicas');
  });

  it('chama a avulsa de avulsa, sem eixo de reaquecimento', () => {
    const texto = textoDe(
      montarRelatorio(
        consulta({ analysis_status: 'ready', capture_count: 1, captures: [captura()] }),
        recursos,
      ).content,
    );

    expect(texto).toContain('Captura avulsa');
  });

  it('imprime o índice com valor e faixa, sem decompor a conta', () => {
    const texto = textoDe(
      montarRelatorio(
        consulta({
          joint_evaluations: { LEFT_WRIST: { pain: true, swelling: false } },
          scores: {
            cdai: {
              score: 12.5,
              level: 'moderate',
              tender_count: 2,
              swollen_count: 1,
              patient_global: 5,
              evaluator_global: 4.5,
            },
          },
        }),
        recursos,
      ).content,
    );

    expect(texto).toContain('CDAI');
    expect(texto).toContain('12,5');
    // A faixa vai por extenso, e não só na cor: o documento vai ser impresso.
    expect(texto).toContain('Atividade moderada');
    // As parcelas do CDAI saíram: o índice é uma conta fechada, e repeti-la aqui
    // enchia a seção sem dizer nada que o número já não dissesse.
    expect(texto).not.toContain('global do avaliador');
  });

  it('nomeia a articulação afetada pelo catálogo, não pelo id', () => {
    const texto = textoDe(
      montarRelatorio(
        consulta({ joint_evaluations: { LEFT_WRIST: { pain: true, swelling: false } } }),
        recursos,
      ).content,
    );

    expect(texto).toContain('Punho esquerdo');
    expect(texto).not.toContain('LEFT_WRIST');
  });

  it('não deixa travessão chegar ao texto do documento', () => {
    const texto = textoDe(
      montarRelatorio(
        consulta({
          // `MCP 2 — Mão direita` é como o catálogo compartilhado guarda o rótulo.
          joint_evaluations: { RIGHT_MCP_2: { pain: true, swelling: false } },
          analysis_status: 'ready',
          capture_count: 1,
          captures: [captura()],
        }),
        { ...recursos, medico: null },
      ).content,
    );

    expect(texto).toContain('MCP 2 (mão direita)');
    expect(texto).not.toContain('—');
  });

  it('omite as notas clínicas quando não há', () => {
    expect(textoDe(montarRelatorio(consulta(), recursos).content)).not.toContain('Notas clínicas');
  });
});

// --- Renderização -----------------------------------------------------------

describe('o pdfmake aceita a definição', () => {
  // Os testes acima conferem o *conteúdo*; estes conferem que o documento é
  // renderizável. Um nome de estilo inexistente, um `colSpan` que não fecha a linha
  // ou uma imagem malformada atravessam o TypeScript inteiros e só falham na hora de
  // gerar o PDF — que é a hora em que o médico clicou no botão.

  /** PNG 1×1: basta para exercitar o caminho da imagem embutida. */
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  async function renderizar(doc: TDocumentDefinitions): Promise<Buffer> {
    // Pelo mesmo desembrulho que a aplicação usa: renderizar por um caminho que a
    // produção não percorre deixaria de cobrir justamente onde ela já quebrou.
    const pdfMake = moduloPdfMake(await import('pdfmake/build/pdfmake'));
    const fontes = await import('pdfmake/build/vfs_fonts');
    pdfMake.addVirtualFileSystem(fontes.default);
    return pdfMake.createPdf(doc).getBuffer();
  }

  const completa = consulta({
    clinical_notes: 'Refere rigidez matinal de ~40 min.',
    joint_evaluations: { LEFT_WRIST: { pain: true, swelling: false } },
    scores: {
      cdai: {
        score: 12.5,
        level: 'moderate',
        tender_count: 2,
        swollen_count: 1,
        patient_global: 5,
        evaluator_global: 4.5,
      },
    },
    analysis_status: 'ready',
  });

  it('na sequência, com imagens e gráfico', async () => {
    const medicoes = [roi('Esquerda', 0, 31), roi('Direita', 0, 31.4)] as unknown as Record<
      string,
      unknown
    >[];
    const captures = [
      captura({ id: 'b', phase: 'baseline', elapsed_seconds: 0, measurements: medicoes }),
      captura({ id: 'd1', phase: 'dynamic', elapsed_seconds: 300, measurements: medicoes }),
      captura({ id: 'd2', phase: 'dynamic', elapsed_seconds: 600, measurements: medicoes }),
    ];
    const doc = montarRelatorio(
      { ...completa, captures, capture_count: 3 },
      {
        ...recursos,
        imagens: [
          { titulo: 'Óptica', imagem: PNG },
          { titulo: 'Térmica basal', imagem: PNG },
          { titulo: 'Térmica final (t = 10:00)', imagem: PNG },
        ],
        grafico: PNG,
      },
    );

    expect((await renderizar(doc)).subarray(0, 5).toString()).toBe('%PDF-');
  }, 30000);

  it('na avulsa, sem imagem nem gráfico', async () => {
    const captures = [
      captura({ measurements: [roi('Esquerda', 0, 31)] as unknown as Record<string, unknown>[] }),
    ];
    const doc = montarRelatorio(
      { ...completa, captures, capture_count: 1 },
      { ...recursos, imagens: [{ titulo: 'Óptica', imagem: PNG }] },
    );

    expect((await renderizar(doc)).subarray(0, 5).toString()).toBe('%PDF-');
  }, 30000);
});
