import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { descartarGrupo, GrupoDuplicados } from '../core/duplicados';
import { faltantes, Juego, Juegos, mensajeError, miniaturaDe, puntosParaConservar } from '../core/juegos';

export interface Fusion {
  conservado: Juego;
  eliminados: number[];
}

const ORIGEN = { catalogo: 'catálogo', tienda: 'tienda', local: 'local', bgg: 'BGG' } as const;

@Component({
  selector: 'app-duplicados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="d-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <h2 id="d-titulo">Posibles duplicados</h2>
        <p>
          Elige cuál conservar. Lo que le falte (portada, enlace a la tienda, vínculo con BGG, datos de juego) se copia desde
          los otros antes de borrarlos.
        </p>
      </header>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <div class="cuerpo">
        @for (g of grupos(); track g.clave) {
          <fieldset class="grupo">
            <legend>
              <span class="motivo" [class.suave]="g.motivo === 'parecido'">
                {{ g.motivo === 'mismo' ? 'Mismo nombre' : 'Nombre casi igual' }}
              </span>
            </legend>
            <ul>
              @for (j of miembros(g); track j.id) {
                <li [class.elegido]="elegidoDe(g) === j.id">
                  <label>
                    <input type="radio" [name]="'g' + g.clave" [checked]="elegidoDe(g) === j.id" (change)="elegir(g, j.id)" />
                    <span class="mini">
                      @if (j.portada) { <img [src]="miniatura(j)" alt="" loading="lazy" width="40" height="40" /> }
                    </span>
                    <span class="datos">
                      <b>{{ j.nombre }}</b>
                      <small>{{ j.slug }}</small>
                      <span class="chips">
                        <span class="chip">{{ origen(j) }}</span>
                        <span class="chip" [class.ok]="j.visible">{{ j.visible ? 'Visible' : 'Oculto' }}</span>
                        @if (j.en_local) { <span class="chip ok">En el local</span> }
                        @if (j.bgg_id) { <span class="chip">BGG</span> }
                        @if (j.tienda_id) { <span class="chip">Tienda</span> }
                        @if (faltan(j); as f) { <span class="chip aviso">faltan {{ f }} datos</span> } @else { <span class="chip">completo</span> }
                        @if (elegidoDe(g) === j.id && sugerido(g) === j.id) { <span class="chip sug">sugerido</span> }
                      </span>
                    </span>
                  </label>
                </li>
              }
            </ul>

            <div class="acciones">
              @if (confirmando() === g.clave) {
                <span class="aviso-borrar">
                  Se conserva «{{ nombreElegido(g) }}» y se borran {{ g.ids.length - 1 }}
                  {{ g.ids.length - 1 === 1 ? 'juego' : 'juegos' }}. No se puede deshacer.
                </span>
                <button class="boton peligro" type="button" [disabled]="ocupado() === g.clave" (click)="fusionar(g)">
                  {{ ocupado() === g.clave ? 'Fusionando…' : 'Sí, fusionar' }}
                </button>
                <button class="boton secundario" type="button" [disabled]="ocupado() === g.clave" (click)="confirmando.set(null)">Cancelar</button>
              } @else {
                <button class="boton" type="button" (click)="confirmando.set(g.clave)">Fusionar en el elegido</button>
                <button class="enlace" type="button" (click)="descartar(g)">No son duplicados</button>
              }
            </div>
          </fieldset>
        } @empty {
          <p class="vacio">No hay posibles duplicados.</p>
        }
      </div>

      <footer>
        <button class="boton secundario" type="button" (click)="dialogo.close()">Cerrar</button>
      </footer>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(760px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { padding: 18px 22px 8px; position: sticky; top: 0; background: var(--carta); z-index: 1; border-bottom: 1px solid var(--linea); }
    h2 { margin: 0 0 4px; font-family: var(--display); font-weight: 800; font-size: 1.4rem; }
    header p { margin: 0 0 8px; color: var(--tenue); font-size: 0.9rem; max-width: 62ch; }
    footer { padding: 14px 22px; border-top: 1px solid var(--linea); display: flex; justify-content: flex-end; position: sticky; bottom: 0; background: var(--carta); }
    .error { padding: 8px 22px 0; margin: 0; }
    .cuerpo { padding: 14px 22px; display: grid; gap: 14px; }
    .vacio { color: var(--tenue); text-align: center; padding: 24px 0; margin: 0; }
    .grupo { border: 1px solid var(--linea); border-radius: 14px; padding: 6px 14px 14px; margin: 0; min-width: 0; }
    legend { padding: 0 6px; }
    .motivo { font-size: 0.78rem; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--accion); color: #fff; }
    .motivo.suave { background: transparent; color: var(--tenue); border: 1px solid var(--linea); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    li { border: 1px solid var(--linea); border-radius: 10px; }
    li.elegido { border-color: var(--accion); box-shadow: inset 0 0 0 1px var(--accion); }
    label { display: flex; gap: 10px; align-items: center; padding: 8px 10px; cursor: pointer; }
    .mini { width: 40px; height: 40px; flex: none; }
    .mini img { width: 40px; height: 40px; object-fit: cover; border-radius: 8px; background: #fff; display: block; }
    .datos { display: grid; gap: 2px; min-width: 0; }
    .datos small { color: var(--tenue); }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { font-size: 0.72rem; padding: 0 8px; border-radius: 999px; border: 1px solid var(--linea); color: var(--tenue); }
    .chip.ok { color: var(--ok); border-color: currentColor; }
    .chip.aviso { color: var(--aviso); border-color: currentColor; }
    .chip.sug { background: var(--ficha); color: var(--ficha-tinta); border-color: transparent; font-weight: 600; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 12px; }
    .aviso-borrar { flex: 1 1 100%; color: var(--aviso); font-size: 0.9rem; }
  `,
})
export class Duplicados {
  private readonly api = inject(Juegos);

  readonly grupos = input.required<GrupoDuplicados[]>();
  readonly juegos = input.required<Juego[]>();
  readonly fusionado = output<Fusion>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly error = signal('');
  protected readonly confirmando = signal<string | null>(null);
  protected readonly ocupado = signal<string | null>(null);
  private readonly elecciones = signal<Record<string, number>>({});
  private readonly porId = computed(() => new Map(this.juegos().map((j) => [j.id, j])));

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  protected miembros(g: GrupoDuplicados): Juego[] {
    return g.ids.map((id) => this.porId().get(id)).filter((j): j is Juego => !!j);
  }

  protected sugerido(g: GrupoDuplicados): number {
    return this.miembros(g).reduce((a, b) => (puntosParaConservar(b) > puntosParaConservar(a) ? b : a)).id;
  }

  protected elegidoDe(g: GrupoDuplicados): number {
    return this.elecciones()[g.clave] ?? this.sugerido(g);
  }

  protected nombreElegido(g: GrupoDuplicados): string {
    return this.porId().get(this.elegidoDe(g))?.nombre ?? '';
  }

  protected elegir(g: GrupoDuplicados, id: number) {
    this.elecciones.update((e) => ({ ...e, [g.clave]: id }));
    this.confirmando.set(null);
  }

  protected origen = (j: Juego) => ORIGEN[j.origen];
  protected faltan = (j: Juego) => faltantes(j).length;
  protected miniatura = miniaturaDe;

  protected descartar(g: GrupoDuplicados) {
    descartarGrupo(g.clave);
  }

  protected async fusionar(g: GrupoDuplicados) {
    const conservarId = this.elegidoDe(g);
    const conservar = this.porId().get(conservarId);
    const otros = this.miembros(g).filter((j) => j.id !== conservarId);
    if (!conservar || !otros.length) return;
    this.error.set('');
    this.ocupado.set(g.clave);
    try {
      const conservado = await this.api.fusionar(conservar, otros);
      this.confirmando.set(null);
      this.fusionado.emit({ conservado, eliminados: otros.map((o) => o.id) });
    } catch (e) {
      this.error.set(`No se pudo fusionar: ${mensajeError(e)}`);
    } finally {
      this.ocupado.set(null);
    }
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
