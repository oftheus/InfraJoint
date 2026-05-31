import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PROTOCOL_STEPS_DATA } from './analysis-flow.data';
import { ProtocolStep, StepPhase } from './analysis-flow.model';
import { PhaseFilterComponent } from './components/phase-filter/phase-filter.component';
import { StepCardComponent } from './components/step-card/step-card.component';

@Component({
  selector: 'app-analysis-flow-section',
  imports: [CommonModule, PhaseFilterComponent, StepCardComponent],
  templateUrl: './analysis-flow-section.component.html',
})
export class AnalysisFlowSectionComponent {
  activeFilter: StepPhase | 'all' = 'all';
  steps: ProtocolStep[] = PROTOCOL_STEPS_DATA;

  onFilterChange(filter: StepPhase | 'all'): void {
    this.activeFilter = filter;
    this.steps = this.getFilteredSteps(filter);
  }

  private getFilteredSteps(filter: StepPhase | 'all'): ProtocolStep[] {
    if (filter === 'all') {
      return PROTOCOL_STEPS_DATA;
    }

    return PROTOCOL_STEPS_DATA.filter((step) => step.phase === filter);
  }
}
