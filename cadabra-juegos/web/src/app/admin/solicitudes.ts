import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Juego, Juegos, mensajeError, normalizar } from '../core/juegos';
import { enlaceWhatsapp, Solicitud, Solicitudes } from '../core/solicitudes';
import { Pie } from '../shared/pie';
import { CabeceraAdmin } from './cabecera';

type Filtro = 'pendiente' | 'contactado' | 'todas' | 'listas';

interface Fila extends Solicitud {
  nombreJuego: string;
  /** El juego ya está en el local: es el momento de avisar a quien lo pidió. */
  enLocal: boolean;
  juegoBorrado: boolean;
  _n: string;
}

const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

@Component({
  selector: 'app-solicitudes-pagina',
  imports: [CabeceraAdmin, Pie],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-cabecera-admin titulo="Solicitudes para jugar" />

    <main class="ancho">
      <section class="cifras" aria-label="Resumen">
        <button type="button" [class.activa]="filtro() === 'pendiente'" (click)="filtro.set('pendiente')">
          <b>{{ cuentas().pendientes }}</b> pendientes
        </button>
        <button type="button" [class.activa]="filtro() === 'listas'" (click)="filtro.set('listas')">
          <b>{{ cuentas().listas }}</b> listas para avisar
        </button>
        <button type="button" [class.activa]="filtro() === 'contactado'" (click)="filtro.set('contactado')">
          <b>{{ cuentas().contactadas }}</b> contactadas
        </button>
        <button type="button" [class.activa]="filtro() === 'todas'" (click)="filtro.set('todas')">
          <b>{{ api.lista().length }}</b> en total
        </button>
      </section>

      <section class="filtros" aria-label="Filtros">
        <label class="campo crece">
          Buscar
          <input type="search" placeholder="Nombre, teléfono o juego…" autocomplete="off" [value]="q()" (input)="q.set($any($event.target).value)" />
        </label>
        <label class="campo">
          Mostrar
          <select [value]="filtro()" (change)="filtro.set($any($event.target).value)">
            <option value="pendiente">Pendientes</option>
            <option value="listas">Listas para avisar</option>
            <option value="contactado">Contactadas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
      </section>

      <p class="privacidad">Son datos personales: úsalos solo para avisar de la solicitud que hizo cada persona.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

      <p class="cuenta-res" aria-live="polite">
        @if (api.cargando() && !api.lista().length) {
          Cargando…
        } @else {
          {{ filtradas().length }} {{ filtradas().length === 1 ? 'resultado' : 'resultados' }}
        }
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Solicitada</th>
            <th scope="col">Persona</th>
            <th scope="col">Contacto</th>
            <th scope="col">Juego</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="oculto">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of filtradas(); track s.id) {
            <tr [class.hecha]="s.estado !== 'pendiente'" [class.lista]="s.enLocal && s.estado === 'pendiente'">
              <td class="fecha" data-etq="Solicitada">
                <b>{{ fecha(s.creado) }}</b>
                <small>{{ hace(s.creado) }}</small>
              </td>
              <td data-etq="Persona">
                <b>{{ s.nombre }}</b>
                @if (s.nota) { <em class="nota">“{{ s.nota }}”</em> }
              </td>
              <td class="contacto" data-etq="Contacto">
                <span>{{ s.telefono }}</span>
                @if (s.email) { <span>{{ s.email }}</span> }
              </td>
              <td data-etq="Juego">
                {{ s.nombreJuego }}
                @if (s.enLocal) { <span class="etiqueta ok">ya en el local</span> }
                @if (s.juegoBorrado) { <span class="etiqueta">juego eliminado</span> }
              </td>
              <td data-etq="Estado">
                @if (s.estado === 'contactado') {
                  <span class="ok-texto">Contactada</span>
                  @if (s.contactado_en) { <small>{{ fecha(s.contactado_en) }}</small> }
                } @else {
                  Pendiente
                }
              </td>
              <td class="acciones">
                <a class="boton whatsapp chico" [href]="whatsapp(s)" target="_blank" rel="noopener">WhatsApp</a>
                <a class="enlace" [href]="'tel:' + s.telefono">Llamar</a>
                @if (s.email) { <a class="enlace" [href]="'mailto:' + s.email">Correo</a> }
                <button class="enlace" type="button" [disabled]="ocupado() === s.id" (click)="cambiar(s, s.estado === 'contactado' ? 'pendiente' : 'contactado')">
                  {{ s.estado === 'contactado' ? 'Volver a pendiente' : 'Marcar contactada' }}
                </button>
                @if (confirmando() === s.id) {
                  <button class="boton peligro chico" type="button" [disabled]="ocupado() === s.id" (click)="borrar(s)">Sí, eliminar</button>
                  <button class="enlace" type="button" (click)="confirmando.set(null)">Cancelar</button>
                } @else {
                  <button class="enlace" type="button" (click)="confirmando.set(s.id)">Eliminar</button>
                }
              </td>
            </tr>
          } @empty {
            @if (!api.cargando() || api.lista().length) {
              <tr><td class="vacio" colspan="6">{{ api.lista().length ? 'No hay solicitudes con ese filtro.' : 'Todavía no hay solicitudes.' }}</td></tr>
            }
          }
        </tbody>
      </table>
    </main>

    <app-pie />
  `,
  styles: `
    .cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 20px 0 0; }
    .cifras button { text-align: left; padding: 12px 14px; border: 1px solid var(--linea); border-radius: 12px;
      background: var(--carta); cursor: pointer; color: var(--tenue); }
    .cifras b { display: block; font-family: var(--display); font-size: 1.6rem; color: var(--tinta); line-height: 1.1; }
    .cifras .activa { border-color: var(--accion); box-shadow: inset 0 0 0 2px var(--accion); }
    .filtros { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; padding: 16px 0 6px; }
    .campo.crece { flex: 1 1 240px; }
    .privacidad { margin: 6px 0 0; font-size: 0.8rem; color: var(--tenue); }
    .cuenta-res { margin: 8px 0; font-family: var(--display); font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    th { text-align: left; font-weight: 500; font-size: 0.8rem; color: var(--tenue); padding: 8px; border-bottom: 2px solid var(--tinta); }
    td { padding: 10px 8px; border-bottom: 1px solid var(--linea); vertical-align: top; }
    tr.hecha { opacity: 0.75; }
    tr.lista { background: color-mix(in srgb, var(--ficha) 14%, transparent); }
    td b { font-weight: 600; }
    td small { display: block; color: var(--tenue); font-size: 0.8rem; }
    .nota { display: block; font-size: 0.85rem; color: var(--tenue); }
    .contacto span { display: block; overflow-wrap: anywhere; }
    .contacto span:first-child { white-space: nowrap; }
    .etiqueta { display: inline-block; margin-left: 4px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--linea); font-size: 0.72rem; }
    .etiqueta.ok { color: var(--ok); border-color: currentColor; }
    .ok-texto { color: var(--ok); }
    .vacio { text-align: center; color: var(--tenue); padding: 28px 8px; }
    .acciones { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
    .whatsapp { display: inline-grid; place-items: center; text-decoration: none; background: #1f9d55; color: #fff; }
    .boton.chico { height: 34px; padding: 0 14px; font-size: 0.88rem; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 820px) {
      thead { display: none; }
      tr { display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--linea); }
      td { border: 0; padding: 0; }
      td[data-etq]::before { content: attr(data-etq) ': '; color: var(--tenue); font-size: 0.78rem; }
      td.fecha b, td.fecha small { display: inline; }
      .contacto span { display: inline; margin-right: 8px; }
      .acciones { margin-top: 6px; }
    }
  `,
})
export class SolicitudesPagina {
  protected readonly api = inject(Solicitudes);
  private readonly juegosApi = inject(Juegos);

  protected readonly filtro = signal<Filtro>('pendiente');
  protected readonly q = signal('');
  protected readonly confirmando = signal<number | null>(null);
  protected readonly ocupado = signal<number | null>(null);
  protected readonly error = signal('');
  private readonly juegos = signal<Juego[]>([]);

  private readonly filas = computed<Fila[]>(() => {
    const porId = new Map(this.juegos().map((j) => [j.id, j]));
    return this.api.lista().map((s) => {
      const juego = s.juego_id != null ? porId.get(s.juego_id) : undefined;
      const nombreJuego = juego?.nombre ?? s.juego_nombre;
      return {
        ...s,
        nombreJuego,
        enLocal: !!juego?.en_local,
        juegoBorrado: s.juego_id == null,
        _n: normalizar(`${s.nombre} ${s.telefono} ${s.email ?? ''} ${nombreJuego}`),
      };
    });
  });

  protected readonly cuentas = computed(() => {
    const f = this.filas();
    return {
      pendientes: f.filter((s) => s.estado === 'pendiente').length,
      listas: f.filter((s) => s.estado === 'pendiente' && s.enLocal).length,
      contactadas: f.filter((s) => s.estado === 'contactado').length,
    };
  });

  protected readonly filtradas = computed(() => {
    const f = this.filtro(), q = normalizar(this.q().trim());
    // Primero las de juegos que ya llegaron al local, luego las más recientes.
    return this.filas()
      .filter(
        (s) =>
          (f === 'todas' || (f === 'listas' ? s.estado === 'pendiente' && s.enLocal : s.estado === f)) && (!q || s._n.includes(q)),
      )
      .sort((a, b) => +(b.enLocal && b.estado === 'pendiente') - +(a.enLocal && a.estado === 'pendiente') || b.creado.localeCompare(a.creado));
  });

  constructor() {
    void this.api.cargar().catch((e) => this.error.set(mensajeError(e)));
    // Solo para saber el nombre actual del juego y si ya está en el local; la lista funciona sin esto.
    void this.juegosApi.todos().then((j) => this.juegos.set(j)).catch(() => undefined);
  }

  protected whatsapp = (s: Solicitud) => enlaceWhatsapp(s);
  protected fecha = (iso: string) => fechaCorta.format(new Date(iso));

  protected hace(iso: string): string {
    const minutos = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    const [valor, unidad]: [number, Intl.RelativeTimeFormatUnit] =
      Math.abs(minutos) < 60 ? [minutos, 'minute'] : Math.abs(minutos) < 1440 ? [Math.round(minutos / 60), 'hour'] : [Math.round(minutos / 1440), 'day'];
    return relativo.format(valor, unidad);
  }

  protected async cambiar(s: Solicitud, estado: 'pendiente' | 'contactado') {
    this.error.set('');
    this.ocupado.set(s.id);
    try {
      await this.api.cambiarEstado(s.id, estado);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async borrar(s: Solicitud) {
    this.error.set('');
    this.ocupado.set(s.id);
    try {
      await this.api.borrar(s.id);
      this.confirmando.set(null);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(null);
    }
  }
}
