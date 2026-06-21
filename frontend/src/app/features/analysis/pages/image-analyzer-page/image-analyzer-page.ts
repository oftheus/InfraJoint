import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-image-analyzer-page',
  templateUrl: './image-analyzer-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageAnalyzerPage {}
