import { Injectable, computed, signal } from '@angular/core';

import {
  AssessmentResult,
  JointEvaluation,
  JointId,
  JointStatus,
  statusFromEvaluation,
} from './body-map.model';

/**
 * Signal-based store for an in-progress joint assessment.
 *
 * Holds the per-joint findings, derives the visual status map consumed by the
 * 3D viewer, and exposes the tender/swollen joint counts that feed the CDAI and
 * DAS28 disease-activity algorithms. Provided at the page level so each
 * assessment screen owns an isolated, disposable state.
 */
@Injectable()
export class JointAssessmentService {
  private readonly evaluationsSig = signal<ReadonlyMap<JointId, JointEvaluation>>(new Map());
  private readonly activeJointsSig = signal<readonly JointId[]>([]);

  /** Current per-joint evaluations (only joints the physician has touched). */
  readonly evaluations = this.evaluationsSig.asReadonly();

  /** Ids of every evaluated joint — drives the analyzed/not-analyzed markers. */
  readonly evaluatedIds = computed<ReadonlySet<JointId>>(
    () => new Set(this.evaluationsSig().keys()),
  );

  /** Tender Joint Count (TJC) over the active assessment's joints. */
  readonly tenderCount = computed(() => this.countWhere((evaluation) => evaluation.pain));

  /** Swollen Joint Count (SJC) over the active assessment's joints. */
  readonly swollenCount = computed(() => this.countWhere((evaluation) => evaluation.swelling));

  /** How many of the active assessment's joints have been evaluated. */
  readonly evaluatedCount = computed(() => {
    const active = new Set(this.activeJointsSig());
    let count = 0;
    for (const id of this.evaluationsSig().keys()) {
      if (active.has(id)) {
        count++;
      }
    }
    return count;
  });

  /** Total joints required by the active assessment. */
  readonly totalCount = computed(() => this.activeJointsSig().length);

  /** Declares which joints the current assessment evaluates (drives counts). */
  setActiveJoints(joints: readonly JointId[]): void {
    this.activeJointsSig.set([...joints]);
  }

  evaluationOf(id: JointId): JointEvaluation | undefined {
    return this.evaluationsSig().get(id);
  }

  statusOf(id: JointId): JointStatus {
    return statusFromEvaluation(this.evaluationsSig().get(id));
  }

  /** Records both findings for a joint at once. */
  setEvaluation(id: JointId, evaluation: JointEvaluation): void {
    const next = new Map(this.evaluationsSig());
    next.set(id, { ...evaluation });
    this.evaluationsSig.set(next);
  }

  setPain(id: JointId, pain: boolean): void {
    const current = this.evaluationsSig().get(id) ?? { pain: false, swelling: false };
    this.setEvaluation(id, { ...current, pain });
  }

  setSwelling(id: JointId, swelling: boolean): void {
    const current = this.evaluationsSig().get(id) ?? { pain: false, swelling: false };
    this.setEvaluation(id, { ...current, swelling });
  }

  /** Removes a joint's evaluation, returning it to the not-evaluated state. */
  clearEvaluation(id: JointId): void {
    const next = new Map(this.evaluationsSig());
    if (next.delete(id)) {
      this.evaluationsSig.set(next);
    }
  }

  /** Clears every evaluation. */
  reset(): void {
    this.evaluationsSig.set(new Map());
  }

  /** Serializes the current state for the disease-activity algorithms / API. */
  toResult(assessmentType: string, patientId?: number | string): AssessmentResult {
    const joints: Partial<Record<JointId, JointEvaluation>> = {};
    for (const [id, evaluation] of this.evaluationsSig()) {
      joints[id] = { ...evaluation };
    }
    return { patientId, assessmentType, joints };
  }

  private countWhere(predicate: (evaluation: JointEvaluation) => boolean): number {
    const active = new Set(this.activeJointsSig());
    let count = 0;
    for (const [id, evaluation] of this.evaluationsSig()) {
      if (active.has(id) && predicate(evaluation)) {
        count++;
      }
    }
    return count;
  }
}
