import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Bgg, FichaBgg, ResultadoBgg, TIPOS_BGG } from '../core/bgg';
import { Juego, mensajeError } from '../core/juegos';
import { DetalleBgg } from './detalle-bgg';

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_BGG.map((t) => [t.id, t.etiqueta]));

@Component({
  selector: 'app-buscar-bgg',
  imports: [DetalleBgg],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="b-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <h2 id="b-titulo">{{ juegoId() ? 'Vincular con BoardGameGeek' : 'Agregar juego desde BoardGameGeek' }}</h2>
        @if (!juegoId()) {
          <button class="enlace" type="button" (click)="manual.emit()">Crear sin BGG</button>
        }
      </header>

      <form (submit)="buscar($event)">
        <fieldset>
          <legend>Qué buscar</legend>
          <div class="tipos">
            @for (t of tipos; track t.id) {
              <label class="tipo" [class.on]="elegidos().has(t.id)">
                <input type="checkbox" [checked]="elegidos().has(t.id)" (change)="alternarTipo(t.id)" />
                {{ t.etiqueta }}
              </label>
            }
          </div>
        </fieldset>
        <div class="fila">
          <label class="campo">
            Nombre del juego
            <input #q type="search" [value]="consulta()" placeholder="Ej. Ark Nova" autocomplete="off"
              (input)="consulta.set($any($event.target).value)" />
          </label>
          <button class="boton" type="submit" [disabled]="buscando() || consulta().trim().length < 2 || !elegidos().size">
            {{ buscando() ? 'Buscando…' : 'Buscar' }}
          </button>
        </div>
        <p class="ayuda">La búsqueda se hace al pulsar Buscar (o Enter), para no saturar a BGG. Con el ojo ves el detalle de un resultado sin elegirlo.</p>
      </form>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (resultados(); as lista) {
        <p class="cuenta" aria-live="polite">
          @if (!lista.length) {
            Sin resultados para “{{ ultima() }}”. Prueba con el nombre en inglés o menos palabras.
          } @else {
            {{ lista.length }} de {{ total() }} resultados — elige uno para {{ juegoId() ? 'vincularlo' : 'agregarlo' }}
          }
        </p>
        <ul class="lista">
          @for (r of lista; track r.id) {
            <li>
              <button class="elegir" type="button" [disabled]="!!cargando() || !puedeElegir(r)" (click)="elegir(r)">
                <span class="nombre">{{ r.nombre }}</span>
                <span class="meta">
                  @if (r.anio) { {{ r.anio }} · }
                  {{ etiqueta(r.tipo) }}
                </span>
                @if (r.en_catalogo) {
                  <span class="ya">Ya está en el catálogo{{ r.en_catalogo.id === juegoId() ? ' (este juego)' : ': ' + r.en_catalogo.nombre }}</span>
                } @else if (cargando() === r.id) {
                  <span class="ya">Cargando…</span>
                }
              </button>
              <button class="ojo" type="button" [attr.aria-label]="'Ver detalle de ' + r.nombre" title="Ver detalle" (click)="ver(r)">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }

      <footer>
        <button class="boton secundario" type="button" (click)="dialogo.close()">Cerrar</button>
      </footer>
    </dialog>

    @if (detalle(); as d) {
      <app-detalle-bgg
        [candidato]="d"
        [puedeElegir]="puedeElegir(d)"
        [textoElegir]="juegoId() ? 'Vincular este' : 'Elegir este juego'"
        [aviso]="d.en_catalogo && d.en_catalogo.id !== juegoId() ? 'Ya está en el catálogo: ' + d.en_catalogo.nombre : null"
        (elegir)="elegirDesdeDetalle(d)"
        (cerrar)="detalle.set(null)"
      />
    }
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(620px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header, footer, form { padding: 16px 22px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid var(--linea); }
    footer { border-top: 1px solid var(--linea); display: flex; justify-content: flex-end; position: sticky; bottom: 0; background: var(--carta); }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.3rem; }
    form { display: grid; gap: 12px; }
    fieldset { border: 0; padding: 0; margin: 0; }
    legend { font-size: 0.85rem; color: var(--tenue); padding: 0; margin-bottom: 6px; }
    .tipos { display: flex; flex-wrap: wrap; gap: 6px; }
    .tipo { display: inline-flex; gap: 6px; align-items: center; padding: 5px 12px; border: 1px solid var(--linea);
      border-radius: 999px; font-size: 0.88rem; cursor: pointer; }
    .tipo.on { border-color: var(--accion); box-shadow: inset 0 0 0 1px var(--accion); }
    .tipo input { margin: 0; }
    .fila { display: flex; gap: 10px; align-items: end; }
    .fila .campo { flex: 1; }
    .ayuda { margin: 0; font-size: 0.8rem; color: var(--tenue); }
    .error { padding: 0 22px 8px; }
    .cuenta { margin: 0; padding: 4px 22px 8px; color: var(--tenue); font-size: 0.9rem; }
    .lista { list-style: none; margin: 0; padding: 0 22px 12px; display: grid; gap: 6px; }
    .lista li { display: flex; gap: 6px; }
    .elegir { flex: 1; min-width: 0; text-align: left; display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--linea);
      border-radius: 12px; background: var(--carta); cursor: pointer; }
    .elegir:hover:not([disabled]) { border-color: var(--accion); }
    .elegir[disabled] { opacity: 0.6; cursor: default; }
    .ojo { flex: none; width: 46px; border: 1px solid var(--linea); border-radius: 12px; background: var(--carta); cursor: pointer;
      display: grid; place-items: center; color: var(--tenue); }
    .ojo:hover { color: var(--accion); border-color: var(--accion); }
    .nombre { font-weight: 600; }
    .meta { font-size: 0.82rem; color: var(--tenue); }
    .ya { font-size: 0.8rem; color: var(--aviso); font-weight: 500; }
  `,
})
export class BuscarBgg {
  private readonly api = inject(Bgg);

  /** Si viene, el diálogo vincula ese juego del catálogo en vez de agregar uno nuevo. */
  readonly juegoId = input<number | null>(null);
  readonly consultaInicial = input('');
  readonly ficha = output<FichaBgg>();
  readonly vinculado = output<Juego>();
  readonly manual = output();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('q');

  protected readonly tipos = TIPOS_BGG;
  protected readonly elegidos = signal(new Set<string>(['boardgame']));
  protected readonly consulta = signal('');
  protected readonly buscando = signal(false);
  protected readonly cargando = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly resultados = signal<ResultadoBgg[] | null>(null);
  protected readonly total = signal(0);
  protected readonly ultima = signal('');

  /** Resultado cuyo detalle se está viendo (el ojo). El detalle lo pide y recuerda DetalleBgg. */
  protected readonly detalle = signal<ResultadoBgg | null>(null);

  constructor() {
    afterNextRender(() => {
      this.consulta.set(this.consultaInicial());
      this.dialogo().nativeElement.showModal();
      this.campo().nativeElement.focus();
    });
  }

  protected etiqueta = (t: string) => ETIQUETA_TIPO[t] ?? t;
  protected puedeElegir = (r: ResultadoBgg) => !r.en_catalogo || r.en_catalogo.id === this.juegoId();

  protected alternarTipo(id: string) {
    this.elegidos.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  protected async buscar(e: Event) {
    e.preventDefault();
    const q = this.consulta().trim();
    if (q.length < 2 || !this.elegidos().size || this.buscando()) return;
    this.error.set('');
    this.buscando.set(true);
    try {
      const r = await this.api.buscar(q, [...this.elegidos()]);
      this.resultados.set(r.resultados);
      this.total.set(r.total);
      this.ultima.set(q);
    } catch (err) {
      this.error.set(mensajeError(err));
    } finally {
      this.buscando.set(false);
    }
  }

  protected ver(r: ResultadoBgg) {
    this.error.set('');
    this.detalle.set(r);
  }

  protected async elegirDesdeDetalle(r: ResultadoBgg) {
    await this.elegir(r);
    if (this.error()) return;
    this.detalle.set(null);
  }

  protected async elegir(r: ResultadoBgg) {
    this.error.set('');
    this.cargando.set(r.id);
    try {
      const juegoId = this.juegoId();
      if (juegoId) this.vinculado.emit(await this.api.vincular(juegoId, r.id));
      else {
        this.ficha.emit(await this.api.ficha(r.id));
      }
    } catch (err) {
      this.error.set(mensajeError(err));
    } finally {
      this.cargando.set(null);
    }
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
