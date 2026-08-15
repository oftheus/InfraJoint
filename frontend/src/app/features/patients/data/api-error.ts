import { HttpErrorResponse } from '@angular/common/http';

/**
 * Converte a falha HTTP em uma frase para o usuário.
 *
 * O `detail` do backend é curto e em português; quando ele não vier, o status decide.
 * Nunca ecoamos corpo de erro desconhecido — a API já filtra detalhe interno, e repetir
 * o que chegou tornaria a tela refém disso.
 */
export function messageFromError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Não foi possível completar a operação.';
  }

  switch (error.status) {
    case 0:
      return 'Sem conexão com o servidor.';
    case 401:
      return 'Sua sessão expirou. Entre novamente.';
    case 403:
      return 'Seu perfil não permite esta ação.';
    case 404:
      return 'Registro não encontrado.';
    case 422:
      return 'Dados inválidos. Revise os campos.';
    default: {
      const detail = error.error?.detail;
      return typeof detail === 'string' && detail
        ? detail
        : 'Não foi possível completar a operação.';
    }
  }
}
