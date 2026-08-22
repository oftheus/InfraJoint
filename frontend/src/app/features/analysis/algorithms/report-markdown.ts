/**
 * Renderiza o relatório de um algoritmo.
 *
 * A escolha da biblioteca fica isolada aqui: trocá-la depois não toca em componente
 * nenhum. O HTML resultante vai para o template por `[innerHTML]`, que o Angular
 * sanitiza — segunda barreira, não a primeira: o markdown é escrito por código do
 * próprio repositório, não por usuário.
 */

import { marked } from 'marked';

export function renderReport(report: string): string {
  // `async: false` garante `string` em vez de `Promise<string>`: não há extensão
  // assíncrona registrada, e o template precisa do valor na hora.
  return marked.parse(report, { async: false, gfm: true }) as string;
}
