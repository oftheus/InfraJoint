import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-patients-page',
  templateUrl: './patients-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientsPage {}
