import { ChangeDetectionStrategy, Component, ElementRef, inject, ViewEncapsulation } from '@angular/core';
import { Auth } from '../core/auth';
import { FRAGMENTO_INICIAL, NAVEGACION } from '../core/navegacion';
import { aplicarTemaPorDefecto, TEMA_POR_DEFECTO } from '../core/tema';
import { Entrar } from './entrar';
import { Panel } from './panel';
import { Restablecer } from './restablecer';
import { SolicitudesPagina } from './solicitudes';
import { TorneosAdmin } from './torneos';

/**
 * El panel de admin como un solo element (<cadabra-admin>): cambia de pantalla por dentro, sin tocar la URL de la página de
 * WordPress. La seguridad real está en la base de datos (RLS); esto solo decide qué pantalla mostrar.
 */
@Component({
  selector: 'app-admin-element',
  imports: [Panel, SolicitudesPagina, TorneosAdmin, Entrar, Restablecer],
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../../tema.css', '../../base.css', '../../elements.css'],
  template: `
    @switch (nav.actual()) {
      @case ('juegos') { <app-panel /> }
      @case ('solicitudes') { <app-solicitudes-pagina /> }
      @case ('torneos') { <app-torneos-admin /> }
      @case ('restablecer') { <app-restablecer /> }
      @default { <app-entrar /> }
    }
  `,
})
export class AdminElement {
  protected readonly nav = inject(NAVEGACION);

  constructor() {
    aplicarTemaPorDefecto(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, inject(TEMA_POR_DEFECTO));
    const fragmento = inject(FRAGMENTO_INICIAL, { optional: true }) ?? '';
    // El enlace del correo de recuperar contraseña vuelve a esta misma página con la sesión en el fragmento (#…).
    if (/type=recovery|error=/.test(fragmento)) {
      this.nav.ir('restablecer');
      return;
    }
    // Sin sesión de admin, lo primero es entrar.
    void inject(Auth).comprobado().then((esAdmin) => {
      if (!esAdmin && this.nav.actual() !== 'restablecer') this.nav.ir('entrar');
    });
  }
}
