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
  /**
   * Obrigatória. Sem documento e sem número de prontuário, é o único campo que
   * distingue dois homônimos — por isso o banco a exige (`birth_date_obrigatoria`).
   */
  readonly birth_date: string;
  readonly sex: Sex | null;
  readonly phone: string | null;
  readonly primary_diagnosis: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  /**
   * Nome do médico dono, e `null` para quem não é admin.
   *
   * Quem decide se ele vem preenchido é o banco, não a tela: um médico comum só
   * enxerga os próprios pacientes, e o rótulo repetiria o nome dele em toda linha.
   * Renderizar quando existir é, portanto, suficiente — não há checagem de papel a
   * fazer aqui.
   */
  readonly owner_name?: string | null;
}

/** Um achado articular, como o backend grava em `encounters.joint_evaluations`. */
export interface JointEvaluationDto {
  readonly pain: boolean;
  readonly swelling: boolean;
}

/** Faixa de atividade. Mesmos valores do `ActivityLevel` do backend. */
export type ActivityLevelDto = 'remission' | 'low' | 'moderate' | 'high';

export interface CdaiScoreDto {
  readonly score: number;
  readonly level: ActivityLevelDto;
  readonly tender_count: number;
  readonly swollen_count: number;
  readonly patient_global: number;
  readonly evaluator_global: number;
}

export interface Das28ScoreDto {
  readonly score: number;
  readonly level: ActivityLevelDto;
  readonly tender_count: number;
  readonly swollen_count: number;
  readonly acute_phase: 'esr' | 'crp';
  readonly acute_value: number;
  readonly patient_global_health: number;
}

/**
 * Escores da consulta, indexados pelo tipo de avaliação em minúsculo.
 *
 * O backend normaliza o casing na fronteira: o frontend envia `CDAI`/`DAS28` e
 * recebe de volta `cdai`/`das28`. A chave dá unicidade por tipo sem constraint.
 */
export interface EncounterScores {
  readonly cdai?: CdaiScoreDto;
  readonly das28?: Das28ScoreDto;
}

export interface Encounter {
  readonly id: string;
  readonly patient_id: string;
  readonly occurred_at: string;
  readonly reason: string | null;
  readonly joint_evaluations: Readonly<Record<string, JointEvaluationDto>> | null;
  readonly scores: EncounterScores;
  /**
   * `null` = consulta sem análise de imagem; `'uploading'` = capturas gravadas mas
   * arquivos ainda não confirmados no bucket; `'ready'` = tudo conferido.
   */
  readonly analysis_status: 'uploading' | 'ready' | null;
  /**
   * Capturas gravadas na consulta; conta só o que a RLS deixa ver.
   *
   * Conta as **linhas**, não os objetos no bucket: em `uploading` ela é maior que
   * `captures`, que vem vazia de propósito. É o que deixa a tela dizer quanta
   * imagem ficou por confirmar.
   */
  readonly capture_count: number;
  readonly created_at: string;
}

/** Resposta de `GET /patients/{id}`: já traz as consultas, evitando um 2º request. */
export interface PatientDetail extends Patient {
  readonly encounters: readonly Encounter[];
}

/** Os três arquivos de uma captura. Enum fechado: vira parte da chave no R2. */
export type CaptureFileKind = 'optical' | 'thermal' | 'matrix';

/** Declaração do arquivo — tamanho e tipo. Não prova que o upload aconteceu. */
export interface CaptureFileDeclaration {
  size: number;
  content_type: string;
}

/**
 * Corpo do `POST /encounters/{id}/captures`.
 *
 * Uma consulta tem UMA análise. Avulsa é `captures` com um elemento; sequência tem N.
 * Não há discriminador — a cardinalidade é a diferença, no frontend como no banco.
 */
export interface AnalysisCreate {
  captures: readonly Record<string, unknown>[];
}

/** Uma URL assinada, casada com a captura e o arquivo a que pertence. */
export interface SignedUpload {
  readonly capture_id: string;
  readonly capture_index: number;
  readonly kind: CaptureFileKind;
  readonly url: string;
}

/**
 * Resposta do POST. As URLs valem 1 h e o POST **não** pode ser repetido — a segunda
 * chamada recebe 409, porque criaria um segundo jogo de capturas na mesma consulta.
 */
export interface AnalysisCreated {
  readonly encounter_id: string;
  readonly uploads: readonly SignedUpload[];
}

/** Arquivo da captura, com URL de leitura assinada (15 min). */
export interface CaptureFileDetail {
  readonly size: number;
  readonly content_type: string;
  /** Nula quando o R2 não está configurado: a consulta abre, só sem imagens. */
  readonly url: string | null;
}

/** Uma captura como foi gravada — é isto que reconstrói a tela do analisador. */
export interface CaptureDetail {
  readonly id: string;
  readonly capture_index: number;
  readonly phase: 'baseline' | 'dynamic' | null;
  readonly label: string | null;
  readonly elapsed_seconds: number | null;

  readonly align_a: number | null;
  readonly align_b: number | null;
  readonly align_tx: number | null;
  readonly align_c: number | null;
  readonly align_d: number | null;
  readonly align_ty: number | null;
  /**
   * Como o alinhamento foi obtido — 'manual' inclusive.
   *
   * As dimensões da matriz não vêm daqui: elas saem do próprio CSV, que a reabertura
   * baixa e reparseia. Guardá-las no banco era desnormalizar um arquivo que sempre
   * temos — e, no protocolo, repetir 640x480 em toda linha.
   */
  readonly alignment_method: 'silhouette' | 'fiducial' | 'manual' | null;

  readonly agreement_normalized: number | null;
  readonly agreement: Record<string, unknown> | null;
  readonly fiducial_correction: Record<string, unknown> | null;
  readonly measurements: readonly Record<string, unknown>[];
  readonly issue: string | null;
  readonly files: Readonly<Record<string, CaptureFileDetail>>;
}

/**
 * Resposta de `GET /encounters/{id}`: a consulta reaberta, inteira.
 *
 * `captures` vem vazia enquanto `analysis_status` não for `ready` — em `uploading`
 * os objetos podem não estar no bucket, e URLs para eles dariam 404 na tela.
 */
export interface EncounterDetail extends Encounter {
  readonly patient: Patient;
  readonly captures: readonly CaptureDetail[];
}

export interface PatientCreate {
  full_name: string;
  /** Obrigatória: o backend recusa com 422 sem ela. */
  birth_date: string;
  sex?: Sex | null;
  phone?: string | null;
  primary_diagnosis?: string | null;
}

/** PATCH parcial: o backend grava só as chaves presentes. */
export type PatientUpdate = Partial<PatientCreate>;

/**
 * Corpo do `POST /patients/{id}/encounters`.
 *
 * O fluxo de Análise Térmica grava tudo numa chamada só ao finalizar: a consulta
 * nasce já com o body map e os escores. Os dois campos clínicos são opcionais
 * porque as duas etapas do fluxo também são.
 */
export interface EncounterCreate {
  occurred_at?: string | null;
  reason?: string | null;
  joint_evaluations?: Record<string, JointEvaluationDto> | null;
  /** Chaves em maiúsculo (`CDAI`, `DAS28`); o backend normaliza ao gravar. */
  scores?: Record<string, CdaiScoreDto | Das28ScoreDto> | null;
}
