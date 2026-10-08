import { InjectionToken, signal, Signal } from '@angular/core';

export type Destino = 'juegos' | 'solicitudes' | 'torneos' | 'entrar' | 'restablecer';

/**
 * Cómo se mueve el panel de admin entre sus pantallas. En la app de Vercel lo hace el router (URLs reales); dentro de WordPress
 * (<cadabra-admin>) no puede tocar la URL de la página, así que cambia de pantalla internamente.
 */
export abstract class Navegacion {
  abstract readonly actual: Signal<Destino | null>;
  /** Página del catálogo público, para el enlace "Ver catálogo"; nulo si no se sabe cuál es. */
  abstract readonly urlCatalogo: string | null;
  abstract ir(destino: Destino): void;
  /** Dirección para el atributo href del enlace (el clic lo intercepta `ir`). */
  abstract href(destino: Destino): string;
}

export const NAVEGACION = new InjectionToken<Navegacion>('NAVEGACION');

/** Navegación del element de WordPress: la pantalla actual es solo una señal. */
export class NavegacionElemento extends Navegacion {
  readonly actual = signal<Destino | null>('juegos');
  constructor(readonly urlCatalogo: string | null) {
    super();
  }
  ir(destino: Destino) {
    this.actual.set(destino);
  }
  href(): string {
    return '#';
  }
}

/** Dirección a la que Supabase manda el correo de recuperar contraseña. */
export const URL_RECUPERACION = new InjectionToken<string>('URL_RECUPERACION', { factory: () => `${location.origin}/admin/restablecer` });

/** Fragmento (#…) de la dirección al cargar, leído antes de que Supabase lo procese y lo borre. */
export const FRAGMENTO_INICIAL = new InjectionToken<string>('FRAGMENTO_INICIAL');
