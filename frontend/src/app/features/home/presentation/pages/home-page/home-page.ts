import { Component } from '@angular/core';

import { Navbar } from '../../../../../shared/components/navbar/navbar';
import { AnalysisFlowSectionComponent } from './sections/analysis-flow/analysis-flow-section.component';
import { AboutSectionComponent } from './sections/about-section/about-section.component';
import { HeroSectionComponent } from './sections/hero-section/hero-section.component';
import { ResourcesSectionComponent } from './sections/resources-section/resources-section.component';

@Component({
  selector: 'app-home-page',
  imports: [
    Navbar,
    HeroSectionComponent,
    ResourcesSectionComponent,
    AnalysisFlowSectionComponent,
    AboutSectionComponent,
  ],
  templateUrl: './home-page.html',
})
export class HomePage {}
