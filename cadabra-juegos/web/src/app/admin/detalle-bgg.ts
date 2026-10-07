import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { Bgg, FichaBgg, TIPOS_BGG } from '../core/bgg';
import { mensajeError, textoDuracion } from '../core/juegos';

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_BGG.map((t) => [t.id, t.etiqueta]));

export interface CandidatoBasico {
  id: number;
  nombre: string;
  anio: number | null;
  tipo: string;
}

/** Modal pequeño con el detalle de un juego de BGG. Pide los datos al abrirse (una sola petición, y se recuerdan). */
@Component({
  selector: 'app-detalle-bgg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="det-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <div class="cab">
        <h3 id="det-titulo">{{ candidato().nombre }}</h3>
        <p>
          @if (candidato().anio) { {{ candidato().anio }} · }
          {{ etiqueta(candidato().tipo) }}
        </p>
      </div>

      @if (cargando()) {
        <p class="estado" role="status">Cargando el detalle desde BGG…</p>
      } @else if (error()) {
        <p class="estado mal" role="alert">{{ error() }}</p>
      } @else if (ficha(); as f) {
        <div class="cuerpo">
          <div class="img">
            @if (imagen()) {
              <img [src]="imagen()" [alt]="'Portada de ' + f.nombre" (error)="imagenFalla.set(true)" />
            } @else {
              <span>Sin imagen</span>
            }
          </div>
          <dl>
            <dt>Jugadores</dt>
            <dd>{{ jugadores(f) }}</dd>
            <dt>Duración</dt>
            <dd>{{ duracion(f) }}</dd>
            <dt>Edad</dt>
            <dd>{{ f.edad_min ? f.edad_min + '+' : '—' }}</dd>
            <dt>Dificultad</dt>
            <dd>{{ f.datos.peso ? f.datos.peso + ' / 5' : '—' }}</dd>
            <dt>Nota</dt>
            <dd>{{ f.datos.rating ? '★ ' + f.datos.rating + (f.datos.votos ? ' (' + f.datos.votos + ' votos)' : '') : '—' }}</dd>
            @if (f.datos.ranking) {
              <dt>Puesto</dt>
              <dd>#{{ f.datos.ranking }} en BGG</dd>
            }
            @if (f.datos.disenadores.length) {
              <dt>Diseño</dt>
              <dd>{{ f.datos.disenadores.slice(0, 3).join(', ') }}</dd>
            }
            @if (f.datos.categorias.length) {
              <dt>Categorías</dt>
              <dd>{{ f.datos.categorias.slice(0, 4).join(', ') }}</dd>
            }
            @if (f.datos.mecanicas.length) {
              <dt>Mecánicas</dt>
              <dd>{{ f.datos.mecanicas.slice(0, 4).join(', ') }}</dd>
            }
            <dt>Videos</dt>
            <dd>{{ f.datos.videos_total }} en BGG</dd>
          </dl>
        </div>
        @if (resumen(); as t) {
          <p class="desc"><small>Descripción en inglés:</small> {{ t }}</p>
        }
      }

      @if (aviso()) {
        <p class="aviso" role="note">{{ aviso() }}</p>
      }
      <div class="pie">
        <a class="enlace" [href]="enlaceBgg()" target="_blank" rel="noopener">Ver en BoardGameGeek</a>
        <span class="espacio"></span>
        <button class="boton secundario" type="button" (click)="dialogo.close()">Cerrar</button>
        <button class="boton" type="button" [disabled]="!ficha() || !puedeElegir()" (click)="elegir.emit()">{{ textoElegir() }}</button>
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    .cab { padding: 16px 20px 8px; border-bottom: 1px solid var(--linea); }
    .cab h3 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.2rem; line-height: 1.15; }
    .cab p { margin: 2px 0 0; color: var(--tenue); font-size: 0.85rem; }
    .estado { margin: 0; padding: 18px 20px; color: var(--tenue); }
    .estado.mal { color: var(--aviso); }
    .cuerpo { display: flex; gap: 14px; padding: 14px 20px 6px; align-items: flex-start; }
    .img { flex: none; width: 120px; min-height: 120px; border-radius: 10px; background: var(--mesa); overflow: hidden; display: grid; place-items: center; color: var(--tenue); font-size: 0.8rem; }
    .img img { width: 120px; max-height: 170px; object-fit: contain; background: #fff; display: block; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 0.86rem; min-width: 0; }
    dt { color: var(--tenue); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .desc { margin: 0; padding: 8px 20px 4px; font-size: 0.84rem; }
    .desc small { color: var(--tenue); }
    .aviso { margin: 0; padding: 8px 20px 0; font-size: 0.85rem; color: var(--aviso); }
    .pie { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; padding: 12px 20px 16px; }
    .espacio { flex: 1; }
    @media (max-width: 480px) { .cuerpo { flex-direction: column; } }
  `,
})
export class DetalleBgg {
  private readonly api = inject(Bgg);

  readonly candidato = input.required<CandidatoBasico>();
  /** Si es false el botón principal queda deshabilitado (por ejemplo, si esa opción ya la tiene otro juego). */
  readonly puedeElegir = input(true);
  readonly textoElegir = input('Elegir este juego');
  readonly aviso = input<string | null>(null);
  readonly elegir = output();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly ficha = signal<FichaBgg | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly imagenFalla = signal(false);

  protected readonly imagen = computed(() => {
    // La vista previa usa la miniatura de BGG (~5 KB); el original puede pesar varios MB.
    const f = this.ficha();
    return f ? (this.imagenFalla() ? f.imagen : f.datos.miniatura ?? f.imagen) : null;
  });
  protected readonly resumen = computed(() => {
    const t = this.ficha()?.datos.descripcion;
    if (!t) return null;
    return t.length > 260 ? t.slice(0, 260).replace(/\s+\S*$/, '') + '…' : t;
  });
  protected readonly enlaceBgg = computed(() => {
    const c = this.candidato();
    return `https://boardgamegeek.com/${c.tipo === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame'}/${c.id}`;
  });

  constructor() {
    afterNextRender(() => {
      this.dialogo().nativeElement.showModal();
      void this.cargar();
    });
  }

  private async cargar() {
    try {
      this.ficha.set(await this.api.ficha(this.candidato().id));
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected etiqueta = (t: string) => ETIQUETA_TIPO[t] ?? t;
  protected jugadores = (f: FichaBgg) =>
    f.jugadores_min == null ? '—' : f.jugadores_min === f.jugadores_max ? `${f.jugadores_min}` : `${f.jugadores_min}–${f.jugadores_max ?? '?'}`;
  protected duracion = (f: FichaBgg) => textoDuracion(f.duracion_min, f.duracion_max);

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
