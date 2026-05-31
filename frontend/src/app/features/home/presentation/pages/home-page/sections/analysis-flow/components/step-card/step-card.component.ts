import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { PatientGroup, ProtocolStep, StepColor, StepTag } from '../../analysis-flow.model';

@Component({
  selector: 'app-step-card',
  imports: [CommonModule],
  templateUrl: './step-card.component.html',
  animations: [
    trigger('expandCollapse', [
      state('void', style({ height: '0', overflow: 'hidden' })),
      state('*', style({ height: '*' })),
      transition('void <=> *', animate('200ms ease')),
    ]),
  ],
})
export class StepCardComponent {
  @Input({ required: true }) step!: ProtocolStep;
  @Input() isLast = false;

  isOpen = false;

  get dotClasses(): string {
    const base =
      'w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium border z-10 shrink-0';
    const map: Record<StepColor, string> = {
      info: 'bg-blue-50 text-blue-700 border-blue-200',
      success: 'bg-green-50 text-green-700 border-green-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      danger: 'bg-red-50 text-red-700 border-red-200',
      neutral: 'bg-gray-100 text-gray-700 border-gray-200',
      purple: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return `${base} ${map[this.step.color]}`;
  }

  get lineClasses(): string {
    if (this.isLast) {
      return 'invisible w-px flex-1 mx-auto';
    }

    const map: Record<StepColor, string> = {
      info: 'bg-blue-100',
      success: 'bg-green-100',
      warning: 'bg-amber-100',
      danger: 'bg-red-100',
      neutral: 'bg-gray-200',
      purple: 'bg-purple-100',
    };
    return `w-px flex-1 mx-auto my-0.5 ${map[this.step.color]}`;
  }

  get iconClasses(): string {
    const base = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base';
    const map: Record<StepColor, string> = {
      info: 'bg-blue-50 text-blue-700',
      success: 'bg-green-50 text-green-700',
      warning: 'bg-amber-50 text-amber-700',
      danger: 'bg-red-50 text-red-700',
      neutral: 'bg-gray-100 text-gray-700',
      purple: 'bg-purple-50 text-purple-700',
    };
    return `${base} ${map[this.step.color]}`;
  }

  get progressBarColor(): string {
    const map: Record<StepColor, string> = {
      info: 'bg-blue-400',
      success: 'bg-green-400',
      warning: 'bg-amber-400',
      danger: 'bg-red-400',
      neutral: 'bg-gray-400',
      purple: 'bg-purple-400',
    };
    return map[this.step.color];
  }

  tagClasses(variant: StepTag['variant']): string {
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

  groupClasses(variant: PatientGroup['variant']): string {
    const map = {
      danger: 'bg-red-50 text-red-700',
      warning: 'bg-amber-50 text-amber-700',
      success: 'bg-green-50 text-green-700',
      purple: 'bg-purple-50 text-purple-700',
    };
    return map[variant];
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }
}
