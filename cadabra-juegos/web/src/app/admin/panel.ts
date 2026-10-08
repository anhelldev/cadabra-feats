import { ChangeDetectionStrategy, Component, computed, inject, signal, untracked, viewChild } from '@angular/core';
import { FichaBgg } from '../core/bgg';
import { Solicitudes } from '../core/solicitudes';
import { descartados, detectarDuplicados } from '../core/duplicados';
import { aSlug, Categoria, faltantes, Juego, Juegos, mensajeError, miniaturaDe, NIVELES, normalizar, textoDuracion } from '../core/juegos';
import { Pie } from '../shared/pie';
import { BuscarBgg } from './buscar-bgg';
import { aFilas } from '../core/masivo';
import { descargarHoja } from '../core/masivo-excel';
import { Duplicados, Fusion } from './duplicados';
import { EdicionMasiva } from './edicion-masiva';
import { Editor } from './editor';
import { RevisarBgg } from './revisar-bgg';
import { CabeceraAdmin } from './cabecera';
import { SyncBgg } from './sync-bgg';

type FiltroVisible = 'todos' | 'visibles' | 'ocultos';
type Fila = Juego & { _n: string; _faltan: string[] };

const POR_PAGINA = 100;

@Component({
  selector: 'app-panel',
  imports: [CabeceraAdmin, Editor, BuscarBgg, SyncBgg, Duplicados, Pie, RevisarBgg, EdicionMasiva],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel.html',
  styleUrl: './panel.css',
})
export class Panel {
  private readonly api = inject(Juegos);
  protected readonly solicitudes = inject(Solicitudes);

  protected readonly niveles = NIVELES;
  protected readonly duracion = (j: Juego) => textoDuracion(j.duracion_min, j.duracion_max);
  protected readonly miniatura = miniaturaDe;
  protected readonly juegos = signal<Fila[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly cargando = signal(true);
  protected readonly aviso = signal<{ texto: string; error?: boolean } | null>(null);
  protected readonly guardando = signal(new Set<number>());
  protected readonly editando = signal<Juego | 'nuevo' | null>(null);
  protected readonly precarga = signal<Partial<Juego> | null>(null);
  /** Diálogo de búsqueda en BGG: 'agregar' un juego nuevo o 'vincular' uno existente. */
  protected readonly buscarBgg = signal<'agregar' | Juego | null>(null);
  protected readonly mostrarSync = signal(false);
  protected readonly verDuplicados = signal(false);
  protected readonly revisandoBgg = signal(false);
  protected readonly importando = signal(false);
  private readonly sync = viewChild(SyncBgg);

  protected readonly q = signal('');
  protected readonly visible = signal<FiltroVisible>('todos');
  protected readonly origen = signal('');
  protected readonly incompletos = signal(false);
  protected readonly revisar = signal(false);
  protected readonly local = signal('');
  protected readonly portadaFiltro = signal('');
  protected readonly bggFiltro = signal('');
  protected readonly limite = signal(POR_PAGINA);

  protected readonly cuentas = computed(() => {
    const js = this.juegos();
    const visibles = js.filter((j) => j.visible).length;
    return {
      total: js.length,
      visibles,
      ocultos: js.length - visibles,
      incompletos: js.filter((j) => j._faltan.length).length,
      enLocal: js.filter((j) => j.en_local).length,
      paraLlevar: js.filter((j) => j.para_llevar).length,
      sinPortada: js.filter((j) => !j.portada).length,
      porDecidir: js.filter((j) => j.bgg_estado === 'dudoso').length,
    };
  });

  protected readonly filtrados = computed(() => {
    const q = normalizar(this.q().trim()), v = this.visible(), o = this.origen();
    const inc = this.incompletos(), rev = this.revisar(), loc = this.local();
    const por = this.portadaFiltro(), bgg = this.bggFiltro();
    return this.juegos().filter(
      (j) =>
        (!q || j._n.includes(q)) &&
        (v === 'todos' || j.visible === (v === 'visibles')) &&
        (!o || j.origen === o) &&
        (!inc || j._faltan.length > 0) &&
        (!rev || j.revisar) &&
        (!loc || (loc === 'llevar' ? j.para_llevar : j.en_local === (loc === 'si'))) &&
        (!por || !j.portada === (por === 'sin')) &&
        (!bgg || j.bgg_estado === bgg),
    );
  });
  protected readonly pagina = computed(() => this.filtrados().slice(0, this.limite()));

  /** La detección solo se rehace si cambia algún nombre, no cada vez que se activa un interruptor. */
  private readonly firmaNombres = computed(() => this.juegos().map((j) => `${j.id}:${j.nombre}`).join('|'));
  protected readonly gruposDup = computed(() => {
    this.firmaNombres();
    const descartes = descartados();
    return detectarDuplicados(untracked(this.juegos)).filter((g) => !descartes.has(g.clave));
  });

  constructor() {
    void this.cargar();
    // Para el contador y las etiquetas por juego; si falla, el resto del panel sigue funcionando.
    void this.solicitudes.cargar().catch(() => undefined);
  }

  protected async cargar() {
    try {
      const [juegos, cats] = await Promise.all([this.api.todos(), this.api.categorias()]);
      this.juegos.set(juegos.map(fila));
      this.categorias.set(cats);
    } catch (e) {
      this.avisar(mensajeError(e), true);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Descarga en Excel los juegos que se ven con los filtros actuales. */
  protected async exportar() {
    const juegos = this.filtrados();
    try {
      await descargarHoja(aFilas(juegos), `juegos-cadabra-${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.avisar(`${juegos.length} ${juegos.length === 1 ? 'juego exportado' : 'juegos exportados'} a Excel`);
    } catch (e) {
      this.avisar(`No pude crear el archivo: ${(e as Error).message}`, true);
    }
  }

  protected filtrar<T>(s: { set(v: T): void }, v: T) {
    s.set(v);
    this.limite.set(POR_PAGINA);
  }

  protected async alternar(j: Fila, campo: 'visible' | 'en_local') {
    const valor = !j[campo];
    this.reemplazar({ ...j, [campo]: valor });
    this.guardando.update((s) => new Set(s).add(j.id));
    try {
      this.reemplazar(await this.api.actualizar(j.id, { [campo]: valor }));
      const texto =
        campo === 'visible' ? (valor ? 'visible en el catálogo' : 'oculto') : valor ? 'está en el local' : 'no está en el local';
      const esperando = campo === 'en_local' && valor ? (this.solicitudes.pendientesPorJuego().get(j.id) ?? 0) : 0;
      this.avisar(
        esperando
          ? `${j.nombre}: está en el local. ${esperando} ${esperando === 1 ? 'persona lo pidió' : 'personas lo pidieron'}: avísales desde «Solicitudes».`
          : `${j.nombre}: ${texto}`,
      );
    } catch (e) {
      this.reemplazar(j);
      this.avisar(mensajeError(e), true);
    } finally {
      this.guardando.update((s) => {
        const n = new Set(s);
        n.delete(j.id);
        return n;
      });
    }
  }

  protected guardado(j: Juego) {
    if (this.juegos().some((x) => x.id === j.id)) this.reemplazar(j);
    else this.juegos.update((js) => [fila(j), ...js]);
    this.editando.set(null);
    this.sync()?.refrescar();
    this.avisar(`Guardado: ${j.nombre}`);
  }

  /** Un juego se vinculó o se descartó desde la revisión rápida: se actualiza la lista sin cerrar la revisión. */
  protected desdeRevision(j: Juego) {
    this.reemplazar(j);
    this.sync()?.refrescar();
  }

  protected fusionado(f: Fusion) {
    const fuera = new Set(f.eliminados);
    this.juegos.update((js) => js.filter((x) => !fuera.has(x.id)).map((x) => (x.id === f.conservado.id ? fila(f.conservado) : x)));
    this.sync()?.refrescar();
    void this.solicitudes.cargar().catch(() => undefined);
    this.avisar(`Fusionado en «${f.conservado.nombre}» (${f.eliminados.length} ${f.eliminados.length === 1 ? 'juego borrado' : 'juegos borrados'})`);
  }

  protected borrado(id: number) {
    const j = this.juegos().find((x) => x.id === id);
    this.juegos.update((js) => js.filter((x) => x.id !== id));
    this.editando.set(null);
    this.sync()?.refrescar();
    void this.solicitudes.cargar().catch(() => undefined);
    this.avisar(`Borrado: ${j?.nombre ?? ''}`);
  }

  /** Un juego elegido en BGG pasa al editor como juego nuevo, con los datos ya rellenados. */
  protected desdeBgg(f: FichaBgg) {
    this.buscarBgg.set(null);
    this.precarga.set({
      nombre: f.nombre,
      slug: aSlug(f.nombre),
      jugadores_min: f.jugadores_min,
      jugadores_max: f.jugadores_max,
      duracion_min: f.duracion_min,
      duracion_max: f.duracion_max,
      edad_min: f.edad_min,
      dificultad: f.dificultad,
      categoria: f.categoria,
      portada: f.imagen,
      portada_origen: f.imagen ? 'bgg' : null,
      bgg_id: f.bgg_id,
      bgg_tipo: f.tipo,
      bgg_estado: 'ok',
      bgg_datos: f.datos,
      videos: f.videos,
    });
    this.editando.set('nuevo');
  }

  protected crearManual() {
    this.buscarBgg.set(null);
    this.precarga.set(null);
    this.editando.set('nuevo');
  }

  protected vinculado(j: Juego) {
    this.buscarBgg.set(null);
    this.guardado(j);
  }

  protected editar(j: Juego) {
    this.precarga.set(null);
    this.editando.set(j);
  }

  protected verDudosos() {
    this.filtrar(this.bggFiltro, 'dudoso');
    this.mostrarSync.set(false);
  }

  protected jugadores(j: Juego) {
    if (j.jugadores_min == null) return '—';
    return j.jugadores_min === j.jugadores_max ? `${j.jugadores_min}` : `${j.jugadores_min}–${j.jugadores_max ?? '?'}`;
  }

  private reemplazar(j: Juego) {
    this.juegos.update((js) => js.map((x) => (x.id === j.id ? fila(j) : x)));
  }

  private avisar(texto: string, error = false) {
    this.aviso.set({ texto, error });
    setTimeout(() => this.aviso.update((a) => (a?.texto === texto ? null : a)), 4000);
  }
}

function fila(j: Juego): Fila {
  return { ...j, _n: normalizar(`${j.nombre} ${j.slug}`), _faltan: faltantes(j) };
}
