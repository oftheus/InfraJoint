/**
 * Assimetria térmica entre as mãos, articulação por articulação, na **imagem estática**.
 *
 * Compara cada articulação com a sua correspondente do outro lado. É por articulação,
 * e não pela média da mão, porque inflamação articular é focal: uma MCP com 1,4 °C de
 * diferença, diluída entre dez articulações simétricas, vira 0,1 °C na média da mão —
 * um número que não diz nada.
 *
 * "Estática" é o termo do domínio, e não um eufemismo para "uma imagem só": ele opõe
 * esta leitura — as mãos em repouso, num instante — à termografia **dinâmica**, que é a
 * resposta ao estresse térmico ao longo do tempo. É por isso que o escopo está no nome
 * e não escondido na implementação: com uma sequência carregada, este algoritmo usa a
 * primeira captura e diz isso no relatório. A evolução do reaquecimento é outra
 * pergunta, e caberá a um algoritmo dinâmico.
 */

import {
  AlgorithmFrame,
  AlgorithmInput,
  AlgorithmJoint,
  AlgorithmResult,
  ResearchAlgorithm,
} from './algorithm.model';

/**
 * Cobertura de pele mínima para a medição entrar na comparação.
 *
 * Constante, e não parâmetro de tela: um botão exigiria descrever o parâmetro em
 * metadados e renderizar formulário, o que é máquina demais para uma demanda que não
 * existe. Está aqui, com nome, e muda-se em uma linha.
 */
const COBERTURA_MINIMA = 0.4;

interface Par {
  readonly label: string;
  readonly esquerda: number;
  readonly direita: number;
  /** E − D: positivo significa mão esquerda mais quente. */
  readonly assinada: number;
}

/** Uma medição serve para comparar? Sem pele suficiente, o número não se sustenta. */
function confiavel(joint: AlgorithmJoint): boolean {
  return Number.isFinite(joint.mean) && joint.skinCoverage >= COBERTURA_MINIMA;
}

function numero(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** Pareia as articulações da captura, separando o que não dá para comparar. */
function parear(joints: readonly AlgorithmJoint[]): {
  readonly pares: readonly Par[];
  readonly descartados: readonly string[];
} {
  const esquerdas = new Map(
    joints.filter((j) => j.side === 'Esquerda').map((j) => [j.landmarkId, j]),
  );
  const direitas = new Map(
    joints.filter((j) => j.side === 'Direita').map((j) => [j.landmarkId, j]),
  );

  const pares: Par[] = [];
  const descartados: string[] = [];

  for (const [landmarkId, esquerda] of esquerdas) {
    const direita = direitas.get(landmarkId);
    if (!direita) {
      continue; // não detectada do outro lado: não há par, e não é descarte
    }
    if (!confiavel(esquerda) || !confiavel(direita)) {
      descartados.push(esquerda.label);
      continue;
    }
    pares.push({
      label: esquerda.label,
      esquerda: esquerda.mean,
      direita: direita.mean,
      assinada: esquerda.mean - direita.mean,
    });
  }

  pares.sort((a, b) => Math.abs(b.assinada) - Math.abs(a.assinada));
  return { pares, descartados };
}

function relatorio(pares: readonly Par[], descartados: readonly string[]): string {
  const maior = pares[0];
  const media = pares.reduce((soma, par) => soma + Math.abs(par.assinada), 0) / pares.length;

  const linhas = pares.map(
    (par) =>
      `| ${par.label} | ${numero(par.esquerda)} | ${numero(par.direita)} | ${numero(Math.abs(par.assinada))} |`,
  );

  const partes = [
    `A maior diferença entre lados foi na **${maior.label}**: ${numero(Math.abs(maior.assinada))} °C, ` +
      `com a mão ${maior.assinada >= 0 ? 'esquerda' : 'direita'} mais quente.`,
    [
      '| Articulação | Esquerda | Direita | Diferença |',
      '| --- | ---: | ---: | ---: |',
      ...linhas,
    ].join('\n'),
    `Média das diferenças: **${numero(media)} °C** em ${pares.length} ` +
      `${plural(pares.length, 'par comparado', 'pares comparados')}.`,
  ];

  if (descartados.length > 0) {
    partes.push(
      `${descartados.length} ${plural(descartados.length, 'par foi descartado', 'pares foram descartados')} ` +
        `por cobertura de pele abaixo de ${COBERTURA_MINIMA * 100}%: ${descartados.join(', ')}.`,
    );
  }

  return partes.join('\n\n');
}

/**
 * Aviso de escopo.
 *
 * O nome já diz "estática", mas quem lê só o relatório não vê o nome — e um texto sobre
 * 1 de 21 capturas passaria por um texto sobre as 21.
 */
function origem(frame: AlgorithmFrame, total: number): string | null {
  if (total === 1) {
    return null;
  }
  const identificacao =
    frame.timeSeconds === null ? `de índice ${frame.captureIndex}` : `do instante inicial`;
  return (
    `Calculado sobre a primeira captura ${identificacao}, das ${total} carregadas: ` +
    'esta é uma leitura estática, não a evolução do reaquecimento.'
  );
}

export const thermalAsymmetry: ResearchAlgorithm = {
  slug: 'assimetria-termica-estatica',
  title: 'Assimetria térmica (imagem estática)',
  description:
    'Compara cada articulação com a correspondente do outro lado numa imagem estática — as mãos num instante, em repouso — e reporta as diferenças de temperatura da maior para a menor. Numa sequência, usa a primeira captura.',
  requires: { minFrames: 1, needsBaseline: false },

  run(input: AlgorithmInput): AlgorithmResult {
    const frame = input.frames[0];
    if (!frame) {
      return { status: 'insufficient-data', report: 'Nenhuma captura foi analisada.' };
    }

    const { pares, descartados } = parear(frame.joints);

    if (pares.length === 0) {
      const motivo =
        descartados.length > 0
          ? `As ${descartados.length} articulações pareadas têm cobertura de pele abaixo de ${COBERTURA_MINIMA * 100}%, insuficiente para comparar.`
          : 'Não há articulação detectada nas duas mãos — sem par correspondente, não há assimetria a calcular.';
      return { status: 'insufficient-data', report: motivo };
    }

    const aviso = origem(frame, input.frames.length);
    const corpo = relatorio(pares, descartados);
    return { status: 'ok', report: aviso ? `${aviso}\n\n${corpo}` : corpo };
  },
};
