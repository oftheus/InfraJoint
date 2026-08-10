/**
 * Contratos da API clínica.
 *
 * Os nomes ficam em snake_case, iguais aos do backend — mesma convenção já usada por
 * `UserProfile`, que espelha as colunas do Supabase. Um mapper para camelCase seria
 * uma camada de tradução sem nada para traduzir.
 */

/** O que a API pode devolver. Inclui `'N'`, que registros antigos podem carregar. */
export type Sex = 'F' | 'M' | 'O' | 'N';

/**
 * O que o usuário pode escolher — subconjunto do que o tipo aceita.
 *
 * `'N'` ficou de fora: com a opção vazia do seletor já significando "não informado",
 * tê-lo seria uma segunda forma de dizer a mesma coisa, gravando valores diferentes no
 * banco para o mesmo fato. Um registro que já tenha `'N'` cai no mesmo `—` do nulo.
 */
export const SEX_OPTIONS: readonly { readonly value: Sex; readonly label: string }[] = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'O', label: 'Outro' },
];

export interface Patient {
  readonly id: string;
  readonly full_name: string;
  readonly birth_date: string | null;
  readonly sex: Sex | null;
  readonly phone: string | null;
  readonly primary_diagnosis: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Encounter {
  readonly id: string;
  readonly patient_id: string;
  readonly occurred_at: string;
  readonly reason: string | null;
  readonly clinical_notes: string | null;
  readonly created_at: string;
}

/** Resposta de `GET /patients/{id}`: já traz as consultas, evitando um 2º request. */
export interface PatientDetail extends Patient {
  readonly encounters: readonly Encounter[];
}

export interface PatientCreate {
  full_name: string;
  birth_date?: string | null;
  sex?: Sex | null;
  phone?: string | null;
  primary_diagnosis?: string | null;
}

/** PATCH parcial: o backend grava só as chaves presentes. */
export type PatientUpdate = Partial<PatientCreate>;

export interface EncounterCreate {
  occurred_at?: string | null;
  reason?: string | null;
  clinical_notes?: string | null;
}
