import { ChangeDetectionStrategy, Component } from '@angular/core';

import { NavbarComponent } from '../../../../../shared/components/navbar/navbar.component';
import { AnalysisFlowSectionComponent } from './sections/analysis-flow/analysis-flow-section.component';
import { AboutSectionComponent } from './sections/about-section/about-section.component';
import { HeroSectionComponent } from './sections/hero-section/hero-section.component';
import { ResourcesSectionComponent } from './sections/resources-section/resources-section.component';

@Component({
  selector: 'app-home-page',
  imports: [
    NavbarComponent,
    HeroSectionComponent,
    ResourcesSectionComponent,
    AnalysisFlowSectionComponent,
    AboutSectionComponent,
  ],
  templateUrl: './home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
