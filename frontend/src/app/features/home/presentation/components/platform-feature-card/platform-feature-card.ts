import { Component, Input } from '@angular/core';

export type PlatformFeatureIcon = 'workflow' | 'layers' | 'target' | 'timeline' | 'chart';

export interface PlatformFeature {
  readonly title: string;
  readonly description: string;
  readonly icon: PlatformFeatureIcon;
  readonly cardColor: string;
  readonly iconBackgroundColor: string;
  readonly iconColor: string;
}

@Component({
  selector: 'app-platform-feature-card',
  templateUrl: './platform-feature-card.html',
  host: {
    class: 'block h-full min-w-0',
  },
})
export class PlatformFeatureCard {
  @Input({ required: true }) feature!: PlatformFeature;
}
