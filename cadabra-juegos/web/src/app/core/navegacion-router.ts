import { inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Destino, Navegacion } from './navegacion';

const RUTAS: Record<Destino, string> = {
  juegos: '/admin',
  solicitudes: '/admin/solicitudes',
  torneos: '/admin/torneos',
  entrar: '/admin/entrar',
  restablecer: '/admin/restablecer',
};

const destinoDe = (url: string): Destino | null => {
  const ruta = url.split(/[?#]/)[0];
  return (Object.entries(RUTAS).find(([, r]) => r === ruta)?.[0] as Destino | undefined) ?? null;
};

/** Navegación de la app de Vercel: cada pantalla es una ruta del router. */
export class NavegacionRouter extends Navegacion {
  private readonly router = inject(Router);
  readonly actual = signal<Destino | null>(destinoDe(this.router.url));
  readonly urlCatalogo = '/';

  constructor() {
    super();
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => this.actual.set(destinoDe(e.urlAfterRedirects)));
  }

  ir(destino: Destino) {
    void this.router.navigateByUrl(RUTAS[destino]);
  }

  href(destino: Destino): string {
    return RUTAS[destino];
  }
}
