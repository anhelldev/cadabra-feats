import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Bgg, ErrorFuncion } from '../core/bgg';
import { CandidatoBgg, Juego, Juegos, mensajeError, miniaturaDe, normalizar, puntosParaConservar, textoDuracion } from '../core/juegos';
import { claveNombre } from '../core/duplicados';
import { DetalleBgg } from './detalle-bgg';
import { Fusion } from './duplicados';

const PAUSA_ENTRE_PETICIONES_MS = 1200;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Fallo {
  juego: Juego;
  mensaje: string;
}

/** Qué tan parecido es el nombre de la opción de BGG al del juego: igual > empieza igual > lo contiene. */
function parecido(nombre: string, candidato: CandidatoBgg): number {
  // Mismo nombre salvo plurales, espacios, artículos o "juego/base/edición" (p. ej. "7 Wonder Duel" y "7 Wonders Duel").
  if (claveNombre(nombre) === claveNombre(candidato.nombre)) return 3;
  const a = normalizar(nombre).replace(/[^a-z0-9]+/g, ' ').trim();
  const b = normalizar(candidato.nombre).replace(/[^a-z0-9]+/g, ' ').trim();
  if (a === b) return 3;
  if (b.startsWith(a) || a.startsWith(b)) return 2;
  return b.includes(a) || a.includes(b) ? 1 : 0;
}

@Component({
  selector: 'app-revisar-bgg',
  imports: [DetalleBgg],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="r-titulo" (close)="cerrar.emit()" (cancel)="impedirSiHayCola($event)" (click)="fuera($event)">
      <header>
        <div>
          <h2 id="r-titulo">Revisar vínculos con BGG</h2>
          <p>
            {{ pendientes().length }} {{ pendientes().length === 1 ? 'juego por decidir' : 'juegos por decidir' }}
            @if (enCola()) { · vinculando {{ enCola() }}… }
          </p>
        </div>
        <button class="boton secundario" type="button" [disabled]="enCola() > 0" (click)="dialogo.close()">
          {{ enCola() ? 'Terminando…' : 'Cerrar' }}
        </button>
      </header>

      @if (fallos().length) {
        <ul class="fallos" role="alert">
          @for (f of fallos(); track f.juego.id) {
            <li>
              <span><b>{{ f.juego.nombre }}</b>: {{ f.mensaje }}</span>
              <button class="enlace" type="button" (click)="reintentar(f)">Reintentar</button>
            </li>
          }
        </ul>
      }

      @if (actual(); as j) {
        <div class="cuerpo">
          <section class="mio" aria-label="Tu juego">
            <p class="etiqueta">Tu juego</p>
            <div class="portada">
              @if (j.portada) { <img [src]="miniaturaMia(j)" alt="" /> } @else { <span>Sin portada</span> }
            </div>
            <h3>{{ j.nombre }}</h3>
            <p class="datos">
              {{ j.categoria ?? 'Sin categoría' }}<br />
              {{ jugadores(j) }} jug. · {{ duracion(j) }}<br />
              {{ j.edad_min ? j.edad_min + '+ años' : '' }}
            </p>
            <p class="chips">
              <span class="chip" [class.ok]="j.visible">{{ j.visible ? 'Visible' : 'Oculto' }}</span>
              @if (j.en_local) { <span class="chip ok">En el local</span> }
              @if (j.revisar) { <span class="chip aviso">estimado</span> }
            </p>
          </section>

          <section class="opciones" aria-label="Opciones de BGG">
            <p class="etiqueta">
              {{ j.bgg_candidatos.length === 1 ? 'BGG encontró una opción' : 'BGG encontró ' + j.bgg_candidatos.length + ' opciones' }}
            </p>
            <ul>
              @for (c of ordenadas(j); track c.id + c.tipo) {
                <li [class.sugerida]="sugerida(j)?.id === c.id">
                  <span class="mini">
                    @if (miniaturas()[c.id]; as url) {
                      <img [src]="url" alt="" loading="lazy" />
                    } @else if (miniaturas()[c.id] === undefined) {
                      <span class="cargando" aria-hidden="true"></span>
                    }
                  </span>
                  <span class="texto">
                    <b>{{ c.nombre }}</b>
                    <small>
                      @if (c.anio) { {{ c.anio }} · }
                      {{ c.tipo === 'boardgameexpansion' ? 'Expansión' : 'Juego de mesa' }}
                      @if (sugerida(j)?.id === c.id) { · <span class="sug">Sugerida</span> }
                    </small>
                    @if (titular(j, c); as t) {
                      <small class="aviso">Ya está vinculado a «{{ t.nombre }}» ({{ t.visible ? 'visible' : 'oculto' }}). ¿Es el mismo juego duplicado?</small>
                      @if (fusionando() === c.id) {
                        <span class="fusion">
                          Se conserva «{{ quedaria(j, t).conservar.nombre }}» y se borra «{{ quedaria(j, t).borrar.nombre }}». No se puede deshacer.
                          <button class="boton peligro" type="button" [disabled]="ocupado()" (click)="fusionar(j, t)">
                            {{ ocupado() ? 'Fusionando…' : 'Sí, fusionar' }}
                          </button>
                          <button class="enlace" type="button" (click)="fusionando.set(null)">Cancelar</button>
                        </span>
                      } @else {
                        <button class="enlace" type="button" (click)="fusionando.set(c.id)">Es el mismo juego: fusionar</button>
                      }
                    } @else if (c.motivo) {
                      <small class="aviso">{{ c.motivo }}</small>
                    }
                    <a class="enlace" [href]="enlace(c)" target="_blank" rel="noopener">Ver en BGG</a>
                  </span>
                  <button class="ojo" type="button" [attr.aria-label]="'Ver detalle de ' + c.nombre" title="Ver detalle" (click)="detalle.set({ juego: j, c })">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                  </button>
                  <button class="boton" [class.secundario]="sugerida(j)?.id !== c.id" type="button" [disabled]="bloqueada(j, c)" (click)="aceptar(j, c)">
                    Aceptar
                  </button>
                </li>
              }
            </ul>

            <div class="acciones">
              <button class="boton secundario" type="button" [disabled]="ocupado()" (click)="ninguna(j)">Ninguna de estas</button>
              <button class="boton secundario" type="button" (click)="buscarManual.emit(j)">Buscar a mano</button>
              <button class="enlace" type="button" (click)="saltar(j)">Saltar por ahora</button>
            </div>
          </section>
        </div>
      } @else {
        <div class="fin">
          @if (!pendientes().length) {
            <p><b>No quedan juegos por decidir.</b></p>
            @if (enCola()) { <p>Terminando de vincular los últimos {{ enCola() }}…</p> }
          } @else {
            <p><b>Saltaste {{ pendientes().length === 1 ? 'el juego que queda' : 'los ' + pendientes().length + ' que quedan' }}.</b></p>
            <button class="boton" type="button" (click)="saltados.set(vacio)">Volver a empezar</button>
          }
        </div>
      }
    </dialog>

    @if (detalle(); as d) {
      <app-detalle-bgg
        [candidato]="d.c"
        [puedeElegir]="!bloqueada(d.juego, d.c)"
        textoElegir="Aceptar esta"
        [aviso]="avisoBloqueo(d.juego, d.c)"
        (elegir)="aceptarDesdeDetalle(d.juego, d.c)"
        (cerrar)="detalle.set(null)"
      />
    }
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(920px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 22px;
      border-bottom: 1px solid var(--linea); position: sticky; top: 0; background: var(--carta); z-index: 1; }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.3rem; }
    header p { margin: 2px 0 0; color: var(--tenue); font-size: 0.88rem; }
    .fallos { list-style: none; margin: 0; padding: 10px 22px; background: color-mix(in srgb, var(--aviso) 12%, transparent); color: var(--aviso); font-size: 0.88rem; display: grid; gap: 4px; }
    .fallos li { display: flex; justify-content: space-between; gap: 10px; }
    .cuerpo { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 22px; padding: 18px 22px 22px; }
    .etiqueta { margin: 0 0 8px; font-size: 0.8rem; font-weight: 600; color: var(--tenue); text-transform: uppercase; letter-spacing: 0.03em; }
    .mio { display: grid; gap: 8px; align-content: start; }
    .portada { width: 100%; aspect-ratio: 4 / 3; border-radius: 12px; background: var(--mesa); overflow: hidden; display: grid; place-items: center; color: var(--tenue); font-size: 0.85rem; }
    .portada img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
    h3 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.25rem; line-height: 1.15; }
    .datos { margin: 0; color: var(--tenue); font-size: 0.9rem; }
    .chips { margin: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { font-size: 0.72rem; padding: 0 8px; border-radius: 999px; border: 1px solid var(--linea); color: var(--tenue); }
    .chip.ok { color: var(--ok); border-color: currentColor; }
    .chip.aviso { color: var(--aviso); border-color: currentColor; }
    ul { list-style: none; margin: 0; padding: 0; }
    .opciones ul { display: grid; gap: 8px; }
    .opciones li { display: flex; gap: 12px; align-items: center; padding: 8px 10px; border: 1px solid var(--linea); border-radius: 12px; }
    .opciones li.sugerida { border-color: var(--accion); box-shadow: inset 0 0 0 1px var(--accion); }
    .mini { flex: none; width: 56px; height: 68px; border-radius: 8px; background: var(--mesa); overflow: hidden; display: grid; place-items: center; }
    .mini img { width: 56px; height: 68px; object-fit: contain; background: #fff; display: block; }
    .cargando { width: 100%; height: 100%; background: linear-gradient(90deg, var(--mesa), var(--linea), var(--mesa)); background-size: 200% 100%; animation: brillo 1.2s linear infinite; }
    @keyframes brillo { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .cargando { animation: none; } }
    .texto { flex: 1; min-width: 0; display: grid; gap: 1px; }
    .texto small { color: var(--tenue); }
    .texto small.aviso { color: var(--aviso); }
    .sug { color: var(--accion); font-weight: 600; }
    .ojo { flex: none; width: 40px; height: 40px; border: 1px solid var(--linea); border-radius: 10px; background: var(--carta);
      color: var(--tenue); cursor: pointer; display: grid; place-items: center; }
    .ojo:hover { color: var(--accion); border-color: var(--accion); }
    .fusion { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 0.82rem; color: var(--aviso); }
    .fusion .boton { height: 34px; padding: 0 12px; font-size: 0.85rem; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 14px; }
    .fin { padding: 40px 22px; text-align: center; display: grid; gap: 10px; justify-items: center; }
    .fin p { margin: 0; }
    @media (max-width: 700px) { .cuerpo { grid-template-columns: 1fr; } .portada { aspect-ratio: 16 / 9; } .opciones li { flex-wrap: wrap; } }
  `,
})
export class RevisarBgg {
  private readonly api = inject(Bgg);
  private readonly datos = inject(Juegos);

  readonly juegos = input.required<Juego[]>();
  /** Un juego cambió (se vinculó o se descartó): el panel actualiza su lista. */
  readonly actualizado = output<Juego>();
  /** Se fusionaron dos duplicados: el panel quita el borrado de su lista. */
  readonly fusionado = output<Fusion>();
  readonly buscarManual = output<Juego>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected readonly vacio = new Set<number>();
  protected readonly saltados = signal(this.vacio);
  protected readonly enCola = signal(0);
  protected readonly ocupado = signal(false);
  protected readonly fusionando = signal<number | null>(null);
  /** Opción de BGG cuyo detalle se está viendo (el ojo), junto con el juego que se está revisando. */
  protected readonly detalle = signal<{ juego: Juego; c: CandidatoBgg } | null>(null);
  protected readonly fallos = signal<Fallo[]>([]);
  /** id de BGG → url de la miniatura; null si BGG no la tiene o falló; ausente = todavía no se pidió. */
  protected readonly miniaturas = signal<Record<number, string | null>>({});

  protected readonly pendientes = computed(() =>
    this.juegos()
      .filter((j) => j.bgg_estado === 'dudoso' && j.bgg_candidatos.length)
      .sort((a, b) => +b.visible - +a.visible || +b.en_local - +a.en_local || a.nombre.localeCompare(b.nombre, 'es')),
  );
  protected readonly actual = computed(() => this.pendientes().find((j) => !this.saltados().has(j.id)) ?? null);

  private readonly pidiendo = new Set<number>();
  /** Una sola petición a BGG a la vez, con una pausa entre ellas: BGG limita el ritmo. */
  private turno: Promise<unknown> = Promise.resolve();

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
    // Pide por adelantado las miniaturas del juego actual y los dos siguientes, todas en una sola petición.
    effect(() => {
      const proximos = this.pendientes().filter((j) => !this.saltados().has(j.id)).slice(0, 3);
      const ya = untracked(this.miniaturas);
      const ids = [...new Set(proximos.flatMap((j) => j.bgg_candidatos.map((c) => c.id)))].filter((id) => !(id in ya) && !this.pidiendo.has(id)).slice(0, 20);
      if (ids.length) untracked(() => this.pedirMiniaturas(ids));
    });
  }

  private encadenar<T>(tarea: () => Promise<T>): Promise<T> {
    const p = this.turno.then(() => dormir(PAUSA_ENTRE_PETICIONES_MS)).then(tarea);
    this.turno = p.catch(() => undefined);
    return p;
  }

  private async pedirMiniaturas(ids: number[]) {
    ids.forEach((id) => this.pidiendo.add(id));
    let resultado: Record<number, string> = {};
    try {
      resultado = await this.encadenar(() => this.api.miniaturas(ids));
    } catch {
      // Las miniaturas son un extra: sin ellas se decide igual con nombre, año y tipo.
    }
    this.miniaturas.update((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, resultado[id] ?? null])) }));
    ids.forEach((id) => this.pidiendo.delete(id));
  }

  protected ordenadas(j: Juego): CandidatoBgg[] {
    const unicos = j.bgg_candidatos.filter((c, i, todos) => todos.findIndex((x) => x.id === c.id) === i);
    return unicos.sort((a, b) => parecido(j.nombre, b) - parecido(j.nombre, a) || (b.anio ?? 0) - (a.anio ?? 0));
  }

  /** Marca como sugerida la opción más parecida (o la única); entre nombres iguales, la más reciente. */
  protected sugerida(j: Juego): CandidatoBgg | null {
    const todas = this.ordenadas(j);
    const libres = todas.filter((c) => !this.bloqueada(j, c));
    if (!libres.length) return null;
    // Una opción que sobra porque la buena está bloqueada no se sugiere: "única" significa que BGG dio solo una.
    return todas.length === 1 || parecido(j.nombre, libres[0]) >= 2 ? libres[0] : null;
  }

  /** El juego del catálogo que ya tiene esa opción de BGG: un juego de BGG solo puede estar vinculado a uno. */
  protected titular(j: Juego, c: CandidatoBgg): Juego | undefined {
    return this.juegos().find((x) => x.bgg_id === c.id && x.id !== j.id);
  }

  protected avisoBloqueo(j: Juego, c: CandidatoBgg): string | null {
    const t = this.titular(j, c);
    if (t) return `Ya está vinculado a «${t.nombre}». Si es el mismo juego, fusiónalos para poder vincularlo.`;
    return c.motivo ?? null;
  }

  protected aceptarDesdeDetalle(j: Juego, c: CandidatoBgg) {
    this.detalle.set(null);
    this.aceptar(j, c);
  }

  protected bloqueada(j: Juego, c: CandidatoBgg): boolean {
    return !!c.motivo || !!this.titular(j, c);
  }

  /** Al fusionar se conserva el que está visible y más completo; a igualdad, el que ya tiene el vínculo con BGG. */
  protected quedaria(j: Juego, t: Juego): { conservar: Juego; borrar: Juego } {
    return puntosParaConservar(j) > puntosParaConservar(t) ? { conservar: j, borrar: t } : { conservar: t, borrar: j };
  }

  protected async fusionar(j: Juego, t: Juego) {
    const { conservar, borrar } = this.quedaria(j, t);
    this.ocupado.set(true);
    try {
      const conservado = await this.datos.fusionar(conservar, [borrar]);
      this.fusionando.set(null);
      this.fusionado.emit({ conservado, eliminados: [borrar.id] });
    } catch (e) {
      this.fallos.update((f) => [...f, { juego: j, mensaje: `No se pudo fusionar: ${mensajeError(e)}` }]);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected aceptar(j: Juego, c: CandidatoBgg) {
    this.saltados.update((s) => new Set(s).add(j.id));
    this.enCola.update((n) => n + 1);
    const vincular = async () => {
      try {
        return await this.api.vincular(j.id, c.id);
      } catch (e) {
        if (!(e instanceof ErrorFuncion) || (e.codigo !== 'limite' && e.codigo !== 'cola')) throw e;
        await dormir(Math.max(e.esperaSeg, 5) * 1000);
        return this.api.vincular(j.id, c.id);
      }
    };
    this.encadenar(vincular)
      .then((actualizado) => this.actualizado.emit(actualizado))
      .catch((e) => this.fallos.update((f) => [...f, { juego: j, mensaje: mensajeError(e) }]))
      .finally(() => this.enCola.update((n) => n - 1));
  }

  protected async ninguna(j: Juego) {
    this.ocupado.set(true);
    try {
      this.actualizado.emit(await this.datos.actualizar(j.id, { bgg_estado: 'omitido', bgg_candidatos: [] }));
    } catch (e) {
      this.fallos.update((f) => [...f, { juego: j, mensaje: mensajeError(e) }]);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected saltar(j: Juego) {
    this.saltados.update((s) => new Set(s).add(j.id));
  }

  protected reintentar(f: Fallo) {
    this.fallos.update((lista) => lista.filter((x) => x !== f));
    this.saltados.update((s) => {
      const n = new Set(s);
      n.delete(f.juego.id);
      return n;
    });
  }

  protected miniaturaMia = miniaturaDe;
  protected jugadores = (j: Juego) => (j.jugadores_min == null ? '—' : j.jugadores_min === j.jugadores_max ? `${j.jugadores_min}` : `${j.jugadores_min}–${j.jugadores_max}`);
  protected duracion = (j: Juego) => textoDuracion(j.duracion_min, j.duracion_max);
  protected enlace = (c: CandidatoBgg) => `https://boardgamegeek.com/${c.tipo === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame'}/${c.id}`;

  /** No se puede cerrar con Escape mientras haya vínculos en marcha: el resultado no llegaría a la lista. */
  protected impedirSiHayCola(e: Event) {
    if (this.enCola() > 0) e.preventDefault();
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement && this.enCola() === 0) this.dialogo().nativeElement.close();
  }
}
