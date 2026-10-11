import { Component } from '@angular/core';
import { SlowSectionComponent } from './slow-section.component';

@Component({
  selector: 'app-home',
  imports: [SlowSectionComponent],
  template: `
    <h1>HOME PAGE</h1>
    <div style="height: 3000px">spacer</div>
    @defer (hydrate on viewport) {
      <slow-section />
    } @placeholder {
      <p>placeholder</p>
    }
  `,
})
export class HomeComponent {}
