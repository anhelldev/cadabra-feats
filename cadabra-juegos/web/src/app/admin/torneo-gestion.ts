import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { mensajeError } from '../core/juegos';
import { ESTADOS, FORMATOS, Inscripcion, linkInscripcion, PartidaFila, Torneo, Torneos } from '../core/torneos';
import {
  armarMesas, avanzarGanador, generarLlave, nombreRonda, PartidaLlave, podioLlave, podioPuntos, rondasDeLlave, tablaPuntos,
} from '../core/torneos-logica';

const fechaLarga = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

@Component({
  selector: 'app-torneo-gestion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="tg-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <div>
          <h2 id="tg-titulo">{{ t().nombre }}</h2>
          <p>
            <span class="estado" [attr.data-estado]="t().estado">{{ estados[t().estado] }}</span>
            {{ formatos[t().formato] }} · {{ fecha() }}@if (t().lugar) { · {{ t().lugar }} }
            @if (t().imagen) { <img class="mini" [src]="t().imagen" alt="" /> }
          </p>
        </div>
        <button class="boton secundario" type="button" (click)="dialogo.close()">Cerrar</button>
      </header>

      <div class="cuerpo">
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

        @if (t().estado !== 'borrador') {
          <div class="link">
            <span>Link de inscripción</span>
            <input readonly [value]="link()" (focus)="$any($event.target).select()" aria-label="Link de inscripción" />
            <button class="boton secundario chico" type="button" (click)="copiar()">{{ copiado() ? '¡Copiado!' : 'Copiar' }}</button>
          </div>
        }

        <!-- BORRADOR -->
        @if (t().estado === 'borrador') {
          <p>Todavía no es público. Cuando lo abras, aparecerá en la página de torneos y la gente podrá inscribirse con el link.</p>
          <div class="botones">
            <button class="boton" type="button" [disabled]="ocupado()" (click)="abrirInscripcion()">Abrir inscripciones</button>
            <button class="boton secundario" type="button" (click)="editar.emit(t())">Editar</button>
          </div>
        }

        <!-- INSCRIPCIÓN -->
        @if (t().estado === 'inscripcion') {
          <h3>Inscritos <span class="cuenta">{{ activos().length }} / {{ t().cupos }}@if (espera().length) { · {{ espera().length }} en espera }</span></h3>
          @if (!inscripciones().length) { <p class="vacio">Todavía no hay nadie inscrito.</p> }
          @for (i of inscripciones(); track i.id) {
            <div class="persona" [class.retirado]="i.estado === 'retirado'">
              <div>
                <b>{{ i.nombre }}</b>
                @if (i.estado === 'espera') { <span class="chip">en espera</span> }
                @if (i.estado === 'retirado') { <span class="chip">retirado</span> }
                <small>{{ i.telefono }}@if (i.email) { · {{ i.email }} }</small>
              </div>
              <div class="botones">
                <a class="enlace" [href]="whatsapp(i)" target="_blank" rel="noopener">WhatsApp</a>
                @if (i.estado === 'inscrito') {
                  <button class="enlace" type="button" [disabled]="ocupado()" (click)="cambiar(i, 'retirado')">Retirar</button>
                } @else {
                  <button class="enlace" type="button" [disabled]="ocupado()" (click)="cambiar(i, activos().length < t().cupos ? 'inscrito' : 'espera')">
                    {{ i.estado === 'espera' && activos().length >= t().cupos ? 'Sigue en espera' : 'Inscribir' }}
                  </button>
                }
              </div>
            </div>
          }

          @if (vista(); as v) {
            <h3>Sorteo</h3>
            @if (t().formato === 'puntuacion') {
              <div class="mesas">
                @for (m of v; track m.numero) {
                  <div class="mesa"><b>Mesa {{ m.numero }}</b>@for (j of m.jugadores; track j.inscripcion_id) { <span>{{ nombreDe(j.inscripcion_id) }}</span> }</div>
                }
              </div>
            } @else {
              <div class="mesas">
                @for (m of rondaUno(v); track m.numero) {
                  <div class="mesa">
                    <b>Cruce {{ m.numero }}</b>
                    @for (j of m.jugadores; track j.inscripcion_id) { <span>{{ nombreDe(j.inscripcion_id) }}</span> }
                    @if (m.jugadores.length === 1) { <em>pasa directo</em> }
                  </div>
                }
              </div>
            }
            <div class="botones">
              <button class="boton" type="button" [disabled]="ocupado()" (click)="iniciar()">Iniciar torneo con este sorteo</button>
              <button class="boton secundario" type="button" [disabled]="ocupado()" (click)="sortear()">Volver a sortear</button>
              <button class="enlace" type="button" (click)="vista.set(null)">Cancelar sorteo</button>
            </div>
          } @else {
            <div class="botones">
              <button class="boton" type="button" [disabled]="ocupado() || activos().length < 2" (click)="sortear()">Cerrar inscripciones y sortear</button>
              <button class="boton secundario" type="button" (click)="editar.emit(t())">Editar torneo</button>
            </div>
            @if (activos().length < 2) { <p class="ayuda">Hacen falta al menos 2 inscritos para sortear.</p> }
          }
        }

        <!-- EN CURSO: por puntuación -->
        @if (t().estado === 'en_curso' && t().formato === 'puntuacion') {
          <h3>Ronda {{ t().ronda_actual }} de {{ t().rondas }}</h3>
          <div class="mesas">
            @for (p of mesasActuales(); track p.id) {
              <form class="mesa" (submit)="guardarMesa($event, p)">
                <b>Mesa {{ p.numero }}@if (p.estado === 'jugada') { <span class="chip ok">jugada</span> }</b>
                @for (j of p.partida_jugadores; track j.inscripcion_id) {
                  <label>
                    <span>{{ nombreDe(j.inscripcion_id) }}</span>
                    <input type="number" step="any" [name]="'p' + j.inscripcion_id" [value]="j.puntos ?? ''" placeholder="Puntos" />
                  </label>
                }
                <button class="boton chico" type="submit" [disabled]="ocupado()">{{ p.estado === 'jugada' ? 'Corregir puntos' : 'Guardar puntos' }}</button>
              </form>
            }
          </div>
          <div class="botones">
            @if (rondaCompleta() && t().ronda_actual < (t().rondas ?? 0)) {
              <button class="boton" type="button" [disabled]="ocupado()" (click)="siguienteRonda()">Sortear ronda {{ t().ronda_actual + 1 }}</button>
            }
            @if (rondaCompleta() && t().ronda_actual >= (t().rondas ?? 0)) {
              <button class="boton" type="button" [disabled]="ocupado()" (click)="finalizar()">Finalizar torneo</button>
            }
            @if (!rondaCompleta()) { <p class="ayuda">Guarda los puntos de todas las mesas para pasar a la siguiente ronda.</p> }
          </div>
        }

        <!-- EN CURSO: eliminación -->
        @if (t().estado === 'en_curso' && t().formato === 'eliminacion') {
          @for (r of rondas(); track r.ronda) {
            <h3>{{ r.nombre }}</h3>
            <div class="mesas">
              @for (p of r.partidas; track p.id) {
                <div class="mesa">
                  <b>Cruce {{ p.numero }}</b>
                  @for (j of p.partida_jugadores; track j.inscripcion_id) {
                    <div class="jugador" [class.gana]="j.gano === true" [class.pierde]="j.gano === false">
                      <span>{{ nombreDe(j.inscripcion_id) }}</span>
                      @if (p.estado === 'pendiente' && p.partida_jugadores.length === 2) {
                        <button class="boton chico" type="button" [disabled]="ocupado()" (click)="ganador(p, j.inscripcion_id)">Gana</button>
                      }
                    </div>
                  } @empty { <em>por definir</em> }
                  @if (p.partida_jugadores.length === 1 && p.estado === 'pendiente') { <em>esperando rival</em> }
                  @if (p.partida_jugadores.length === 1 && p.estado === 'jugada') { <em>pasó directo</em> }
                </div>
              }
            </div>
          }
        }

        <!-- Puntuación en curso o finalizada: tabla -->
        @if ((t().estado === 'en_curso' || t().estado === 'finalizado') && t().formato === 'puntuacion') {
          <h3>Posiciones</h3>
          <table>
            <thead><tr><th>#</th><th>Jugador</th><th>Mesas</th><th>Puntos</th></tr></thead>
            <tbody>
              @for (f of tabla(); track f.inscripcion_id) {
                <tr><td>{{ f.posicion }}</td><td>{{ f.nombre }}</td><td>{{ f.jugadas }}</td><td><b>{{ f.puntos }}</b></td></tr>
              }
            </tbody>
          </table>
        }

        <!-- FINALIZADO -->
        @if (t().estado === 'finalizado') {
          <h3>Podio</h3>
          <ol class="podio">
            @for (p of podio(); track p.id + '-' + p.lugar) { <li><span>{{ p.lugar }}º</span> {{ p.nombre }}</li> }
          </ol>
          @if (t().formato === 'eliminacion') {
            @for (r of rondas(); track r.ronda) {
              <h3>{{ r.nombre }}</h3>
              <div class="mesas">
                @for (p of r.partidas; track p.id) {
                  <div class="mesa">
                    @for (j of p.partida_jugadores; track j.inscripcion_id) {
                      <div class="jugador" [class.gana]="j.gano === true" [class.pierde]="j.gano === false"><span>{{ nombreDe(j.inscripcion_id) }}</span></div>
                    }
                  </div>
                }
              </div>
            }
          }
        }

        <!-- Acciones generales -->
        <div class="peligro-zona">
          @if (t().estado === 'inscripcion' || t().estado === 'en_curso') {
            @if (confirmando() === 'cancelar') {
              <button class="boton peligro chico" type="button" [disabled]="ocupado()" (click)="cancelar()">Sí, cancelar el torneo</button>
              <button class="enlace" type="button" (click)="confirmando.set(null)">No</button>
            } @else {
              <button class="enlace" type="button" (click)="confirmando.set('cancelar')">Cancelar torneo</button>
            }
          }
          @if (confirmando() === 'borrar') {
            <button class="boton peligro chico" type="button" [disabled]="ocupado()" (click)="borrar()">Sí, eliminar para siempre</button>
            <button class="enlace" type="button" (click)="confirmando.set(null)">No</button>
          } @else {
            <button class="enlace" type="button" (click)="confirmando.set('borrar')">Eliminar torneo</button>
          }
        </div>
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(860px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 22px;
      border-bottom: 1px solid var(--linea); position: sticky; top: 0; background: var(--carta); z-index: 1; }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.35rem; }
    header p { margin: 4px 0 0; color: var(--tenue); font-size: 0.88rem; }
    .mini { display: block; margin-top: 8px; height: 48px; max-width: 160px; object-fit: cover; border-radius: 8px; border: 1px solid var(--linea); }
    h3 { margin: 18px 0 8px; font-family: var(--display); font-size: 1.05rem; }
    .cuerpo { padding: 14px 22px 22px; }
    .cuenta { font-family: var(--texto); font-weight: 500; font-size: 0.85rem; color: var(--tenue); }
    .estado { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--linea); color: var(--tinta); }
    .estado[data-estado='inscripcion'] { background: var(--ficha); color: var(--ficha-tinta); }
    .estado[data-estado='en_curso'] { background: var(--accion); color: #fff; }
    .estado[data-estado='finalizado'] { background: var(--ok); color: #fff; }
    .link { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; font-size: 0.85rem; color: var(--tenue); margin-bottom: 8px; }
    .link input { min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--linea); border-radius: 8px; background: var(--mesa); color: var(--tinta); }
    .botones { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 10px; }
    .boton.chico { height: 34px; padding: 0 14px; font-size: 0.88rem; }
    .ayuda, .vacio { color: var(--tenue); font-size: 0.88rem; margin: 6px 0; }
    .chip { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--linea); font-size: 0.72rem; color: var(--tenue); }
    .chip.ok { color: var(--ok); border-color: currentColor; }
    .persona { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 0; border-top: 1px solid var(--linea); align-items: center; }
    .persona small { display: block; color: var(--tenue); }
    .persona.retirado { opacity: 0.55; }
    .mesas { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .mesa { border: 1px solid var(--linea); border-radius: 12px; padding: 10px 12px; display: grid; gap: 6px; align-content: start; background: var(--mesa); }
    .mesa > span, .mesa em { font-size: 0.92rem; }
    .mesa em { color: var(--tenue); }
    .mesa label { display: grid; gap: 2px; font-size: 0.85rem; color: var(--tenue); }
    .mesa input { height: 36px; padding: 0 10px; border: 1px solid var(--linea); border-radius: 8px; background: var(--carta); color: var(--tinta); min-width: 0; width: 100%; }
    .jugador { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .jugador.gana span { font-weight: 700; color: var(--ok); }
    .jugador.pierde span { color: var(--tenue); text-decoration: line-through; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 500; font-size: 0.8rem; color: var(--tenue); padding: 6px; border-bottom: 2px solid var(--tinta); }
    td { padding: 6px; border-bottom: 1px solid var(--linea); }
    .podio { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 1.05rem; }
    .podio span { display: inline-block; min-width: 2em; font-family: var(--display); font-weight: 800; color: var(--accion); }
    .peligro-zona { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--linea); }
    @media (max-width: 560px) { .link { grid-template-columns: 1fr; } }
  `,
})
export class TorneoGestion {
  private readonly api = inject(Torneos);

  readonly torneo = input.required<Torneo>();
  readonly cambio = output<Torneo | null>();
  readonly editar = output<Torneo>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly t = linkedSignal(() => this.torneo());
  protected readonly estados = ESTADOS;
  protected readonly formatos = FORMATOS;
  protected readonly inscripciones = signal<Inscripcion[]>([]);
  protected readonly partidas = signal<PartidaFila[]>([]);
  protected readonly vista = signal<PartidaLlave[] | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly copiado = signal(false);
  protected readonly confirmando = signal<'cancelar' | 'borrar' | null>(null);

  protected readonly fecha = computed(() => fechaLarga.format(new Date(this.t().fecha)));
  protected readonly link = computed(() => linkInscripcion(this.t().slug));
  protected readonly activos = computed(() => this.inscripciones().filter((i) => i.estado === 'inscrito'));
  protected readonly espera = computed(() => this.inscripciones().filter((i) => i.estado === 'espera'));
  private readonly nombres = computed(() => new Map(this.inscripciones().map((i) => [i.id, i.nombre])));
  protected readonly nombreDe = (id: number) => this.nombres().get(id) ?? '—';

  protected readonly mesasActuales = computed(() => this.partidas().filter((p) => p.ronda === this.t().ronda_actual));
  protected readonly rondaCompleta = computed(() => this.mesasActuales().length > 0 && this.mesasActuales().every((p) => p.estado === 'jugada'));
  private readonly llave = computed<PartidaLlave[]>(() =>
    this.partidas().map((p) => ({
      ronda: p.ronda, numero: p.numero, estado: p.estado,
      jugadores: p.partida_jugadores.map((j) => ({ inscripcion_id: j.inscripcion_id, gano: j.gano })),
    })),
  );
  protected readonly rondas = computed(() => {
    const total = Math.max(0, ...this.partidas().map((p) => p.ronda));
    return Array.from({ length: total }, (_, i) => i + 1).map((ronda) => ({
      ronda,
      nombre: nombreRonda(ronda, total),
      partidas: this.partidas().filter((p) => p.ronda === ronda),
    }));
  });
  protected readonly tabla = computed(() =>
    tablaPuntos(
      this.activos().map((i) => ({ inscripcion_id: i.id, nombre: i.nombre })),
      this.partidas().flatMap((p) => p.partida_jugadores),
    ),
  );
  protected readonly podio = computed(() => {
    if (this.t().formato === 'puntuacion') return podioPuntos(this.tabla()).map((f) => ({ id: f.inscripcion_id, nombre: f.nombre, lugar: f.posicion }));
    return podioLlave(this.llave()).map((p) => ({ id: p.inscripcion_id, nombre: this.nombreDe(p.inscripcion_id), lugar: p.posicion }));
  });

  constructor() {
    afterNextRender(() => {
      this.dialogo().nativeElement.showModal();
      void this.cargar();
    });
  }

  protected rondaUno = (v: PartidaLlave[]) => v.filter((p) => p.ronda === 1);

  protected async cargar() {
    await this.ejecutar(async () => {
      this.inscripciones.set(await this.api.inscripciones(this.t().id));
      if (this.t().estado === 'en_curso' || this.t().estado === 'finalizado') this.partidas.set(await this.api.partidas(this.t().id));
    }, false);
  }

  /** Corre una acción con el aviso de "ocupado" y el manejo de errores; por defecto avisa del cambio al panel. */
  private async ejecutar(accion: () => Promise<void>, avisar = true) {
    this.error.set('');
    this.ocupado.set(true);
    try {
      await accion();
      if (avisar) this.cambio.emit(this.t());
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected abrirInscripcion() {
    return this.ejecutar(async () => {
      this.t.set(await this.api.actualizar(this.t().id, { estado: 'inscripcion' }));
      await this.cargar();
    });
  }

  protected cambiar(i: Inscripcion, estado: 'inscrito' | 'espera' | 'retirado') {
    return this.ejecutar(async () => {
      await this.api.cambiarInscripcion(i.id, estado);
      this.inscripciones.set(await this.api.inscripciones(this.t().id));
    });
  }

  protected sortear() {
    const ids = this.activos().map((i) => i.id);
    try {
      this.vista.set(
        this.t().formato === 'puntuacion'
          ? armarMesas(ids, this.t().tamano_mesa ?? 4).map((jugadores, i) => ({
              ronda: 1, numero: i + 1, estado: 'pendiente' as const, jugadores: jugadores.map((inscripcion_id) => ({ inscripcion_id })),
            }))
          : generarLlave(ids),
      );
      this.error.set('');
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }

  protected iniciar() {
    const v = this.vista();
    if (!v) return;
    return this.ejecutar(async () => {
      await this.api.iniciar(this.t().id, v);
      this.t.set(await this.api.refrescar(this.t().id));
      this.vista.set(null);
      await this.cargar();
    });
  }

  protected guardarMesa(e: SubmitEvent, p: PartidaFila) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    const filas = p.partida_jugadores.map((j) => ({ inscripcion_id: j.inscripcion_id, texto: String(datos.get('p' + j.inscripcion_id) ?? '').trim() }));
    if (filas.some((f) => f.texto === '' || Number.isNaN(Number(f.texto)))) {
      this.error.set(`Mesa ${p.numero}: anota los puntos de todos los jugadores (pueden ser 0).`);
      return;
    }
    return this.ejecutar(async () => {
      await this.api.guardarPuntos(p.id, filas.map((f) => ({ inscripcion_id: f.inscripcion_id, puntos: Number(f.texto) })));
      this.partidas.set(await this.api.partidas(this.t().id));
    });
  }

  protected siguienteRonda() {
    const ronda = this.t().ronda_actual + 1;
    return this.ejecutar(async () => {
      const mesas = armarMesas(this.activos().map((i) => i.id), this.t().tamano_mesa ?? 4);
      await this.api.crearPartidas(
        this.t().id,
        mesas.map((jugadores, i) => ({ ronda, numero: i + 1, jugadores: jugadores.map((inscripcion_id) => ({ inscripcion_id })) })),
      );
      this.t.set(await this.api.actualizar(this.t().id, { ronda_actual: ronda }));
      this.partidas.set(await this.api.partidas(this.t().id));
    });
  }

  protected ganador(p: PartidaFila, id: number) {
    return this.ejecutar(async () => {
      const av = avanzarGanador(this.llave(), p.ronda, p.numero, id);
      const sig = av.siguiente && this.partidas().find((x) => x.ronda === av.siguiente!.ronda && x.numero === av.siguiente!.numero);
      await this.api.guardarCruce(p.id, av.marcar, av.siguiente && sig ? { partida_id: sig.id, inscripcion_id: av.siguiente.inscripcion_id } : undefined);
      if (av.campeon) this.t.set(await this.api.actualizar(this.t().id, { estado: 'finalizado' }));
      this.partidas.set(await this.api.partidas(this.t().id));
    });
  }

  protected finalizar() {
    return this.ejecutar(async () => {
      this.t.set(await this.api.actualizar(this.t().id, { estado: 'finalizado' }));
    });
  }

  protected cancelar() {
    return this.ejecutar(async () => {
      this.t.set(await this.api.actualizar(this.t().id, { estado: 'cancelado' }));
      this.confirmando.set(null);
    });
  }

  protected borrar() {
    return this.ejecutar(async () => {
      await this.api.borrar(this.t().id);
      this.cambio.emit(null);
      this.dialogo().nativeElement.close();
    }, false);
  }

  protected async copiar() {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.error.set('No pude copiar: selecciona el link y cópialo a mano.');
    }
  }

  protected whatsapp(i: Inscripcion): string {
    const texto = `Hola ${i.nombre.split(/\s+/)[0]}, somos Cadabra 🎲\n\nTe escribimos por el torneo «${this.t().nombre}» (${this.fecha()}).`;
    return `https://wa.me/${i.telefono.replace('+', '')}?text=${encodeURIComponent(texto)}`;
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
