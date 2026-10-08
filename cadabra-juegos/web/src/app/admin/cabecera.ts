import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Auth } from '../core/auth';
import { Destino, NAVEGACION } from '../core/navegacion';
import { Solicitudes } from '../core/solicitudes';

@Component({
  selector: 'app-cabecera-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabecera">
      <div class="ancho fila">
        <div>
          <p class="marca">Juegos de Cadabra</p>
          <h1>{{ titulo() }}</h1>
        </div>
        <nav>
          <span class="usuario">{{ auth.sesion()?.user?.email }}</span>
          @if (nav.urlCatalogo; as catalogo) { <a [href]="catalogo" class="enlace claro">Ver catálogo</a> }
          <button class="enlace claro" type="button" (click)="salir()">Salir</button>
        </nav>
      </div>
      <nav class="ancho pestanas" aria-label="Secciones del panel">
        <a [href]="nav.href('juegos')" [class.activa]="nav.actual() === 'juegos'" (click)="ir($event, 'juegos')">Juegos</a>
        <a [href]="nav.href('solicitudes')" [class.activa]="nav.actual() === 'solicitudes'" (click)="ir($event, 'solicitudes')">
          Solicitudes
          @if (solicitudes.totalPendientes(); as n) { <span class="cuenta">{{ n }}</span> }
        </a>
        <a [href]="nav.href('torneos')" [class.activa]="nav.actual() === 'torneos'" (click)="ir($event, 'torneos')">Torneos</a>
      </nav>
    </header>
  `,
  styles: `
    .cabecera { background: var(--tapete); color: var(--tapete-tinta); padding: 20px 0 0; }
    .fila { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; }
    .marca { margin: 0 0 4px; font-family: var(--display); font-weight: 700; color: var(--tapete-tenue); }
    h1 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 2rem; line-height: 1; }
    nav { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .usuario { color: var(--tapete-tenue); font-size: 0.9rem; }
    .enlace.claro { color: var(--tapete-tinta); }
    .pestanas { gap: 4px; margin-top: 16px; }
    .pestanas a { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px 12px 0 0;
      color: var(--tapete-tenue); text-decoration: none; font-weight: 600; }
    .pestanas a.activa { background: var(--mesa); color: var(--tinta); }
    .cuenta { background: var(--aviso); color: #fff; border-radius: 999px; padding: 0 8px; font-size: 0.75rem; line-height: 1.5; }
  `,
})
export class CabeceraAdmin {
  protected readonly auth = inject(Auth);
  protected readonly solicitudes = inject(Solicitudes);
  protected readonly nav = inject(NAVEGACION);

  readonly titulo = input.required<string>();

  protected async salir() {
    await this.auth.salir();
    this.nav.ir('entrar');
  }

  /** Un clic normal cambia de pantalla sin recargar; con Ctrl/Cmd o botón del medio se deja abrir en otra pestaña. */
  protected ir(e: MouseEvent, destino: Destino) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    this.nav.ir(destino);
  }
}
