import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { JointAssessmentService } from '../../../body-map/joint-assessment.service';
import { ASSESSMENT_CONFIGS } from '../../../body-map/assessment-configs.data';
import { Patient } from '../../../../patients/data/patient.model';
import { PatientsService } from '../../../../patients/data/patients.service';
import { messageFromError } from '../../../../patients/data/api-error';
import { AssessedIndex, toEncounterCreate } from '../../thermal-analysis.model';
import { toAlgorithmInput } from '../../../algorithms/algorithm-input';
import { AlgorithmInput } from '../../../algorithms/algorithm.model';
import { AlgorithmPanel } from '../../../algorithms/components/algorithm-panel/algorithm-panel';
import { ImageAnalyzerPage } from '../../../pages/image-analyzer-page/image-analyzer-page';
import {
  CollectedAnalysis,
  collectSequenceAnalysis,
  collectSingleAnalysis,
  uploadKey,
} from '../../data/analyzer-collect';
import { describeTimings, uploadAll } from '../../data/capture-upload';
import { BodyMapStep } from '../../steps/body-map-step/body-map-step';
import { PatientStep } from '../../steps/patient-step/patient-step';

/** Etapas do fluxo, na ordem em que acontecem. */
type Step = 'patient' | 'body-map' | 'analyzer' | 'algorithms';

/**
 * Fluxo de Análise Térmica: paciente → mapa corporal → analisador → gravar.
 *
 * **É o único lugar da seção Análise que persiste.** As telas soltas
 * `/mapa-corporal` e `/analisador-de-imagens` existem para qualquer um
 * experimentar e não gravam nada; elas nem importam `PatientsService`. A
 * separação é estrutural, não uma flag: os componentes de avaliação continuam
 * sem saber o que é paciente ou API, e quem sabe é este container.
 *
 * O `JointAssessmentService` é provido **aqui**, e não na etapa, para o estado
 * do body map sobreviver à navegação entre etapas e ainda poder ser serializado
 * no fim. Ele morre junto com o fluxo, como morre junto com a página solta.
 *
 * Nada vai ao banco antes de "Finalizar": a consulta nasce já completa, numa
 * chamada só. Abandonar o fluxo no meio não deixa consulta vazia no histórico.
 */
@Component({
  selector: 'app-thermal-analysis-page',
  imports: [PatientStep, BodyMapStep, ImageAnalyzerPage, AlgorithmPanel, DecimalPipe],
  providers: [JointAssessmentService],
  templateUrl: './thermal-analysis-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThermalAnalysisPage {
  /**
   * Paciente já escolhido, vindo de `?paciente=<id>`.
   *
   * É o que permite ao prontuário abrir "Nova consulta" sem gravar nada por
   * conta própria: ele delega para cá em vez de ter um caminho de criação
   * paralelo. Consulta nasce de um lugar só.
   */
  readonly paciente = input<string | undefined>(undefined);

  private readonly store = inject(JointAssessmentService);
  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);

  protected readonly step = signal<Step>('patient');
  protected readonly patient = signal<Patient | null>(null);
  protected readonly loadingPatient = signal(false);
  /** Progresso do envio, para a tela não ficar num 'Gravando…' opaco. */
  protected readonly uploadDone = signal(0);
  protected readonly uploadTotal = signal(0);
  protected readonly uploadMbDone = signal(0);
  protected readonly uploadMbTotal = signal(0);
  protected readonly uploadLast = signal('');
  /** Arquivos que não subiram, para o médico saber o que precisa refazer. */
  protected readonly uploadFailed = signal<readonly string[]>([]);

  /** A etapa 3 fica montada e escondida, então o viewChild existe desde então. */
  private readonly analyzer = viewChild(ImageAnalyzerPage);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Quantas articulações foram tocadas — decide se há body map a gravar. */
  protected readonly evaluatedCount = this.store.evaluatedCount;

  /**
   * Índices com escore fechado; o DAS28 some daqui enquanto faltar VHS/PCR.
   *
   * Sem articulação avaliada não há índice nenhum, e a checagem não é redundante com
   * a de `score !== null`: com o body map intocado o CDAI vale 0 + 0 + 0 + 0 = **0**,
   * que não é nulo — e uma consulta sem body map acabava gravada com "CDAI 0,0,
   * remissão", uma avaliação que ninguém fez. O DAS28 escapava por acaso, porque
   * `acuteValue` nasce nulo.
   */
  protected readonly closedIndexes = computed(() => {
    if (this.store.evaluatedCount() === 0) {
      return [];
    }
    return ASSESSMENT_CONFIGS.map((config) => ({
      assessmentType: config.assessmentType,
      outcome: this.store.scoreFor(config.assessmentType),
    })).filter((index): index is AssessedIndex => index.outcome.score !== null);
  });

  /**
   * Entrada dos algoritmos.
   *
   * Idêntica à da tela solta, e é de propósito: a conversão é a mesma função, e o
   * fluxo não acrescenta nada. Já acrescentou paciente e body map — saíram porque
   * nenhum algoritmo os lia.
   */
  protected readonly algorithmInput = computed<AlgorithmInput | null>(() => {
    const frames = this.analyzer()?.algorithmFrames() ?? [];
    return frames.length === 0 ? null : toAlgorithmInput(frames);
  });

  /** Sequência carregada. O fluxo ainda só grava a análise avulsa. */
  protected readonly isSequence = computed(() => this.analyzer()?.sequenceActive() ?? false);

  /**
   * O analisador tem resultado gravável?
   *
   * Sem matriz e sem alinhamento não há medição — é a mesma condição que faz
   * `collectSingleAnalysis` devolver `null`. Enquanto for falsa, a tela do
   * analisador ainda está na etapa de carregar arquivos.
   */
  protected readonly analysisReady = computed(() => {
    const analisador = this.analyzer();
    if (!analisador) {
      return false;
    }
    if (analisador.sequenceActive()) {
      return analisador.sequenceService.captures().length > 0;
    }
    return analisador.matrix() !== null && analisador.activeMatrix() !== null;
  });

  /**
   * Há achado a gravar?
   *
   * As duas etapas clínicas são opcionais **uma em relação à outra**, não as duas
   * ao mesmo tempo: sem body map e sem análise, "Finalizar" criaria no histórico
   * uma consulta que não registra nada — exatamente o que o fluxo evita ao só
   * gravar no fim.
   */
  protected readonly hasFindings = computed(
    () => this.evaluatedCount() > 0 || this.analysisReady(),
  );

  /**
   * Finalizar só aparece quando não custa perder trabalho.
   *
   * Na etapa do analisador, clicar antes de processar gravaria a consulta e sairia
   * da tela — e a análise carregada iria junto, sem aviso. Fora dela, não há o que
   * perder: o body map já está em memória e é opcional por definição.
   */
  protected readonly canFinish = computed(() => {
    if (this.patient() === null || this.saving() || !this.hasFindings()) {
      return false;
    }
    if (this.step() !== 'analyzer') {
      return true;
    }
    return this.analysisReady();
  });

  /**
   * Último id já aplicado a partir da query string.
   *
   * Guardar isto — em vez de comparar com `patient()` — é o que impede o effect
   * de ler o paciente escolhido: se lesse, trocar de paciente pelo botão
   * "trocar" faria o effect rerodar e restaurar o da URL, desfazendo a escolha.
   * Assim ele só reage à query string mudar, que é o gatilho correto.
   */
  private lastPreselected: string | null = null;

  constructor() {
    effect(() => {
      const id = this.paciente();
      if (!id || id === this.lastPreselected) {
        return;
      }
      this.lastPreselected = id;
      this.loadingPatient.set(true);
      this.patients.get(id).subscribe({
        next: (detail) => {
          this.patient.set(detail);
          this.step.set('body-map');
          this.loadingPatient.set(false);
        },
        error: (cause: unknown) => {
          // Paciente inexistente ou de outro médico cai aqui como 404: o fluxo
          // volta para a etapa de escolha em vez de travar numa tela vazia.
          this.error.set(messageFromError(cause));
          this.loadingPatient.set(false);
        },
      });
    });
  }

  protected onPatientSelected(patient: Patient): void {
    this.patient.set(patient);
    this.step.set('body-map');
  }

  protected goTo(step: Step): void {
    if (step === 'patient' || this.patient()) {
      this.step.set(step);
    }
  }

  protected finish(): void {
    const patient = this.patient();
    if (!patient || this.saving()) {
      return;
    }

    // ORDEM CRÍTICA: coletar ANTES de marcar `saving`.
    //
    // É `saving` que desmonta o analisador para liberar a thread durante o envio.
    // Coletar depois encontraria `this.analyzer()` indefinido, a análise viraria
    // `null` e a consulta seria salva sem imagem nenhuma — sem erro, em silêncio.
    // Foi exatamente esse o bug. Por isso `enviarAnalise` recebe a coleta pronta
    // como parâmetro em vez de buscá-la: assim não há como inverter a ordem.
    const coletado = this.coletarAnalise();

    const payload = toEncounterCreate(
      this.store.toResult('CDAI', patient.id),
      this.closedIndexes(),
      { tender: this.store.tenderCount(), swollen: this.store.swollenCount() },
      this.reason(),
    );

    this.saving.set(true);
    this.error.set(null);
    this.patients.createEncounter(patient.id, payload).subscribe({
      next: (encounter) => {
        // A consulta e o body map já estão salvos. As imagens vêm depois, de
        // propósito: se o upload de dezenas de MB falhar, o registro clínico não
        // vai junto.
        void this.enviarAnalise(encounter.id, patient.id, coletado);
      },
      error: (cause: unknown) => {
        this.error.set(messageFromError(cause));
        this.saving.set(false);
      },
    });
  }

  /** Lê o analisador — avulsa ou sequência — enquanto ele ainda está montado. */
  private coletarAnalise(): CollectedAnalysis | null {
    const analisador = this.analyzer();
    if (!analisador) {
      return null;
    }
    return analisador.sequenceActive()
      ? this.coletarSequencia(analisador)
      : collectSingleAnalysis({
          matrix: analisador.matrix(),
          activeMatrix: analisador.activeMatrix(),
          mode: analisador.mode(),
          autoMethod: analisador.autoMethod(),
          agreement: analisador.agreement(),
          correction: analisador.correction(),
          jointRois: analisador.jointRois(),
          opticalFile: analisador.rgbFile(),
          thermalFile: analisador.jpegFile(),
          matrixFile: analisador.csvFile(),
        });
  }

  /**
   * Lê a sequência do analisador, casando cada captura com as ROIs da curva.
   *
   * As medições gravadas passam a ser **as mesmas** que a curva desenhou, porque vêm
   * do mesmo `curveFrames`. Recalcular aqui abriria espaço para o prontuário mostrar
   * números diferentes dos que o médico viu na tela.
   *
   * Os dois arrays derivam de `sequenceService.captures()` dentro do mesmo computed,
   * então andam juntos por índice — a asserção existe para o dia em que não andarem.
   */
  private coletarSequencia(
    analisador: ImageAnalyzerPage,
  ): ReturnType<typeof collectSequenceAnalysis> {
    const capturas = analisador.sequenceService.captures();
    const frames = analisador.curveFrames();
    if (capturas.length === 0 || frames.length !== capturas.length) {
      return null;
    }

    return collectSequenceAnalysis(
      capturas.map((captura, i) => ({
        index: captura.index,
        kind: captura.kind,
        label: captura.label,
        timeSeconds: captura.timeSeconds,
        matrix: captura.matrix,
        alignment: captura.alignment,
        autoMethod: captura.autoMethod,
        agreement: captura.agreement,
        correction: captura.correction,
        issue: captura.issue,
        jointRois: frames[i].rois as never,
        opticalFile: captura.optical,
        thermalFile: captura.thermal,
        matrixFile: captura.matrixFile,
      })),
    );
  }

  /**
   * Segunda fase do Finalizar: capturas, upload e fechamento em `ready`.
   *
   * Recebe `coletado` pronto porque a esta altura o analisador já foi desmontado
   * para liberar a thread — não há mais de onde ler.
   */
  private async enviarAnalise(
    encounterId: string,
    patientId: string,
    coletado: CollectedAnalysis | null,
  ): Promise<void> {
    if (!coletado) {
      // Etapa opcional não preenchida: a consulta com o body map já basta.
      this.saving.set(false);
      void this.router.navigate(['/pacientes', patientId]);
      return;
    }

    try {
      const criada = await firstValueFrom(
        this.patients.createCaptures(encounterId, coletado.payload),
      );

      this.uploadTotal.set(criada.uploads.length);
      this.uploadFailed.set([]);
      const resultado = await uploadAll(
        criada.uploads.map((upload) => {
          const file = coletado.files.get(uploadKey(upload.capture_index, upload.kind))!;
          return {
            url: upload.url,
            body: file,
            contentType: file.type || 'application/octet-stream',
            describe: `captura ${upload.capture_index}: ${upload.kind}`,
          };
        }),
        {
          onProgress: (p) => {
            this.uploadDone.set(p.done);
            this.uploadMbDone.set(p.bytesDone / 1e6);
            this.uploadMbTotal.set(p.bytesTotal / 1e6);
            this.uploadLast.set(p.lastDescribe);
          },
        },
      );

      // Diagnóstico: com a rede medida em ~5 MB/s, 48 MB deveriam levar ~10s. Se o
      // decorrido for muito maior que o tempo somado dentro dos PUTs, o gargalo não
      // é a rede — está na thread principal.
      console.info('[upload]', describeTimings(resultado));

      const { failed } = resultado;
      if (failed.length > 0) {
        // A consulta e o body map estão salvos; `analysis_status` fica em
        // 'uploading', que o prontuário mostra como envio incompleto.
        this.uploadFailed.set(failed.map((f) => f.describe));
        this.saving.set(false);
        this.error.set(
          `${failed.length} de ${criada.uploads.length} arquivos não subiram. ` +
            'A consulta e o mapa corporal foram salvos.',
        );
        return;
      }

      await firstValueFrom(this.patients.markAnalysisReady(encounterId));
      this.saving.set(false);
      void this.router.navigate(['/pacientes', patientId]);
    } catch (cause: unknown) {
      // A consulta e o body map continuam salvos; o que falhou foi o arquivamento.
      // `analysis_status` fica em 'uploading', que é estado recuperável.
      this.saving.set(false);
      const motivo = messageFromError(cause).replace(/[.\s]+$/, '');
      this.error.set(
        `A consulta e o mapa corporal foram salvos, mas as imagens não subiram: ${motivo}.`,
      );
    }
  }
}
