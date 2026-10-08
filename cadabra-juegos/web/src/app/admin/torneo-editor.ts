import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { reducirImagen } from '../core/imagen';
import { aSlug, mensajeError, normalizar } from '../core/juegos';
import { DatosTorneo, FORMATOS, FormatoTorneo, Torneo, Torneos } from '../core/torneos';

const dosCifras = (n: number) => String(n).padStart(2, '0');
/** Valor para <input type="datetime-local">, en la hora local de quien edita. */
const aLocal = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}T${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
};

@Component({
  selector: 'app-torneo-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="te-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <h2 id="te-titulo">{{ torneo() ? 'Editar torneo' : 'Nuevo torneo' }}</h2>
      </header>
      <form (submit)="guardar($event)" novalidate>
        <label class="campo">
          Nombre del torneo
          <input name="nombre" maxlength="100" required [value]="torneo()?.nombre ?? ''" placeholder="Ej. Torneo de Catan de octubre" />
        </label>
        <label class="campo">
          Juego (opcional)
          <input name="juego" list="te-juegos" autocomplete="off" [value]="nombreJuego()" placeholder="Escribe para buscar en el catálogo" />
          <datalist id="te-juegos">
            @for (j of juegos(); track j.id) { <option [value]="j.nombre"></option> }
          </datalist>
        </label>
        <div class="fila">
          <label class="campo">
            Formato
            <select name="formato" [value]="formato()" (change)="formato.set($any($event.target).value)">
              @for (f of formatos; track f[0]) { <option [value]="f[0]">{{ f[1] }}</option> }
            </select>
          </label>
          <label class="campo">
            Cupos
            <input name="cupos" type="number" min="2" max="256" required [value]="torneo()?.cupos ?? 16" />
          </label>
        </div>
        @if (formato() === 'puntuacion') {
          <div class="fila">
            <label class="campo">
              Rondas
              <input name="rondas" type="number" min="1" max="20" required [value]="torneo()?.rondas ?? 3" />
            </label>
            <label class="campo">
              Jugadores por mesa
              <input name="tamano_mesa" type="number" min="2" max="8" required [value]="torneo()?.tamano_mesa ?? 4" />
            </label>
          </div>
          <p class="ayuda">Cada ronda se sortean mesas; se anotan los puntos de cada jugador y se acumulan en una tabla.</p>
        } @else {
          <p class="ayuda">Cruces 1 contra 1 con sorteo inicial. Si los jugadores no son potencia de 2, algunos pasan directo a la siguiente ronda.</p>
        }
        <div class="fila">
          <label class="campo">
            Fecha y hora
            <input name="fecha" type="datetime-local" required [value]="fechaInicial()" />
          </label>
          <label class="campo">
            Lugar
            <input name="lugar" maxlength="120" [value]="torneo()?.lugar ?? ''" placeholder="Ej. Cadabra, local principal" />
          </label>
        </div>
        <label class="campo">
          Descripción (opcional)
          <textarea name="descripcion" rows="3" maxlength="1000" [value]="torneo()?.descripcion ?? ''" placeholder="Premios, reglas, qué traer…"></textarea>
        </label>
        <div class="campo">
          Imagen promocional (opcional)
          @if (vista(); as v) {
            <img class="vista" [src]="v" alt="Vista previa de la imagen del torneo" />
          }
          <div class="imagen-botones">
            <label class="boton secundario chico archivo">
              {{ vista() ? 'Cambiar imagen' : 'Elegir imagen' }}
              <input type="file" accept="image/*" (change)="elegirImagen($event)" />
            </label>
            @if (vista()) { <button class="enlace" type="button" (click)="quitarImagen()">Quitar</button> }
          </div>
          <small class="ayuda">Se muestra como banner en la página del torneo. Si no subes una, se usa la portada del juego. Se achica sola.</small>
        </div>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <div class="acciones">
          <button class="boton secundario" type="button" (click)="dialogo.close()">Cancelar</button>
          <button class="boton" type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { padding: 18px 22px 10px; border-bottom: 1px solid var(--linea); }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.35rem; }
    form { display: grid; gap: 12px; padding: 16px 22px 20px; }
    .fila { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ayuda { margin: 0; font-size: 0.85rem; color: var(--tenue); }
    .vista { width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; border: 1px solid var(--linea); }
    .imagen-botones { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .archivo { display: inline-grid; place-items: center; cursor: pointer; }
    .archivo input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .boton.chico { height: 34px; padding: 0 14px; font-size: 0.88rem; }
    .acciones { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    @media (max-width: 480px) { .fila { grid-template-columns: 1fr; } }
  `,
})
export class TorneoEditor {
  private readonly api = inject(Torneos);

  readonly torneo = input<Torneo | null>(null);
  readonly juegos = input.required<{ id: number; nombre: string }[]>();
  readonly guardado = output<Torneo>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly formatos = Object.entries(FORMATOS);
  protected readonly formato = signal<FormatoTorneo>('puntuacion');
  protected readonly guardando = signal(false);
  /** Imagen elegida (ya achicada) que se sube al guardar; `vista` es lo que se muestra: la nueva o la que ya tenía el torneo. */
  private readonly imagenNueva = signal<Blob | null>(null);
  private readonly quitada = signal(false);
  protected readonly vista = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly nombreJuego = computed(() => this.juegos().find((j) => j.id === this.torneo()?.juego_id)?.nombre ?? '');
  protected readonly fechaInicial = computed(() => {
    const t = this.torneo();
    return aLocal(t ? t.fecha : new Date(Date.now() + 7 * 864e5).toISOString());
  });

  constructor() {
    afterNextRender(() => {
      this.formato.set(this.torneo()?.formato ?? 'puntuacion');
      this.vista.set(this.torneo()?.imagen ?? null);
      this.dialogo().nativeElement.showModal();
    });
  }

  protected async elegirImagen(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    try {
      const blob = await reducirImagen(archivo);
      this.imagenNueva.set(blob);
      this.quitada.set(false);
      this.vista.set(URL.createObjectURL(blob));
      this.error.set('');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      entrada.value = '';
    }
  }

  protected quitarImagen() {
    this.imagenNueva.set(null);
    this.quitada.set(true);
    this.vista.set(null);
  }

  protected async guardar(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const texto = (k: string) => String(f.get(k) ?? '').trim();
    const nombre = texto('nombre');
    const formato = this.formato();
    const cupos = Number(texto('cupos'));
    const fecha = texto('fecha');
    if (nombre.length < 3) return this.error.set('Escribe un nombre de al menos 3 letras.');
    if (!Number.isInteger(cupos) || cupos < 2 || cupos > 256) return this.error.set('Los cupos deben ser entre 2 y 256.');
    if (!fecha) return this.error.set('Indica la fecha y la hora.');
    const rondas = formato === 'puntuacion' ? Number(texto('rondas')) : null;
    const tamano = formato === 'puntuacion' ? Number(texto('tamano_mesa')) : null;
    if (formato === 'puntuacion' && (!Number.isInteger(rondas) || rondas! < 1 || rondas! > 20 || !Number.isInteger(tamano) || tamano! < 2 || tamano! > 8)) {
      return this.error.set('Revisa las rondas (1 a 20) y los jugadores por mesa (2 a 8).');
    }
    const buscado = normalizar(texto('juego'));
    const juego = buscado ? this.juegos().find((j) => normalizar(j.nombre) === buscado) : undefined;
    if (buscado && !juego) return this.error.set('Ese juego no está en el catálogo: elígelo de la lista o deja el campo vacío.');

    const datos: DatosTorneo = {
      nombre, juego_id: juego?.id ?? null, descripcion: texto('descripcion') || null, formato, fecha: new Date(fecha).toISOString(),
      lugar: texto('lugar') || null, cupos, rondas, tamano_mesa: tamano, imagen: this.torneo()?.imagen ?? null,
    };
    this.error.set('');
    this.guardando.set(true);
    try {
      const t = this.torneo();
      const anterior = t?.imagen ?? null;
      const nueva = this.imagenNueva();
      if (nueva) datos.imagen = await this.api.subirImagen(t?.slug ?? (aSlug(nombre) || 'torneo'), nueva);
      else if (this.quitada()) datos.imagen = null;
      const guardado = t ? await this.api.actualizar(t.id, datos) : await this.api.crear(datos);
      if (anterior && anterior !== guardado.imagen) void this.api.borrarImagen(anterior);
      this.guardado.emit(guardado);
      this.dialogo().nativeElement.close();
    } catch (err) {
      this.error.set(mensajeError(err));
    } finally {
      this.guardando.set(false);
    }
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
