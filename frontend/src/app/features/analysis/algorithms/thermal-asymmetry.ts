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
  /** E − D: positivo significa mão esquerda mais quente. */
  readonly assinada: number;
}

/** Uma medição serve para comparar? Sem pele suficiente, o número não se sustenta. */
function confiavel(joint: AlgorithmJoint): boolean {
  return Number.isFinite(joint.mean) && joint.skinCoverage >= COBERTURA_MINIMA;
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
      assinada: esquerda.mean - direita.mean,
    });
  }

  pares.sort((a, b) => Math.abs(b.assinada) - Math.abs(a.assinada));
  return { pares, descartados };
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
    'é uma leitura estática, não a evolução do reaquecimento.'
  );
}

export const thermalAsymmetry: ResearchAlgorithm = {
  slug: 'assimetria-termica-estatica',
  title: 'Assimetria térmica (imagem estática)',
  description:
    'Compara cada articulação com a correspondente do outro lado numa imagem estática, as mãos num instante, em repouso, e reporta as diferenças de temperatura da maior para a menor. Numa sequência, usa a primeira captura.',

  run(input: AlgorithmInput): AlgorithmResult {
    // Sem guarda de "não há captura": o painel não chama `run` sem medição. A
    // pré-condição é única para todos os algoritmos, então mora em quem chama.
    const frame = input.frames[0];
    const { pares, descartados } = parear(frame.joints);

    if (pares.length === 0) {
      return {
        status: 'insufficient-data',
        summary:
          descartados.length > 0
            ? `As ${descartados.length} articulações pareadas têm cobertura de pele abaixo de ${COBERTURA_MINIMA * 100}%, insuficiente para comparar.`
            : 'Não há articulação detectada nas duas mãos: sem par correspondente, não há assimetria a calcular.',
        values: [],
      };
    }

    const maior = pares[0];
    // Só contagens no texto — nenhum número com casa decimal, porque formatar é
    // trabalho da tela. Os valores vão em `values`, como números.
    const frases = [
      `Maior diferença na ${maior.label}, com a mão ${maior.assinada >= 0 ? 'esquerda' : 'direita'} mais quente.`,
      `${pares.length} ${pares.length === 1 ? 'par comparado' : 'pares comparados'}` +
        (descartados.length > 0
          ? `; ${descartados.length} descartado${descartados.length === 1 ? '' : 's'} por cobertura de pele insuficiente (${descartados.join(', ')}).`
          : '.'),
    ];

    const aviso = origem(frame, input.frames.length);
    if (aviso) {
      frases.push(aviso);
    }

    return {
      status: 'ok',
      summary: frases.join(' '),
      values: pares.map((par) => ({
        label: par.label,
        value: Math.abs(par.assinada),
        unit: '°C',
      })),
    };
  },
};
