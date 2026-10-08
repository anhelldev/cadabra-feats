import { InjectionToken } from '@angular/core';

/** Tema cuando el host no trae el atributo `tema`: la app sigue al sistema; los elements en WordPress parten de claro. */
export const TEMA_POR_DEFECTO = new InjectionToken<'claro' | 'oscuro' | 'auto'>('TEMA_POR_DEFECTO', { factory: () => 'auto' });
