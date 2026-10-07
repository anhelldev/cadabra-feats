import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../core/auth';
import { Solicitudes } from '../core/solicitudes';

@Component({
  selector: 'app-cabecera-admin',
  imports: [RouterLink, RouterLinkActive],
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
          <a routerLink="/" class="enlace claro">Ver catálogo</a>
          <button class="enlace claro" type="button" (click)="salir()">Salir</button>
        </nav>
      </div>
      <nav class="ancho pestanas" aria-label="Secciones del panel">
        <a routerLink="/admin" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: true }">Juegos</a>
        <a routerLink="/admin/solicitudes" routerLinkActive="activa">
          Solicitudes
          @if (solicitudes.totalPendientes(); as n) { <span class="cuenta">{{ n }}</span> }
        </a>
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
  private readonly router = inject(Router);

  readonly titulo = input.required<string>();

  protected async salir() {
    await this.auth.salir();
    await this.router.navigateByUrl('/admin/entrar');
  }
}
