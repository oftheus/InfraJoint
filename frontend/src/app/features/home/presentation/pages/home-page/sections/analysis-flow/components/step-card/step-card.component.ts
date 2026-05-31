import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  PatientGroupViewModel,
  ProtocolStepViewModel,
  StepBadgeVariant,
  StepTone,
} from '../../analysis-flow.presenter';

@Component({
  selector: 'app-step-card',
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './step-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('expandCollapse', [
      state('void', style({ height: '0', overflow: 'hidden' })),
      state('*', style({ height: '*' })),
      transition('void <=> *', animate('200ms ease')),
    ]),
  ],
})
export class StepCardComponent {
  readonly step = input.required<ProtocolStepViewModel>();
  readonly isLast = input(false);
  readonly isOpen = signal(false);

  readonly dotClasses = computed(() => {
    const base =
      'w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium border z-10 shrink-0';
    const map: Record<StepTone, string> = {
      info: 'bg-blue-50 text-blue-700 border-blue-200',
      success: 'bg-green-50 text-green-700 border-green-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      danger: 'bg-red-50 text-red-700 border-red-200',
      neutral: 'bg-gray-100 text-gray-700 border-gray-200',
      purple: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return `${base} ${map[this.step().tone]}`;
  });

  readonly lineClasses = computed(() => {
    if (this.isLast()) {
      return 'invisible w-px flex-1 mx-auto';
    }

    const map: Record<StepTone, string> = {
      info: 'bg-blue-100',
      success: 'bg-green-100',
      warning: 'bg-amber-100',
      danger: 'bg-red-100',
      neutral: 'bg-gray-200',
      purple: 'bg-purple-100',
    };
    return `w-px flex-1 mx-auto my-0.5 ${map[this.step().tone]}`;
  });

  readonly iconClasses = computed(() => {
    const base = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base';
    const map: Record<StepTone, string> = {
      info: 'bg-blue-50 text-blue-700',
      success: 'bg-green-50 text-green-700',
      warning: 'bg-amber-50 text-amber-700',
      danger: 'bg-red-50 text-red-700',
      neutral: 'bg-gray-100 text-gray-700',
      purple: 'bg-purple-50 text-purple-700',
    };
    return `${base} ${map[this.step().tone]}`;
  });

  readonly progressBarColor = computed(() => {
    const map: Record<StepTone, string> = {
      info: 'bg-blue-400',
      success: 'bg-green-400',
      warning: 'bg-amber-400',
      danger: 'bg-red-400',
      neutral: 'bg-gray-400',
      purple: 'bg-purple-400',
    };
    return map[this.step().tone];
  });

  tagClasses(variant: StepBadgeVariant): string {
    const base = 'text-[11px] px-2 py-0.5 rounded-full border';
    const map = {
      default: 'bg-gray-50 text-gray-500 border-gray-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      info: 'bg-blue-50 text-blue-700 border-blue-200',
      success: 'bg-green-50 text-green-700 border-green-200',
      purple: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return `${base} ${map[variant]}`;
  }

  groupClasses(variant: PatientGroupViewModel['variant']): string {
    const map = {
      danger: 'bg-red-50 text-red-700',
      warning: 'bg-amber-50 text-amber-700',
      success: 'bg-green-50 text-green-700',
      purple: 'bg-purple-50 text-purple-700',
    };
    return map[variant];
  }

  toggle(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }
}
