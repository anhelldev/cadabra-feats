import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NAVEGACION } from './core/navegacion';
import { NavegacionRouter } from './core/navegacion-router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: NAVEGACION, useClass: NavegacionRouter },
  ]
};
