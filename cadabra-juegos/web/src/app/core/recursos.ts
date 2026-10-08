import { InjectionToken } from '@angular/core';

/** Dónde viven los archivos estáticos (img/…). En la app basta la ruta relativa; el element, dentro de WordPress, necesita la URL completa. */
export const URL_BASE = new InjectionToken<string>('URL_BASE', { factory: () => '' });
