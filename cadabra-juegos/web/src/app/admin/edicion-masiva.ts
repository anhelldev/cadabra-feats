import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { Categoria, CambiosJuego, Juego, Juegos, mensajeError } from '../core/juegos';
import { aFilas, Accion, FilaPlan, leerHoja, planificar, Plan, Registro } from '../core/masivo';
import { descargarHoja, leerArchivo } from '../core/masivo-excel';

type Paso = 'elegir' | 'revisar' | 'aplicando' | 'listo';
const MAX_VISIBLES = 150;
const fechaArchivo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

@Component({
  selector: 'app-edicion-masiva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="em-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <div>
          <h2 id="em-titulo">Importar juegos desde Excel</h2>
          <p>Edita el archivo que descargaste con «Exportar» y súbelo aquí. Antes de guardar nada verás un resumen de los cambios.</p>
        </div>
        <button class="boton secundario" type="button" [disabled]="paso() === 'aplicando'" (click)="dialogo.close()">Cerrar</button>
      </header>

      <div class="cuerpo">
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

        @switch (paso()) {
          @case ('elegir') {
            <label class="subir">
              <input type="file" accept=".xlsx" (change)="elegir($event)" />
              <span class="boton">{{ leyendo() ? 'Leyendo el archivo…' : 'Elegir archivo .xlsx' }}</span>
            </label>
            <ul class="reglas">
              <li>Cada fila se une al juego por su <b>ID</b>. Si dejas el ID vacío, se crea un juego nuevo (oculto hasta que esté completo).</li>
              <li>No se borra ningún juego. Una celda vacía en un texto o número <b>borra ese dato</b>; una casilla Sí/No vacía no cambia nada.</li>
              <li>No cambies las columnas marcadas «no editar»: se ignoran.</li>
            </ul>
          }
          @case ('revisar') {
            @if (plan(); as p) {
              <p class="archivo">{{ nombreArchivo() }} · {{ p.filas.length }} filas</p>
              @for (a of avisos(); track a) { <p class="aviso">{{ a }}</p> }
              <div class="cifras">
                <span class="cifra"><b>{{ p.cuentas.actualizar }}</b> se actualizan</span>
                <span class="cifra"><b>{{ p.cuentas.crear }}</b> se crean</span>
                <span class="cifra" [class.mal]="p.cuentas.error"><b>{{ p.cuentas.error }}</b> con errores</span>
                <span class="cifra" [class.mal]="p.cuentas.obsoleta"><b>{{ p.cuentas.obsoleta }}</b> cambiaron mientras editabas</span>
                <span class="cifra"><b>{{ p.cuentas['sin-cambios'] }}</b> sin cambios</span>
              </div>

              @if (p.cuentas.obsoleta) {
                <label class="check">
                  <input type="checkbox" [checked]="sobrescribir()" (change)="alternarSobrescribir($any($event.target).checked)" />
                  Aplicar también esas {{ p.cuentas.obsoleta }} filas, aunque alguien las modificó después de exportar (pisa esos cambios)
                </label>
              }

              @for (g of grupos(); track g.accion) {
                <section class="grupo">
                  <h3>{{ g.titulo }} <span class="n">{{ g.filas.length }}</span></h3>
                  @for (f of g.filas.slice(0, maxVisibles); track f.fila) {
                    <details [open]="g.accion === 'error'">
                      <summary>
                        <span class="fila-n">Fila {{ f.fila }}</span> <b>{{ f.nombre }}</b>
                        @if (f.cambios.length) { <span class="resumen">{{ f.cambios.length }} {{ f.cambios.length === 1 ? 'campo' : 'campos' }}</span> }
                      </summary>
                      @for (e of f.errores; track e) { <p class="error">{{ e }}</p> }
                      @if (f.cambios.length) {
                        <table>
                          <tbody>
                            @for (c of f.cambios; track c.clave) {
                              <tr><th>{{ c.titulo }}</th><td class="antes">{{ c.antes || '—' }}</td><td class="flecha">→</td><td class="despues">{{ c.despues || '(vacío)' }}</td></tr>
                            }
                          </tbody>
                        </table>
                      }
                    </details>
                  }
                  @if (g.filas.length > maxVisibles) { <p class="mas">… y {{ g.filas.length - maxVisibles }} más.</p> }
                </section>
              }

              <div class="botones">
                <button class="boton" type="button" [disabled]="!aAplicar().length" (click)="aplicar()">
                  Aplicar {{ aAplicar().length }} {{ aAplicar().length === 1 ? 'cambio' : 'cambios' }}
                </button>
                <button class="boton secundario" type="button" (click)="reiniciar()">Elegir otro archivo</button>
              </div>
              @if (aAplicar().length) { <p class="ayuda">Antes de guardar se descarga un archivo de respaldo con los valores actuales de los juegos que cambian.</p> }
            }
          }
          @case ('aplicando') {
            <p class="progreso" role="status">Guardando… {{ hechos() }} de {{ aAplicar().length }}</p>
          }
          @case ('listo') {
            <p class="listo" role="status"><b>Listo.</b> {{ resultado().ok }} {{ resultado().ok === 1 ? 'juego guardado' : 'juegos guardados' }}@if (resultado().fallos.length) { y {{ resultado().fallos.length }} con problemas }.</p>
            @for (f of resultado().fallos; track f) { <p class="error">{{ f }}</p> }
            <p class="ayuda">Se descargó el respaldo con los valores anteriores. Si te equivocaste, vuelve a importar ese archivo.</p>
            <div class="botones"><button class="boton" type="button" (click)="dialogo.close()">Cerrar</button></div>
          }
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(900px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 22px; border-bottom: 1px solid var(--linea);
      position: sticky; top: 0; background: var(--carta); z-index: 1; }
    h2 { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.35rem; }
    header p { margin: 4px 0 0; color: var(--tenue); font-size: 0.9rem; max-width: 60ch; }
    .cuerpo { padding: 16px 22px 22px; display: grid; gap: 12px; }
    .subir input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .subir .boton { display: inline-grid; place-items: center; cursor: pointer; }
    .reglas { margin: 0; padding-left: 1.1em; color: var(--tenue); display: grid; gap: 6px; font-size: 0.92rem; }
    .archivo, .ayuda { margin: 0; color: var(--tenue); font-size: 0.88rem; }
    .aviso { margin: 0; color: var(--aviso); font-size: 0.88rem; }
    .cifras { display: flex; flex-wrap: wrap; gap: 8px; }
    .cifra { padding: 6px 12px; border: 1px solid var(--linea); border-radius: 999px; font-size: 0.88rem; color: var(--tenue); }
    .cifra b { color: var(--tinta); font-family: var(--display); }
    .cifra.mal { border-color: var(--aviso); color: var(--aviso); }
    .check { display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; }
    .check input { margin-top: 3px; flex: none; }
    .grupo { border-top: 1px solid var(--linea); padding-top: 8px; }
    h3 { margin: 0 0 6px; font-family: var(--display); font-size: 1.05rem; }
    .n { font-family: var(--texto); font-weight: 500; font-size: 0.85rem; color: var(--tenue); margin-left: 4px; }
    details { padding: 4px 0; border-bottom: 1px dashed var(--linea); }
    summary { cursor: pointer; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
    .fila-n { color: var(--tenue); font-size: 0.8rem; min-width: 4.5em; }
    .resumen { color: var(--tenue); font-size: 0.8rem; }
    table { border-collapse: collapse; margin: 6px 0 4px 6px; font-size: 0.88rem; width: calc(100% - 6px); }
    th { text-align: left; font-weight: 500; color: var(--tenue); padding: 3px 10px 3px 0; white-space: nowrap; vertical-align: top; }
    td { padding: 3px 6px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-line; }
    .antes { color: var(--tenue); text-decoration: line-through; }
    .flecha { color: var(--tenue); width: 1.5em; }
    .despues { font-weight: 600; }
    .error { margin: 4px 0 4px 6px; padding: 0; font-size: 0.88rem; }
    .mas { margin: 6px 0 0; color: var(--tenue); font-size: 0.85rem; }
    .botones { display: flex; flex-wrap: wrap; gap: 10px; }
    .progreso, .listo { margin: 0; font-size: 1.05rem; }
  `,
})
export class EdicionMasiva {
  private readonly api = inject(Juegos);

  readonly juegos = input.required<readonly Juego[]>();
  readonly categorias = input.required<readonly Categoria[]>();
  readonly aplicado = output();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly maxVisibles = MAX_VISIBLES;
  protected readonly paso = signal<Paso>('elegir');
  protected readonly error = signal('');
  protected readonly leyendo = signal(false);
  protected readonly nombreArchivo = signal('');
  protected readonly avisos = signal<string[]>([]);
  protected readonly sobrescribir = signal(false);
  protected readonly hechos = signal(0);
  protected readonly resultado = signal<{ ok: number; fallos: string[] }>({ ok: 0, fallos: [] });
  private readonly registros = signal<Registro[]>([]);

  protected readonly plan = computed<Plan | null>(() =>
    this.registros().length || this.paso() === 'revisar'
      ? planificar(this.registros(), this.juegos(), { categorias: this.categorias().map((c) => c.nombre), sobrescribir: this.sobrescribir() })
      : null,
  );
  protected readonly aAplicar = computed<FilaPlan[]>(() => this.plan()?.filas.filter((f) => f.accion === 'actualizar' || f.accion === 'crear') ?? []);
  protected readonly grupos = computed(() => {
    const filas = this.plan()?.filas ?? [];
    const g = (accion: Accion, titulo: string) => ({ accion, titulo, filas: filas.filter((f) => f.accion === accion) });
    return [g('error', 'Con errores (no se aplican)'), g('obsoleta', 'Cambiaron mientras editabas (no se aplican)'), g('actualizar', 'Se actualizan'), g('crear', 'Se crean')].filter((x) => x.filas.length);
  });

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  protected async elegir(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    this.error.set('');
    this.leyendo.set(true);
    try {
      const lectura = leerHoja(await leerArchivo(archivo));
      this.registros.set(lectura.registros);
      this.avisos.set(lectura.avisos);
      this.nombreArchivo.set(archivo.name);
      this.sobrescribir.set(false);
      this.paso.set('revisar');
    } catch (err) {
      this.error.set(`No pude leer el archivo: ${(err as Error).message}`);
    } finally {
      this.leyendo.set(false);
      entrada.value = '';
    }
  }

  protected alternarSobrescribir(valor: boolean) {
    this.sobrescribir.set(valor);
  }

  protected reiniciar() {
    this.registros.set([]);
    this.paso.set('elegir');
    this.error.set('');
  }

  protected async aplicar() {
    const filas = this.aAplicar();
    if (!filas.length) return;
    this.error.set('');
    const afectados = this.juegos().filter((j) => filas.some((f) => f.accion === 'actualizar' && f.id === j.id));
    try {
      // Respaldo primero: si algo sale mal, ese archivo se puede importar de vuelta para deshacer.
      if (afectados.length) await descargarHoja(aFilas(afectados), `respaldo-antes-de-importar-${fechaArchivo()}.xlsx`);
    } catch (e) {
      this.error.set(`No pude crear el respaldo, así que no se guardó nada: ${(e as Error).message}`);
      return;
    }

    this.paso.set('aplicando');
    this.hechos.set(0);
    const fallos: string[] = [];
    let ok = 0;

    const nuevas = filas.filter((f) => f.accion === 'crear');
    if (nuevas.length) {
      try {
        ok += await this.api.crearVarios(nuevas.map((f) => ({ ...f.datos, ...(f.datos['portada'] ? { portada_origen: 'manual' } : {}) })));
      } catch (e) {
        fallos.push(`No se pudieron crear los juegos nuevos: ${mensajeError(e)}`);
      }
      this.hechos.update((n) => n + nuevas.length);
    }

    const cambios = filas.filter((f) => f.accion === 'actualizar');
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < cambios.length) {
        const f = cambios[siguiente++];
        try {
          await this.api.actualizar(f.id!, { ...f.datos, ...(f.datos['portada'] ? { portada_origen: 'manual' as const } : {}) } as CambiosJuego);
          ok++;
        } catch (e) {
          fallos.push(`Fila ${f.fila} (${f.nombre}): ${mensajeError(e)}`);
        }
        this.hechos.update((n) => n + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, cambios.length) }, trabajador));

    this.resultado.set({ ok, fallos });
    this.paso.set('listo');
    this.aplicado.emit();
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement && this.paso() !== 'aplicando') this.dialogo().nativeElement.close();
  }
}
