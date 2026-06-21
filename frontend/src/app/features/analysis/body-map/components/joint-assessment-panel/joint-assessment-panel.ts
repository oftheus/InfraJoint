import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import {
  JOINT_STATUS_META,
  JointDefinition,
  JointEvaluation,
  statusFromEvaluation,
} from '../../body-map.model';

/**
 * Compact panel for marking a single joint as painful and/or swollen.
 *
 * Fully controlled: it reflects the joint's current evaluation and emits the
 * physician's choices, leaving persistence to the parent store.
 */
@Component({
  selector: 'app-joint-assessment-panel',
  imports: [LucideDynamicIcon],
  templateUrl: './joint-assessment-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JointAssessmentPanel {
  readonly joint = input.required<JointDefinition>();
  readonly evaluation = input<JointEvaluation | undefined>(undefined);

  readonly painChange = output<boolean>();
  readonly swellingChange = output<boolean>();
  readonly cleared = output<void>();
  readonly closed = output<void>();

  /** `null` means the finding has not been answered yet. */
  protected readonly painValue = computed<boolean | null>(() => this.evaluation()?.pain ?? null);
  protected readonly swellingValue = computed<boolean | null>(
    () => this.evaluation()?.swelling ?? null,
  );
  protected readonly statusMeta = computed(() =>
    JOINT_STATUS_META[statusFromEvaluation(this.evaluation())],
  );
  protected readonly isEvaluated = computed(() => this.evaluation() !== undefined);
}
