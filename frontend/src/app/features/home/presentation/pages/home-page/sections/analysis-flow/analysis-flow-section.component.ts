import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { PROTOCOL_STEPS } from './analysis-flow.data';
import { StepFilter, toProtocolStepViewModels } from './analysis-flow.presenter';
import { PhaseFilterComponent } from './components/phase-filter/phase-filter.component';
import { StepCardComponent } from './components/step-card/step-card.component';

@Component({
  selector: 'app-analysis-flow-section',
  imports: [CommonModule, PhaseFilterComponent, StepCardComponent],
  templateUrl: './analysis-flow-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisFlowSectionComponent {
  readonly activeFilter = signal<StepFilter>('all');
  private readonly allSteps = toProtocolStepViewModels(PROTOCOL_STEPS);
  readonly steps = computed(() => {
    const filter = this.activeFilter();
    return filter === 'all' ? this.allSteps : this.allSteps.filter((step) => step.phase === filter);
  });

  onFilterChange(filter: StepFilter): void {
    this.activeFilter.set(filter);
  }
}
