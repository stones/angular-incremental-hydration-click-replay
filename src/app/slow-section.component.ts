import { isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'slow-section',
  imports: [RouterLink],
  template: '<a id="link" routerLink="/target" (click)="onClick()">Go to target</a>',
})
export class SlowSectionComponent {
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      console.log('slow-section constructor start');
      // Simulate an expensive component so the "hydration in progress" window is wide and deterministic.
      const end = performance.now() + 400;
      while (performance.now() < end) {}
      console.log('slow-section constructor end');
    }
  }

  onClick(): void {
    console.log('handler ran');
  }
}
