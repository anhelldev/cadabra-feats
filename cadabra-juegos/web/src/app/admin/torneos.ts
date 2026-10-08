import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Juegos, mensajeError, normalizar } from '../core/juegos';
import { ESTADOS, EstadoTorneo, FORMATOS, Torneo, Torneos } from '../core/torneos';
import { Pie } from '../shared/pie';
import { CabeceraAdmin } from './cabecera';
import { TorneoEditor } from './torneo-editor';
import { TorneoGestion } from './torneo-gestion';

type Filtro = 'activos' | 'borrador' | 'finalizado' | 'todos';

const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

@Component({
  selector: 'app-torneos-admin',
  imports: [CabeceraAdmin, Pie, TorneoEditor, TorneoGestion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-cabecera-admin titulo="Torneos" />

    <main class="ancho">
      <section class="cifras" aria-label="Resumen">
        <button type="button" [class.activa]="filtro() === 'activos'" (click)="filtro.set('activos')"><b>{{ cuentas().activos }}</b> activos</button>
        <button type="button" [class.activa]="filtro() === 'borrador'" (click)="filtro.set('borrador')"><b>{{ cuentas().borradores }}</b> borradores</button>
        <button type="button" [class.activa]="filtro() === 'finalizado'" (click)="filtro.set('finalizado')"><b>{{ cuentas().finalizados }}</b> finalizados</button>
        <button type="button" [class.activa]="filtro() === 'todos'" (click)="filtro.set('todos')"><b>{{ api.lista().length }}</b> en total</button>
      </section>

      <section class="filtros" aria-label="Filtros">
        <label class="campo crece">
          Buscar
          <input type="search" placeholder="Nombre del torneo…" autocomplete="off" [value]="q()" (input)="q.set($any($event.target).value)" />
        </label>
        <button class="boton" type="button" (click)="creando.set(true)">Nuevo torneo</button>
      </section>

      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

      <p class="cuenta-res" aria-live="polite">
        @if (api.cargando() && !api.lista().length) { Cargando… } @else { {{ filtrados().length }} {{ filtrados().length === 1 ? 'torneo' : 'torneos' }} }
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Torneo</th>
            <th scope="col">Fecha</th>
            <th scope="col">Formato</th>
            <th scope="col">Estado</th>
            <th scope="col">Inscritos</th>
            <th scope="col"><span class="oculto">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (t of filtrados(); track t.id) {
            <tr>
              <td data-etq="Torneo">
                <button class="nombre" type="button" (click)="gestionando.set(t)">{{ t.nombre }}</button>
                @if (nombreJuego(t); as j) { <small>{{ j }}</small> }
              </td>
              <td data-etq="Fecha">{{ fecha(t.fecha) }}</td>
              <td data-etq="Formato">{{ formatos[t.formato] }}</td>
              <td data-etq="Estado"><span class="estado" [attr.data-estado]="t.estado">{{ estados[t.estado] }}</span></td>
              <td data-etq="Inscritos">{{ inscritos(t) }} / {{ t.cupos }}</td>
              <td class="acciones"><button class="boton secundario chico" type="button" (click)="gestionando.set(t)">Gestionar</button></td>
            </tr>
          } @empty {
            @if (!api.cargando() || api.lista().length) {
              <tr><td class="vacio" colspan="6">{{ api.lista().length ? 'No hay torneos con ese filtro.' : 'Todavía no hay torneos. Crea el primero con «Nuevo torneo».' }}</td></tr>
            }
          }
        </tbody>
      </table>
    </main>

    <app-pie [bgg]="false" />

    @if (creando() || editando(); as e) {
      <app-torneo-editor
        [torneo]="editando()"
        [juegos]="juegos()"
        (guardado)="guardado($event)"
        (cerrar)="creando.set(false); editando.set(null)"
      />
    }
    @if (gestionando(); as g) {
      <app-torneo-gestion [torneo]="g" (cambio)="cambio($event)" (editar)="editar($event)" (cerrar)="gestionando.set(null)" />
    }
  `,
  styles: `
    .cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 20px 0 0; }
    .cifras button { text-align: left; padding: 12px 14px; border: 1px solid var(--linea); border-radius: 12px;
      background: var(--carta); cursor: pointer; color: var(--tenue); }
    .cifras b { display: block; font-family: var(--display); font-size: 1.6rem; color: var(--tinta); line-height: 1.1; }
    .cifras .activa { border-color: var(--accion); box-shadow: inset 0 0 0 2px var(--accion); }
    .filtros { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; padding: 16px 0 6px; }
    .campo.crece { flex: 1 1 240px; }
    .cuenta-res { margin: 8px 0; font-family: var(--display); font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    th { text-align: left; font-weight: 500; font-size: 0.8rem; color: var(--tenue); padding: 8px; border-bottom: 2px solid var(--tinta); }
    td { padding: 10px 8px; border-bottom: 1px solid var(--linea); vertical-align: middle; }
    td small { display: block; color: var(--tenue); font-size: 0.8rem; }
    .nombre { background: none; border: 0; padding: 0; font-weight: 600; text-align: left; cursor: pointer; }
    .nombre:hover { text-decoration: underline; }
    .estado { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--linea); color: var(--tinta); }
    .estado[data-estado='inscripcion'] { background: var(--ficha); color: var(--ficha-tinta); }
    .estado[data-estado='en_curso'] { background: var(--accion); color: #fff; }
    .estado[data-estado='finalizado'] { background: var(--ok); color: #fff; }
    .vacio { text-align: center; color: var(--tenue); padding: 28px 8px; }
    .acciones { text-align: right; white-space: nowrap; }
    .boton.chico { height: 34px; padding: 0 14px; font-size: 0.88rem; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 720px) {
      thead { display: none; }
      tr { display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--linea); }
      td { border: 0; padding: 0; }
      td[data-etq]:not([data-etq='Torneo'])::before { content: attr(data-etq) ': '; color: var(--tenue); font-size: 0.78rem; }
      .acciones { text-align: left; margin-top: 6px; }
    }
  `,
})
export class TorneosAdmin {
  protected readonly api = inject(Torneos);
  private readonly juegosApi = inject(Juegos);

  protected readonly estados = ESTADOS;
  protected readonly formatos = FORMATOS;
  protected readonly filtro = signal<Filtro>('activos');
  protected readonly q = signal('');
  protected readonly error = signal('');
  protected readonly juegos = signal<{ id: number; nombre: string }[]>([]);
  protected readonly creando = signal(false);
  protected readonly editando = signal<Torneo | null>(null);
  protected readonly gestionando = signal<Torneo | null>(null);

  private readonly activo = (e: EstadoTorneo) => e === 'inscripcion' || e === 'en_curso';
  protected readonly cuentas = computed(() => {
    const l = this.api.lista();
    return {
      activos: l.filter((t) => this.activo(t.estado)).length,
      borradores: l.filter((t) => t.estado === 'borrador').length,
      finalizados: l.filter((t) => t.estado === 'finalizado').length,
    };
  });
  protected readonly filtrados = computed(() => {
    const f = this.filtro(), q = normalizar(this.q().trim());
    return this.api.lista().filter(
      (t) =>
        (f === 'todos' || (f === 'activos' ? this.activo(t.estado) : t.estado === f)) && (!q || normalizar(t.nombre).includes(q)),
    );
  });

  constructor() {
    void this.api.cargar().catch((e) => this.error.set(mensajeError(e)));
    // Para elegir el juego del torneo; si falla, el torneo se puede crear sin juego.
    void this.juegosApi
      .todos()
      .then((js) => this.juegos.set(js.filter((j) => j.visible).map((j) => ({ id: j.id, nombre: j.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
      .catch(() => undefined);
  }

  protected fecha = (iso: string) => fechaCorta.format(new Date(iso));
  protected inscritos = (t: Torneo) => this.api.cuentas().get(t.id)?.inscritos ?? 0;
  protected nombreJuego = (t: Torneo) => this.juegos().find((j) => j.id === t.juego_id)?.nombre ?? '';

  protected guardado(t: Torneo) {
    void this.api.cargar();
    if (this.editando()) this.gestionando.set(t);
    else this.gestionando.set(t);
  }

  protected cambio(t: Torneo | null) {
    void this.api.cargar();
    if (!t) this.gestionando.set(null);
  }

  protected editar(t: Torneo) {
    this.gestionando.set(null);
    this.editando.set(t);
  }
}
