import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, output, signal } from '@angular/core';
import { Bgg, ErrorFuncion } from '../core/bgg';
import { EstadoBgg, mensajeError } from '../core/juegos';

const TANDA = 6;
const MAX_FALLOS_SEGUIDOS = 3;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Component({
  selector: 'app-sync-bgg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Sincronizar con BoardGameGeek">
      <div class="cab">
        <div>
          <h2>Sincronizar con BoardGameGeek</h2>
          <p>
            Busca cada juego en BGG y completa jugadores, duración, edad, dificultad, categoría, portada y videos.
            Lo que ya tienes revisado no se pisa; solo se reemplazan los datos estimados y los vacíos.
          </p>
        </div>
        <div class="botones">
          @if (corriendo()) {
            <button class="boton secundario" type="button" (click)="parar()">Pausar</button>
          } @else {
            <button class="boton" type="button" [disabled]="!pendientes()" (click)="iniciar()">
              {{ hechos() ? 'Continuar' : 'Sincronizar' }} ({{ pendientes() }} pendientes)
            </button>
          }
        </div>
      </div>

      <div class="barra" role="progressbar" [attr.aria-valuenow]="porcentaje()" aria-valuemin="0" aria-valuemax="100">
        <span [style.width.%]="porcentaje()"></span>
      </div>

      <ul class="cifras">
        <li><b>{{ cuentas()?.ok ?? '–' }}</b> vinculados</li>
        <li><b>{{ cuentas()?.pendiente ?? '–' }}</b> pendientes</li>
        <li>
          <button class="enlace" type="button" [disabled]="!cuentas()?.dudoso" (click)="verDudosos.emit()">
            <b>{{ cuentas()?.dudoso ?? '–' }}</b> por decidir
          </button>
        </li>
        <li>
          <b>{{ cuentas()?.sin_resultado ?? '–' }}</b> sin resultado
          @if (cuentas()?.sin_resultado) {
            <button class="enlace" type="button" [disabled]="corriendo()" (click)="reintentar()">reintentar</button>
          }
        </li>
      </ul>

      @if (estado()) {
        <p class="estado" [class.mal]="falloGrave()" aria-live="polite">{{ estado() }}</p>
      }
    </section>
  `,
  styles: `
    section { margin: 16px 0 4px; padding: 16px 18px; border: 1px solid var(--linea); border-radius: 14px; background: var(--carta); display: grid; gap: 12px; }
    .cab { display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; align-items: start; }
    h2 { margin: 0 0 4px; font-family: var(--display); font-size: 1.15rem; }
    p { margin: 0; color: var(--tenue); font-size: 0.9rem; max-width: 60ch; }
    .barra { height: 8px; border-radius: 999px; background: var(--linea); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--accion); transition: width 0.3s; }
    .cifras { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 0.9rem; color: var(--tenue); }
    .cifras b { color: var(--tinta); }
    .cifras .enlace { color: inherit; }
    .cifras .enlace[disabled] { text-decoration: none; cursor: default; }
    .estado { color: var(--tinta); }
    .estado.mal { color: var(--aviso); font-weight: 600; }
  `,
})
export class SyncBgg implements OnInit {
  private readonly api = inject(Bgg);

  readonly verDudosos = output();
  /** Avisa cuando hay cambios nuevos en la base para que el panel recargue la lista. */
  readonly cambios = output();

  protected readonly cuentas = signal<Record<EstadoBgg, number> | null>(null);
  protected readonly corriendo = signal(false);
  protected readonly estado = signal('');
  protected readonly falloGrave = signal(false);
  protected readonly hechos = signal(0);

  protected readonly pendientes = computed(() => this.cuentas()?.pendiente ?? 0);
  protected readonly porcentaje = computed(() => {
    const c = this.cuentas();
    if (!c) return 0;
    const total = c.pendiente + c.ok + c.dudoso + c.sin_resultado;
    return total ? Math.round(((total - c.pendiente) / total) * 100) : 0;
  });

  private activo = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.activo = false));
  }

  ngOnInit() {
    void this.refrescar();
  }

  /** El panel lo llama cuando algo cambia fuera de la sincronización (vincular, fusionar, borrar). */
  async refrescar() {
    try {
      this.cuentas.set(await this.api.contar());
    } catch (e) {
      this.estado.set(mensajeError(e));
      this.falloGrave.set(true);
    }
  }

  protected parar() {
    this.activo = false;
    this.estado.set('Pausando al terminar la tanda actual…');
  }

  protected async reintentar() {
    await this.api.reintentarSinResultado();
    await this.refrescar();
    this.estado.set('Los juegos sin resultado volvieron a la cola.');
  }

  /**
   * Pide tandas pequeñas una tras otra: cada petición dura unos segundos, así que nunca se acerca al límite de
   * tiempo del servidor. Si BGG pide ir más despacio, espera lo que indique y sigue.
   */
  protected async iniciar() {
    this.activo = true;
    this.corriendo.set(true);
    this.falloGrave.set(false);
    let fallos = 0;
    try {
      while (this.activo) {
        this.estado.set(`Sincronizando… quedan ${this.pendientes()} por procesar.`);
        try {
          const t = await this.api.sincronizar(TANDA);
          fallos = 0;
          this.hechos.update((h) => h + t.ok + t.dudosos + t.sin_resultado);
          await this.refrescar();
          this.cambios.emit();
          if (t.avisos.length) this.estado.set(`${t.avisos[0]} Esperando ${Math.ceil(t.espera_ms / 1000)} s…`);
          if (t.pendientes === 0) {
            this.estado.set('Listo: no quedan juegos pendientes.');
            break;
          }
          await dormir(t.espera_ms);
        } catch (e) {
          const err = e instanceof ErrorFuncion ? e : null;
          if (err?.codigo === 'token') {
            this.estado.set(err.message);
            this.falloGrave.set(true);
            break;
          }
          if (++fallos >= MAX_FALLOS_SEGUIDOS) {
            this.estado.set(`Se detuvo tras ${fallos} fallos seguidos: ${mensajeError(e)}`);
            this.falloGrave.set(true);
            break;
          }
          const espera = Math.max(err?.esperaSeg ?? 0, 10);
          this.estado.set(`${mensajeError(e)} Reintentando en ${espera} s…`);
          await dormir(espera * 1000);
        }
      }
      if (!this.activo && !this.falloGrave() && this.pendientes()) this.estado.set('En pausa. Puedes continuar cuando quieras.');
    } finally {
      this.activo = false;
      this.corriendo.set(false);
      await this.refrescar();
    }
  }
}
