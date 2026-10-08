import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { environment } from '../../environments/environment';
import { JuegoPublico, NIVELES, textoDuracion, urlBgg } from '../core/juegos';
import { Solicitar } from './solicitar';
import { Dado } from '../shared/dado';

@Component({
  selector: 'app-ficha',
  imports: [Dado, Solicitar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="f-nombre" (close)="cerrar.emit()" (click)="fuera($event)">
      <div class="ficha">
        <div class="caja" [style.--c]="color()">
          @if (juego().portada && !sinImagen()) {
            <img class="fondo" [src]="juego().portada" alt="" aria-hidden="true" />
            <img class="portada" [src]="juego().portada" [alt]="'Portada de ' + juego().nombre" (error)="sinImagen.set(true)" />
          } @else {
            <span class="tipo">{{ juego().categoria }}</span>
            <span class="titulo">{{ juego().nombre }}</span>
            <app-dado [valor]="juego().dificultad" [tam]="40" />
          }
        </div>
        <div class="cuerpo">
          <h2 id="f-nombre">{{ juego().nombre }}</h2>
          <ul class="meta">
            @for (m of meta(); track m) {
              <li>{{ m }}</li>
            }
          </ul>
          <p [class.vacio]="!descripcion()">{{ descripcion() || 'Este juego todavía no tiene descripción.' }}</p>
          @if (juego().tips.length) {
            <div>
              <h3>Para empezar rápido</h3>
              <ul class="tips">
                @for (t of juego().tips; track $index) {
                  <li>{{ t }}</li>
                }
              </ul>
            </div>
          }
          @if (conBgg && juego().videos.length) {
            <div>
              <h3>Videos</h3>
              <ul class="videos">
                @for (v of juego().videos.slice(0, 3); track v.id) {
                  <li><a [href]="v.url" target="_blank" rel="noopener">{{ v.titulo }}</a></li>
                }
              </ul>
            </div>
          }
          @if (conBgg && juego().bgg_id) {
            <p class="credito">Datos de <a [href]="enlaceBgg()" target="_blank" rel="noopener">BoardGameGeek</a></p>
          }
          <div class="acciones">
            <button class="boton" type="button" (click)="dialogo.close()">Cerrar</button>
            @if (!juego().en_local && solicitable()) {
              <button class="boton solicitar" type="button" (click)="solicitando.set(true)">Solicitar para jugar</button>
            }
          </div>
          @if (!juego().en_local && solicitable()) {
            <p class="nolocal">
              @if (juego().para_llevar) {
                Este juego no está en el local, pero lo puedes solicitar. Pídelo y te avisamos para coordinar el día.
              } @else {
                Este juego todavía no está en el local. Puedes pedirlo y te avisamos cuando esté disponible.
              }
            </p>
          }
        </div>
      </div>
    </dialog>

    @if (solicitando()) {
      <app-solicitar [juego]="juego()" (cerrar)="solicitando.set(false)" />
    }
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(720px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    .ficha { display: grid; grid-template-columns: 240px minmax(0, 1fr); }
    .caja { position: relative; min-height: 300px; padding: 18px; display: flex; flex-direction: column;
      justify-content: space-between; color: #fff; background: var(--c); overflow: hidden;
      --dado-cara: #fff; --dado-borde: transparent; --dado-pip: var(--c); }
    .caja img { position: absolute; inset: 0; width: 100%; height: 100%; }
    /* La misma portada, desenfocada, rellena el panel: así no quedan franjas blancas arriba y abajo. */
    .caja .fondo { object-fit: cover; filter: blur(22px) brightness(0.8) saturate(1.2); transform: scale(1.3); }
    .caja .portada { object-fit: contain; padding: 22px; filter: drop-shadow(0 8px 18px rgb(0 0 0 / 0.4)); }
    .tipo { font-size: 0.85rem; opacity: 0.85; }
    .titulo { font-family: var(--display); font-weight: 800; font-size: 1.9rem; line-height: 1;
      letter-spacing: -0.01em; overflow-wrap: anywhere; }
    app-dado { align-self: flex-end; }
    .cuerpo { padding: 26px 30px 24px; display: grid; gap: 14px; align-content: start; background: var(--mesa); }
    h2 { font-family: var(--display); font-weight: 800; font-size: 1.6rem; line-height: 1.1; margin: 0; }
    h3 { font-family: var(--display); font-size: 1.05rem; margin: 0 0 6px; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .meta li { border: 1px solid var(--linea); border-radius: 999px; padding: 3px 10px; font-size: 0.85rem; }
    p { margin: 0; max-width: 60ch; }
    .vacio { color: var(--tenue); }
    .tips { margin: 0; padding-left: 1.1em; display: grid; gap: 4px; }
    .videos { margin: 0; padding-left: 1.1em; display: grid; gap: 4px; }
    .videos a, .credito a { color: var(--accion); }
    .credito { font-size: 0.8rem; color: var(--tenue); }
    .acciones { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }
    .solicitar { background: var(--ficha); color: var(--ficha-tinta); }
    .nolocal { font-size: 0.82rem; color: var(--tenue); }
    @media (max-width: 640px) { .ficha { grid-template-columns: 1fr; } .caja { min-height: 220px; } }
  `,
})
export class Ficha {
  readonly juego = input.required<JuegoPublico>();
  readonly color = input('#715091');
  /** Falso cuando la ficha se abre desde otra pantalla (por ejemplo, un torneo): no ofrece pedir el juego. */
  readonly solicitable = input(true);
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly sinImagen = signal(false);
  protected readonly solicitando = signal(false);
  protected readonly conBgg = environment.bggPublico;
  protected readonly enlaceBgg = computed(() => urlBgg(this.juego()));

  protected readonly descripcion = computed(() => this.juego().descripcion || this.juego().descripcion_tienda);
  protected readonly meta = computed(() => {
    const j = this.juego();
    const jug = j.jugadores_min === j.jugadores_max ? `${j.jugadores_min}` : `${j.jugadores_min} a ${j.jugadores_max}`;
    return [
      `${jug} ${j.jugadores_max === 1 ? 'jugador' : 'jugadores'}`,
      textoDuracion(j.duracion_min, j.duracion_max),
      `Dificultad: ${NIVELES[j.dificultad].toLowerCase()}`,
      `Desde ${j.edad_min} años`,
      j.categoria,
      ...(j.en_local ? ['En el local'] : j.para_llevar ? ['Para solicitar'] : []),
    ];
  });

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
