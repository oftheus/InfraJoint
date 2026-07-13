import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import {
  Das28AcutePhase,
  DISEASE_ACTIVITY_META,
  calculateCdai,
  calculateDas28,
  cdaiActivityLevel,
  das28ActivityLevel,
} from '../../disease-activity';

/**
 * Computes and displays the CDAI or DAS28 disease-activity score.
 *
 * The 28-joint tender/swollen counts are fed automatically from the body map;
 * the clinician supplies the remaining parameters (global assessments and, for
 * DAS28, an acute-phase reactant). The score and activity category update live.
 */
@Component({
  selector: 'app-disease-activity-score',
  templateUrl: './disease-activity-score.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiseaseActivityScore {
  readonly assessmentType = input.required<string>();
  readonly tenderCount = input.required<number>();
  readonly swollenCount = input.required<number>();

  protected readonly isCdai = computed(() => this.assessmentType() === 'CDAI');

  // CDAI parameters (0–10 VAS).
  protected readonly patientGlobal = signal(0);
  protected readonly evaluatorGlobal = signal(0);

  // DAS28 parameters.
  protected readonly acutePhase = signal<Das28AcutePhase>('esr');
  protected readonly acuteValue = signal<number | null>(null);
  protected readonly globalHealth = signal(0); // 0–100 VAS

  /** Raw score, or `null` when a required input is still missing (DAS28 lab). */
  protected readonly score = computed<number | null>(() => {
    const tenderCount = this.tenderCount();
    const swollenCount = this.swollenCount();

    if (this.isCdai()) {
      return calculateCdai({
        tenderCount,
        swollenCount,
        patientGlobal: this.patientGlobal(),
        evaluatorGlobal: this.evaluatorGlobal(),
      });
    }

    const acuteValue = this.acuteValue();
    if (acuteValue === null || acuteValue < 0) {
      return null;
    }
    return calculateDas28({
      tenderCount,
      swollenCount,
      acutePhase: this.acutePhase(),
      acuteValue,
      patientGlobalHealth: this.globalHealth(),
    });
  });

  protected readonly displayScore = computed(() => {
    const score = this.score();
    if (score === null) {
      return null;
    }
    return this.isCdai() ? score.toFixed(1) : score.toFixed(2);
  });

  protected readonly levelMeta = computed(() => {
    const score = this.score();
    if (score === null) {
      return null;
    }
    const level = this.isCdai() ? cdaiActivityLevel(score) : das28ActivityLevel(score);
    return DISEASE_ACTIVITY_META[level];
  });

  protected readonly acuteLabel = computed(() => (this.acutePhase() === 'esr' ? 'VHS' : 'PCR'));
  protected readonly acuteUnit = computed(() => (this.acutePhase() === 'esr' ? 'mm/h' : 'mg/L'));

  protected setAcuteValue(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      this.acuteValue.set(null);
      return;
    }
    const value = Number(trimmed);
    this.acuteValue.set(Number.isFinite(value) && value >= 0 ? value : null);
  }

  protected setAcutePhase(phase: Das28AcutePhase): void {
    this.acutePhase.set(phase);
  }
}
