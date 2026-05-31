import { TestBed } from '@angular/core/testing';
import { AnalysisFlowSectionComponent } from './analysis-flow-section.component';

describe('AnalysisFlowSectionComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisFlowSectionComponent],
    }).compileComponents();
  });

  it('should create the section', () => {
    const fixture = TestBed.createComponent(AnalysisFlowSectionComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render the header', async () => {
    const fixture = TestBed.createComponent(AnalysisFlowSectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('Fluxo');
  });
});
