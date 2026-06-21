import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-users-page',
  templateUrl: './users-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {}
