import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { environment } from '../../environments/environment';
import { JuegoPublico, mensajeError, miniaturaDe, NIVELES, textoDuracion } from '../core/juegos';
import { ErrorSolicitud, normalizarTelefono } from '../core/solicitudes';
import { aplicarTemaPorDefecto, TEMA_POR_DEFECTO } from '../core/tema';
import { ESTADOS, FilaPublica, FORMATOS, JuegoDeTorneo, Participante, Torneo, Torneos } from '../core/torneos';
import { nombreRonda, podioLlave, podioPuntos, tablaPuntos } from '../core/torneos-logica';
import { Ficha } from '../catalogo/ficha';
import { Pie } from '../shared/pie';

const fechaLarga = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

@Component({
  selector: 'app-torneos',
  imports: [Pie, Ficha, NgTemplateOutlet],
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../../tema.css', '../../base.css', '../../elements.css', './torneos-publico.css'],
  template: `
    <header class="tapete">
      <div class="ancho">
        <p class="marca">Juegos de Cadabra</p>
        <h1>{{ actual() ? actual()!.nombre : 'Torneos' }}</h1>
      </div>
    </header>

    <!-- Imagen del torneo: la promocional, o la portada del juego sobre su propia versión desenfocada. -->
    <ng-template #foto let-t>
      @if (t.imagen && !rotas().has(t.imagen)) {
        <img class="promo" [src]="t.imagen" [alt]="'Imagen de ' + t.nombre" loading="lazy" (error)="rota(t.imagen)" />
      } @else if (miniatura(t.juego); as src) {
        <img class="fondo" [src]="src" alt="" aria-hidden="true" loading="lazy" />
        <img class="portada" [src]="src" [alt]="'Portada de ' + t.juego.nombre" loading="lazy" (error)="rota(src)" />
      }
    </ng-template>

    <!-- El juego del torneo, con el ojo para ver su descripción. -->
    <ng-template #tarjetaJuego let-j>
      <div class="juego">
        @if (miniatura(j); as src) { <img [src]="src" [alt]="'Portada de ' + j.nombre" loading="lazy" (error)="rota(src)" /> }
        <div class="datos">
          <small>Se juega</small>
          <b>{{ j.nombre }}</b>
          @if (datosJuego(j); as d) { <span>{{ d }}</span> }
        </div>
        <button class="ojo" type="button" [attr.aria-label]="'Ver detalle de ' + j.nombre" title="Ver detalle del juego" (click)="fichaJuego.set(j)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </ng-template>

    <main class="ancho">
      @if (estado() === 'cargando') {
        <p class="vacio">Cargando torneos…</p>
      } @else if (estado() === 'error') {
        <p class="error" role="alert">No pudimos cargar los torneos. Recarga la página en un momento.</p>
      } @else if (actual(); as t) {
        <!-- DETALLE -->
        <button class="enlace volver" type="button" (click)="ver(null)">← Todos los torneos</button>
        @if (hayImagen(t)) {
          <div class="banner"><ng-container *ngTemplateOutlet="foto; context: { $implicit: t }" /></div>
        }
        <p class="meta">
          <span class="estado" [attr.data-estado]="t.estado">{{ estados[t.estado] }}</span>
          {{ formatos[t.formato] }} · {{ fecha(t.fecha) }}@if (t.lugar) { · {{ t.lugar }} }
        </p>
        @if (t.juego && t.estado !== 'inscripcion') { <ng-container *ngTemplateOutlet="tarjetaJuego; context: { $implicit: t.juego }" /> }
        @if (t.descripcion) { <p class="descripcion">{{ t.descripcion }}</p> }

        @if (t.estado === 'inscripcion') {
          <section class="bloque">
            <h2>Inscríbete</h2>
            @if (t.juego) { <ng-container *ngTemplateOutlet="tarjetaJuego; context: { $implicit: t.juego }" /> }
            <p class="ayuda">{{ cupo() }}</p>
            @switch (inscripcion()) {
              @case ('enviada') {
                <p class="exito" role="status"><b>¡Listo, quedaste inscrito!</b> Te contactaremos por WhatsApp con los detalles.</p>
              }
              @case ('espera') {
                <p class="exito" role="status"><b>Estás en la lista de espera.</b> Si se libera un cupo, te avisamos por WhatsApp.</p>
              }
              @case ('repetida') {
                <p class="exito" role="status"><b>Ya estabas inscrito en este torneo.</b> No hace falta que lo repitas.</p>
              }
              @default {
                <form (submit)="inscribir($event, t)" novalidate>
                  <label class="campo">
                    Tu nombre
                    <input name="nombre" autocomplete="name" maxlength="80" required [attr.aria-invalid]="!!errores().nombre" />
                    @if (errores().nombre) { <small class="error">{{ errores().nombre }}</small> }
                  </label>
                  <label class="campo">
                    Teléfono (WhatsApp)
                    <input name="telefono" type="tel" autocomplete="tel" inputmode="tel" required [attr.aria-invalid]="!!errores().telefono"
                      [placeholder]="prefijo ? 'Ej. 412 1234567' : 'Ej. +58 412 1234567'" />
                    @if (errores().telefono) { <small class="error">{{ errores().telefono }}</small> }
                  </label>
                  <label class="campo">
                    Correo (opcional)
                    <input name="email" type="email" autocomplete="email" maxlength="120" [attr.aria-invalid]="!!errores().email" />
                    @if (errores().email) { <small class="error">{{ errores().email }}</small> }
                  </label>
                  <input class="trampa" name="web" tabindex="-1" autocomplete="off" aria-hidden="true" />
                  <label class="acepto">
                    <input type="checkbox" name="acepta" />
                    <span>
                      Acepto que Cadabra use mis datos para contactarme sobre este torneo y que mi nombre aparezca en las posiciones y resultados del torneo.
                      @if (privacidadUrl) { <a [href]="privacidadUrl" target="_blank" rel="noopener">Política de privacidad</a> }
                    </span>
                  </label>
                  @if (errores().acepta) { <small class="error">{{ errores().acepta }}</small> }
                  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
                  <button class="boton" type="submit" [disabled]="enviando()">{{ enviando() ? 'Enviando…' : 'Inscribirme' }}</button>
                </form>
              }
            }
          </section>
        }

        @if (t.estado === 'en_curso' || t.estado === 'finalizado') {
          @if (t.estado === 'finalizado' && podio().length) {
            <section class="bloque">
              <h2>Podio</h2>
              <ol class="podio">@for (p of podio(); track p.nombre + p.lugar) { <li><span>{{ p.lugar }}º</span> {{ p.nombre }}</li> }</ol>
            </section>
          }
          @if (t.formato === 'puntuacion') {
            <section class="bloque">
              <h2>Posiciones</h2>
              <table>
                <thead><tr><th>#</th><th>Jugador</th><th>Mesas</th><th>Puntos</th></tr></thead>
                <tbody>
                  @for (f of tabla(); track f.inscripcion_id) {
                    <tr><td>{{ f.posicion }}</td><td>{{ f.nombre }}</td><td>{{ f.jugadas }}</td><td><b>{{ f.puntos }}</b></td></tr>
                  }
                </tbody>
              </table>
            </section>
          }
          @for (r of rondas(); track r.ronda) {
            <section class="bloque">
              <h2>{{ t.formato === 'puntuacion' ? 'Ronda ' + r.ronda : r.nombre }}</h2>
              <div class="mesas">
                @for (p of r.partidas; track p.id) {
                  <div class="mesa">
                    <b>{{ t.formato === 'puntuacion' ? 'Mesa' : 'Cruce' }} {{ p.numero }}</b>
                    @for (j of p.jugadores; track j.inscripcion_id) {
                      <div class="jugador" [class.gana]="j.gano === true" [class.pierde]="j.gano === false">
                        <span>{{ j.nombre }}</span>
                        @if (t.formato === 'puntuacion' && j.puntos != null) { <b>{{ j.puntos }}</b> }
                      </div>
                    } @empty { <em>por definir</em> }
                  </div>
                }
              </div>
            </section>
          }
        }
      } @else {
        <!-- LISTA -->
        @for (g of grupos(); track g.titulo) {
          <section class="bloque">
            <h2>{{ g.titulo }}</h2>
            <div class="tarjetas">
              @for (t of g.torneos; track t.id) {
                <button class="tarjeta" type="button" (click)="ver(t)">
                  @if (hayImagen(t)) {
                    <span class="foto"><ng-container *ngTemplateOutlet="foto; context: { $implicit: t }" /></span>
                  }
                  <span class="estado" [attr.data-estado]="t.estado">{{ estados[t.estado] }}</span>
                  <b>{{ t.nombre }}</b>
                  @if (t.juego) { <span class="con-juego">{{ t.juego.nombre }}</span> }
                  <span>{{ formatos[t.formato] }}</span>
                  <span>{{ fecha(t.fecha) }}</span>
                  @if (t.lugar) { <span>{{ t.lugar }}</span> }
                </button>
              }
            </div>
          </section>
        } @empty {
          <p class="vacio">Por ahora no hay torneos publicados. ¡Vuelve pronto!</p>
        }
      }
    </main>

    <app-pie [bgg]="false" />

    @if (fichaJuego(); as fj) {
      <app-ficha [juego]="fj" [solicitable]="false" (cerrar)="fichaJuego.set(null)" />
    }
  `,
})
export class TorneosPublico {
  private readonly api = inject(Torneos);

  protected readonly estados = ESTADOS;
  protected readonly formatos = FORMATOS;
  protected readonly prefijo = environment.solicitudes.prefijo;
  protected readonly privacidadUrl = environment.solicitudes.privacidadUrl;

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly torneos = signal<Torneo[]>([]);
  protected readonly actual = signal<Torneo | null>(null);
  protected readonly fichaJuego = signal<JuegoPublico | null>(null);
  protected readonly participantes = signal<Participante[]>([]);
  protected readonly filas = signal<FilaPublica[]>([]);
  protected readonly inscripcion = signal<'formulario' | 'enviada' | 'espera' | 'repetida'>('formulario');
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly errores = signal<Partial<Record<'nombre' | 'telefono' | 'email' | 'acepta', string>>>({});

  protected readonly confirmados = computed(() => this.participantes().filter((p) => p.estado === 'inscrito'));
  protected readonly enEspera = computed(() => this.participantes().filter((p) => p.estado === 'espera'));
  protected readonly cupo = computed(() => {
    const t = this.actual();
    if (!t) return '';
    const libres = t.cupos - this.confirmados().length;
    return libres > 0 ? `Quedan ${libres} ${libres === 1 ? 'cupo' : 'cupos'} de ${t.cupos}.` : 'Los cupos están llenos: puedes anotarte en la lista de espera.';
  });
  protected readonly grupos = computed(() => {
    const t = this.torneos();
    return [
      { titulo: 'Inscripciones abiertas', torneos: t.filter((x) => x.estado === 'inscripcion') },
      { titulo: 'En curso', torneos: t.filter((x) => x.estado === 'en_curso') },
      { titulo: 'Anteriores', torneos: t.filter((x) => x.estado === 'finalizado') },
    ].filter((g) => g.torneos.length);
  });
  protected readonly rondas = computed(() => {
    const por = new Map<number, Map<number, FilaPublica[]>>();
    for (const f of this.filas()) {
      const r = por.get(f.ronda) ?? new Map<number, FilaPublica[]>();
      r.set(f.partida_id, [...(r.get(f.partida_id) ?? []), f]);
      por.set(f.ronda, r);
    }
    const total = Math.max(0, ...por.keys());
    return [...por.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ronda, partidas]) => ({
        ronda,
        nombre: nombreRonda(ronda, total),
        partidas: [...partidas.entries()]
          .map(([id, rows]) => ({ id, numero: rows[0].numero, estado: rows[0].estado, jugadores: rows.filter((r) => r.inscripcion_id != null) as (FilaPublica & { inscripcion_id: number })[] }))
          .sort((a, b) => a.numero - b.numero),
      }));
  });
  protected readonly tabla = computed(() =>
    tablaPuntos(
      this.confirmados().map((p) => ({ inscripcion_id: p.id, nombre: p.nombre })),
      this.filas().filter((f) => f.inscripcion_id != null).map((f) => ({ inscripcion_id: f.inscripcion_id!, puntos: f.puntos })),
    ),
  );
  protected readonly podio = computed(() => {
    const t = this.actual();
    if (!t) return [];
    if (t.formato === 'puntuacion') return podioPuntos(this.tabla()).map((f) => ({ nombre: f.nombre, lugar: f.posicion }));
    const nombres = new Map(this.participantes().map((p) => [p.id, p.nombre]));
    const llave = this.rondas().flatMap((r) =>
      r.partidas.map((p) => ({ ronda: r.ronda, numero: p.numero, estado: p.estado, jugadores: p.jugadores.map((j) => ({ inscripcion_id: j.inscripcion_id, gano: j.gano })) })),
    );
    return llave.length ? podioLlave(llave).map((p) => ({ nombre: nombres.get(p.inscripcion_id) ?? '—', lugar: p.posicion })) : [];
  });

  constructor() {
    aplicarTemaPorDefecto(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, inject(TEMA_POR_DEFECTO));
    void this.cargar();
  }

  /** Imágenes que no cargaron (por ejemplo, una portada enlazada que ya no existe): se dejan de mostrar en vez de enseñar el ícono roto. */
  protected readonly rotas = signal<ReadonlySet<string>>(new Set());
  protected rota = (url: string) => this.rotas.update((r) => new Set(r).add(url));
  protected miniatura = (j: JuegoDeTorneo | null | undefined): string | null => {
    const url = j ? miniaturaDe({ portada: j.portada, bgg_datos: j.bgg_datos }) : null;
    return url && !this.rotas().has(url) ? url : null;
  };
  protected hayImagen = (t: Torneo) => !!(t.imagen && !this.rotas().has(t.imagen)) || !!this.miniatura(t.juego);
  protected datosJuego(j: JuegoDeTorneo): string {
    const partes: string[] = [];
    if (j.jugadores_min != null) partes.push(j.jugadores_min === j.jugadores_max ? `${j.jugadores_min} jugadores` : `${j.jugadores_min}–${j.jugadores_max ?? '?'} jugadores`);
    if (j.duracion_min != null) partes.push(textoDuracion(j.duracion_min, j.duracion_max));
    if (j.dificultad != null) partes.push(`Dificultad: ${NIVELES[j.dificultad].toLowerCase()}`);
    return partes.join(' · ');
  }
  protected fecha = (iso: string) => (this.actual() ? fechaLarga : fechaCorta).format(new Date(iso));

  private async cargar() {
    try {
      this.torneos.set((await this.api.publicos()).filter((t) => t.estado !== 'cancelado'));
      const slug = new URLSearchParams(location.search).get('t');
      const t = slug ? this.torneos().find((x) => x.slug === slug) : undefined;
      this.estado.set('listo');
      if (t) await this.ver(t, false);
    } catch (e) {
      console.error(e);
      this.estado.set('error');
    }
  }

  protected async ver(t: Torneo | null, actualizarUrl = true) {
    this.actual.set(t);
    this.inscripcion.set('formulario');
    this.error.set('');
    this.errores.set({});
    this.participantes.set([]);
    this.filas.set([]);
    if (actualizarUrl) {
      const url = new URL(location.href);
      if (t) url.searchParams.set('t', t.slug);
      else url.searchParams.delete('t');
      history.replaceState(null, '', url);
    }
    if (!t) return;
    try {
      const [p, f] = await Promise.all([this.api.participantes(t.id), t.estado === 'inscripcion' ? Promise.resolve([]) : this.api.partidasPublicas(t.id)]);
      this.participantes.set(p);
      this.filas.set(f);
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }

  protected async inscribir(e: SubmitEvent, t: Torneo) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    // Si el campo trampa viene lleno es un bot: se simula que todo salió bien, sin guardar nada.
    if (String(datos.get('web') ?? '').trim()) return this.inscripcion.set('enviada');

    const nombre = String(datos.get('nombre') ?? '').trim();
    const telefono = normalizarTelefono(String(datos.get('telefono') ?? ''));
    const email = String(datos.get('email') ?? '').trim();
    const errores: ReturnType<typeof this.errores> = {};
    if (nombre.length < 2) errores.nombre = 'Escribe tu nombre.';
    if (!telefono) errores.telefono = this.prefijo ? 'Revisa el número de teléfono.' : 'Escribe el número con el código de país, por ejemplo +58 412 1234567.';
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.email = 'Ese correo no parece válido.';
    if (!datos.get('acepta')) errores.acepta = 'Necesitamos tu consentimiento para inscribirte.';
    this.errores.set(errores);
    this.error.set('');
    if (Object.keys(errores).length || !telefono) return;

    this.enviando.set(true);
    try {
      const llenos = this.confirmados().length >= t.cupos;
      await this.api.inscribir({ torneo_id: t.id, nombre, telefono, email: email || null });
      this.inscripcion.set(llenos ? 'espera' : 'enviada');
      this.participantes.set(await this.api.participantes(t.id));
    } catch (err) {
      if (err instanceof ErrorSolicitud && err.codigo === 'duplicada') this.inscripcion.set('repetida');
      else this.error.set((err as Error).message || 'No pudimos inscribirte. Inténtalo de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }
}
