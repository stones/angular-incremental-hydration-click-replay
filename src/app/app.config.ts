import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideClientHydration, withEventReplay, withIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Blocking initial navigation so the routed component (and its hydrate triggers) exists
    // when Angular's incremental-hydration bootstrap listener runs.
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideClientHydration(withIncrementalHydration(), withEventReplay()),
  ],
};
