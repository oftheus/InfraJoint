import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { StepPhase } from '../../analysis-flow.model';

interface PhaseFilterOption {
  value: StepPhase | 'all';
  label: string;
}

@Component({
  selector: 'app-phase-filter',
  imports: [CommonModule],
  templateUrl: './phase-filter.component.html',
})
export class PhaseFilterComponent {
  @Input() activeFilter: StepPhase | 'all' = 'all';
  @Output() filterChange = new EventEmitter<StepPhase | 'all'>();

  readonly filters: PhaseFilterOption[] = [
    { value: 'all', label: 'Todas as etapas' },
    { value: 'prep', label: 'Preparação' },
    { value: 'cap', label: 'Captura' },
    { value: 'cli', label: 'Clínica' },
  ];

  setFilter(filter: StepPhase | 'all'): void {
    if (filter === this.activeFilter) {
      return;
    }

    this.filterChange.emit(filter);
  }

  buttonClasses(filter: StepPhase | 'all'): string {
    if (filter === this.activeFilter) {
      return 'px-4 py-1.5 text-xs rounded-full bg-blue-50 text-[#32B5FE] border border-[#32B5FE] font-medium';
    }

    return 'px-4 py-1.5 text-xs rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer';
  }
}
