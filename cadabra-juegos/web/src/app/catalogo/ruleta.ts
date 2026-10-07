import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { JuegoPublico, NIVELES, textoDuracion } from '../core/juegos';

const C = 150;
const R = 140;
const MAX_SECTORES = 12;
const VUELTAS = 5;
const COLORES: [string, string][] = [
  ['#715091', '#ffffff'],
  ['#ff8300', '#24272a'],
  ['#c19ade', '#24272a'],
  ['#4b3263', '#ffffff'],
  ['#ffa400', '#24272a'],
];

interface Sector {
  juego: JuegoPublico;
  forma: string;
  centro: number;
  fondo: string;
  tinta: string;
  texto: string;
}

function barajar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Punto del borde a `grados` en sentido horario desde arriba. */
function punto(grados: number): string {
  const rad = (grados * Math.PI) / 180;
  return `${(C + R * Math.sin(rad)).toFixed(2)} ${(C - R * Math.cos(rad)).toFixed(2)}`;
}

function sectores(juegos: JuegoPublico[]): Sector[] {
  const paso = 360 / juegos.length;
  return juegos.map((juego, i) => {
    const [fondo, tinta] = COLORES[i % COLORES.length];
    const a0 = i * paso;
    const forma =
      juegos.length === 1
        ? ''
        : `M ${C} ${C} L ${punto(a0)} A ${R} ${R} 0 ${paso > 180 ? 1 : 0} 1 ${punto(a0 + paso)} Z`;
    const texto = juego.nombre.length > 18 ? juego.nombre.slice(0, 17).trimEnd() + '…' : juego.nombre;
    return { juego, forma, centro: a0 + paso / 2, fondo, tinta, texto };
  });
}

@Component({
  selector: 'app-ruleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="r-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <h2 id="r-titulo">¿Qué jugamos?</h2>
      <p class="sub">Entre {{ candidatos().length }} {{ candidatos().length === 1 ? 'juego' : 'juegos' }} que encajan con tus filtros</p>

      <div class="marco">
        <svg class="puntero" viewBox="0 0 24 20" aria-hidden="true"><path d="M2 0h20L12 18z" /></svg>
        <div class="rueda" [class.sin-animacion]="sinAnimacion" [style.transform]="'rotate(' + rotacion() + 'deg)'"
          (transitionend)="terminar()">
          <svg viewBox="0 0 300 300" aria-hidden="true">
            @for (s of sectores(); track $index) {
              @if (s.forma) {
                <path [attr.d]="s.forma" [attr.fill]="s.fondo" />
              } @else {
                <circle cx="150" cy="150" r="140" [attr.fill]="s.fondo" />
              }
              <text [attr.transform]="'rotate(' + (s.centro - 90) + ' 150 150)'" x="282" y="150"
                text-anchor="end" dominant-baseline="middle" [attr.fill]="s.tinta">{{ s.texto }}</text>
            }
            <circle cx="150" cy="150" r="140" class="borde" />
            <circle cx="150" cy="150" r="20" class="eje" />
          </svg>
        </div>
      </div>

      <div class="resultado" aria-live="polite">
        @if (ganador(); as g) {
          <p class="nombre">{{ g.nombre }}</p>
          <p class="meta">
            {{ g.jugadores_min === g.jugadores_max ? g.jugadores_min : g.jugadores_min + '–' + g.jugadores_max }} jug. ·
            {{ duracion(g) }} · {{ niveles[g.dificultad] }}
          </p>
        } @else {
          <p class="nombre girando">Girando…</p>
        }
      </div>

      <div class="acciones">
        <button class="boton" type="button" [disabled]="!ganador()" (click)="ver.emit(ganador()!)">Ver ficha</button>
        <button class="boton secundario" type="button" [disabled]="!ganador()" (click)="girar()">Girar otra vez</button>
        <button class="enlace" type="button" (click)="dialogo.close()">Cerrar</button>
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 22px; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(420px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; text-align: center; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.6rem; }
    .sub { margin: 4px 0 16px; color: var(--tenue); font-size: 0.9rem; }
    .marco { position: relative; width: min(320px, 100%); margin: 0 auto; padding-top: 14px; overflow: hidden; }
    .puntero { position: absolute; top: 0; left: 50%; width: 28px; transform: translateX(-50%); z-index: 1;
      fill: var(--tinta); filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)); }
    .rueda { transition: transform 4.2s cubic-bezier(0.12, 0.72, 0.08, 1); }
    .rueda.sin-animacion { transition: none; }
    svg { display: block; width: 100%; height: auto; }
    text { font-family: var(--texto); font-size: 11px; font-weight: 600; }
    .borde { fill: none; stroke: var(--tinta); stroke-width: 3; }
    .eje { fill: var(--carta); stroke: var(--tinta); stroke-width: 3; }
    .resultado { min-height: 64px; margin-top: 14px; }
    .nombre { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.4rem; line-height: 1.15; }
    .girando { color: var(--tenue); }
    .meta { margin: 4px 0 0; color: var(--tenue); font-size: 0.9rem; }
    .acciones { display: flex; flex-wrap: wrap; gap: 10px 14px; justify-content: center; align-items: center; margin-top: 14px; }
  `,
})
export class Ruleta {
  readonly candidatos = input.required<JuegoPublico[]>();
  readonly ver = output<JuegoPublico>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly niveles = NIVELES;
  protected readonly duracion = (j: JuegoPublico) => textoDuracion(j.duracion_min, j.duracion_max);
  protected readonly sinAnimacion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  protected readonly sectores = signal<Sector[]>([]);
  protected readonly rotacion = signal(0);
  protected readonly ganador = signal<JuegoPublico | null>(null);
  private elegido: JuegoPublico | null = null;

  constructor() {
    afterNextRender(() => {
      this.dialogo().nativeElement.showModal();
      // Un fotograma de espera para que la rueda exista con rotación 0 y la transición se vea.
      requestAnimationFrame(() => this.girar());
    });
  }

  protected girar() {
    const candidatos = this.candidatos();
    if (!candidatos.length) return;
    const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
    const otros = barajar(candidatos.filter((j) => j !== elegido)).slice(0, MAX_SECTORES - 1);
    const rueda = barajar([elegido, ...otros]);
    const sec = sectores(rueda);
    const paso = 360 / rueda.length;
    // Cae en un punto al azar dentro del sector, no siempre en el centro.
    const destino = sec[rueda.indexOf(elegido)].centro + (Math.random() - 0.5) * paso * 0.7;

    this.elegido = elegido;
    this.ganador.set(null);
    this.sectores.set(sec);
    // La rueda gira en sentido horario: el sector queda arriba cuando la rotación ≡ -destino (mod 360).
    const actual = this.rotacion();
    const falta = (((-destino - actual) % 360) + 360) % 360;
    this.rotacion.set(actual + VUELTAS * 360 + falta);
    if (this.sinAnimacion) this.terminar();
  }

  protected terminar() {
    this.ganador.set(this.elegido);
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
