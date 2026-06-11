import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-about-section',
  imports: [NgOptimizedImage],
  templateUrl: './about-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutSection {}
