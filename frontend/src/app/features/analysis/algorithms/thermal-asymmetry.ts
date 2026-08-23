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
 * primeira captura **com articulação medida** e diz isso no relatório. A evolução do
 * reaquecimento é outra pergunta, e caberá a um algoritmo dinâmico.
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

/**
 * Por que uma medição ficou de fora.
 *
 * Os dois motivos eram contados juntos e relatados como cobertura de pele, o que
 * descrevia errado o caso mais grave dos dois: uma ROI sem temperatura nenhuma não é
 * uma ROI mal coberta, é uma ROI que não mediu. Quem lê o relatório precisa saber qual
 * dos dois aconteceu, porque a ação é diferente.
 */
type MotivoDescarte = 'cobertura' | 'sem-temperatura';

interface Descartado {
  readonly label: string;
  readonly motivo: MotivoDescarte;
}

/** Por que esta medição não serve para comparar, ou `null` quando serve. */
function motivoDeDescarte(joint: AlgorithmJoint): MotivoDescarte | null {
  if (!Number.isFinite(joint.mean)) {
    return 'sem-temperatura';
  }
  return joint.skinCoverage < COBERTURA_MINIMA ? 'cobertura' : null;
}

/** Pareia as articulações da captura, separando o que não dá para comparar. */
function parear(joints: readonly AlgorithmJoint[]): {
  readonly pares: readonly Par[];
  readonly descartados: readonly Descartado[];
} {
  const esquerdas = new Map(
    joints.filter((j) => j.side === 'Esquerda').map((j) => [j.landmarkId, j]),
  );
  const direitas = new Map(
    joints.filter((j) => j.side === 'Direita').map((j) => [j.landmarkId, j]),
  );

  const pares: Par[] = [];
  const descartados: Descartado[] = [];

  for (const [landmarkId, esquerda] of esquerdas) {
    const direita = direitas.get(landmarkId);
    if (!direita) {
      continue; // não detectada do outro lado: não há par, e não é descarte
    }
    // O lado que falhou pior manda no motivo. Sem temperatura é falha de medição,
    // cobertura baixa é medição fraca, e relatar a segunda escondendo a primeira
    // mandaria o leitor conferir o enquadramento de uma ROI que nem mediu.
    const motivo = motivoDeDescarte(esquerda) ?? motivoDeDescarte(direita);
    if (motivo) {
      descartados.push({ label: esquerda.label, motivo });
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

/** Qual mão está mais quente no par, ou `null` quando as duas medem igual. */
function ladoMaisQuente(assinada: number): 'esquerda' | 'direita' | null {
  if (assinada === 0) {
    return null;
  }
  return assinada > 0 ? 'esquerda' : 'direita';
}

/**
 * Os descartes em prosa, agrupados por motivo.
 *
 * Com um motivo só a frase não repete a contagem, porque "1 descartado: 1 por
 * cobertura" diz duas vezes a mesma coisa.
 */
function frasesDeDescarte(descartados: readonly Descartado[]): string {
  const rotulos: Record<MotivoDescarte, string> = {
    cobertura: `cobertura de pele abaixo de ${COBERTURA_MINIMA * 100}%`,
    'sem-temperatura': 'medição sem temperatura',
  };

  const grupos = (['cobertura', 'sem-temperatura'] as const)
    .map((motivo) => ({
      motivo,
      nomes: descartados.filter((d) => d.motivo === motivo).map((d) => d.label),
    }))
    .filter((grupo) => grupo.nomes.length > 0);

  const descrever = (grupo: (typeof grupos)[number]): string =>
    `${grupo.nomes.length} por ${rotulos[grupo.motivo]} (${grupo.nomes.join(', ')})`;

  if (grupos.length === 1) {
    const [grupo] = grupos;
    const palavra = grupo.nomes.length === 1 ? 'descartado' : 'descartados';
    return `${grupo.nomes.length} ${palavra} por ${rotulos[grupo.motivo]} (${grupo.nomes.join(', ')}).`;
  }
  return `${descartados.length} descartados, ${grupos.map(descrever).join(' e ')}.`;
}

/**
 * Aviso de escopo.
 *
 * O nome já diz "estática", mas quem lê só o relatório não vê o nome — e um texto sobre
 * 1 de 21 capturas passaria por um texto sobre as 21.
 */
function origem(frame: AlgorithmFrame, posicao: number, total: number): string | null {
  if (total === 1) {
    return null;
  }
  const estatica = 'é uma leitura estática, não a evolução do reaquecimento.';
  if (posicao > 0) {
    // Houve captura antes desta, e ela não tinha medição. Dizer "primeira captura"
    // aqui descreveria uma captura que não é esta — e esconderia o buraco, que é
    // justamente o que o frame vazio existe para mostrar.
    return (
      `Calculado sobre a captura de índice ${frame.captureIndex}, das ${total} carregadas: ` +
      `${posicao === 1 ? 'a anterior não tem' : `as ${posicao} anteriores não têm`} ` +
      `articulação medida. Com a ressalva, ${estatica}`
    );
  }
  // Nomeia a captura pelo que ela é, não por um instante: a basal fica fora do eixo
  // de reaquecimento (ver `rewarming-curve.ts`), e chamá-la de "instante inicial"
  // contradiria a curva e a linha do tempo, que já não lhe dão posição no tempo.
  const identificacao =
    frame.phase === 'baseline'
      ? 'a captura basal'
      : `a primeira captura, de índice ${frame.captureIndex},`;
  return `Calculado sobre ${identificacao} das ${total} carregadas: ${estatica}`;
}

export const thermalAsymmetry: ResearchAlgorithm = {
  slug: 'assimetria-termica-estatica',
  title: 'Assimetria térmica (imagem estática)',
  description:
    'Compara cada articulação com a correspondente do outro lado numa imagem estática, as mãos num instante, em repouso, e reporta as diferenças de temperatura da maior para a menor. Numa sequência, usa a primeira captura com medição.',

  run(input: AlgorithmInput): AlgorithmResult {
    // A primeira **com medição**, e não `frames[0]`: uma basal cujo alinhamento
    // falhou entra na sequência como frame de `joints: []`, e usá-la faria o
    // algoritmo relatar "nada detectado nas duas mãos" sobre uma sequência em que
    // 20 capturas foram medidas. O relatório diz qual captura usou.
    const posicao = input.frames.findIndex((f) => f.joints.length > 0);
    // Nenhuma tem medição: cai na primeira, e `parear` produz o insuficiente certo.
    const frame = posicao === -1 ? input.frames[0] : input.frames[posicao];

    // O painel já não chama `run` sem medição, mas a guarda não é por causa dele:
    // é para `run` ser total. A assinatura promete um `AlgorithmResult` para
    // qualquer `AlgorithmInput`, e um chamador futuro — um lote, um teste, outra
    // tela — não tem como saber de uma pré-condição que só existe no painel.
    if (!frame) {
      return {
        status: 'insufficient-data',
        summary: 'Não há captura analisada: não há medição sobre a qual calcular assimetria.',
        values: [],
      };
    }
    const { pares, descartados } = parear(frame.joints);

    if (pares.length === 0) {
      return {
        status: 'insufficient-data',
        summary:
          descartados.length > 0
            ? `Nenhum par pôde ser comparado. ${frasesDeDescarte(descartados)}`
            : 'Não há articulação detectada nas duas mãos: sem par correspondente, não há assimetria a calcular.',
        values: [],
      };
    }

    const maior = pares[0];
    const ladoDoMaior = ladoMaisQuente(maior.assinada);
    // Só contagens no texto, nenhum número com casa decimal, porque formatar é
    // trabalho da tela. Os valores vão em `values`, como números.
    const frases = [
      ladoDoMaior === null
        ? 'Nenhuma diferença de temperatura entre as mãos nos pares comparados.'
        : `Maior diferença na ${maior.label}, com a mão ${ladoDoMaior} mais quente.`,
      `${pares.length} ${pares.length === 1 ? 'par comparado' : 'pares comparados'}.` +
        (descartados.length > 0 ? ` ${frasesDeDescarte(descartados)}` : ''),
    ];

    const aviso = origem(frame, Math.max(posicao, 0), input.frames.length);
    if (aviso) {
      frases.push(aviso);
    }

    return {
      status: 'ok',
      summary: frases.join(' '),
      // O lado vai no rótulo, e não no sinal do número.
      //
      // `values` é magnitude, e a tabela da tela ordena e formata sem saber de
      // convenção de sinal. Antes só o maior par dizia qual mão estava mais quente,
      // na frase do resumo: as outras linhas mostravam "0,8 °C" e o leitor não tinha
      // como saber de que lado, apesar de o algoritmo já ter calculado isso.
      values: pares.map((par) => {
        const lado = ladoMaisQuente(par.assinada);
        return {
          label:
            lado === null ? `${par.label} (sem diferença)` : `${par.label} (${lado} mais quente)`,
          value: Math.abs(par.assinada),
          unit: '°C',
        };
      }),
    };
  },
};
