import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { environment } from '../../environments/environment';
import { Juegos, JuegoPublico, miniaturaDe, NIVELES, normalizar, textoDuracion } from '../core/juegos';
import { TEMA_POR_DEFECTO } from '../core/tema';
import { Dado } from '../shared/dado';
import { Pie } from '../shared/pie';
import { Ficha } from './ficha';
import { Ruleta } from './ruleta';

const TANDA = 40;

type Orden = 'nombre' | 'facil' | 'dificil' | 'corto';

const ORDEN: Record<Orden, (a: JuegoPublico, b: JuegoPublico) => number> = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }),
  facil: (a, b) => a.dificultad - b.dificultad || a.duracion_min - b.duracion_min,
  dificil: (a, b) => b.dificultad - a.dificultad || b.duracion_min - a.duracion_min,
  corto: (a, b) => a.duracion_min - b.duracion_min || a.dificultad - b.dificultad,
};

@Component({
  selector: 'app-catalogo',
  imports: [Dado, Ficha, Pie, Ruleta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  templateUrl: './catalogo.html',
  styleUrls: ['../../tema.css', '../../base.css', '../../elements.css', './catalogo.css'],
})
export class Catalogo {
  private readonly api = inject(Juegos);
  /** El logo de BGG se muestra solo si el catálogo público usa datos de BGG (ver environment.bggPublico). */
  protected readonly conBgg = environment.bggPublico;

  protected readonly niveles = NIVELES;
  protected readonly duracion = (j: JuegoPublico) => textoDuracion(j.duracion_min, j.duracion_max);
  protected readonly sillas = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly juegos = signal<(JuegoPublico & { _n: string })[]>([]);
  protected readonly miniatura = miniaturaDe;
  protected readonly colores = signal<Record<string, string>>({});
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly abierto = signal<JuegoPublico | null>(null);
  protected readonly ruleta = signal(false);

  protected readonly jug = signal(0);
  protected readonly dif = signal(0);
  protected readonly q = signal('');
  protected readonly cat = signal('');
  protected readonly dur = signal(0);
  protected readonly disp = signal<'' | 'local' | 'llevar'>('');
  protected readonly orden = signal<Orden>('nombre');

  protected readonly categorias = computed(() =>
    [...new Set(this.juegos().map((j) => j.categoria))].sort((a, b) => a.localeCompare(b, 'es')),
  );

  /** Todos los filtros menos la dificultad: sirve para contar cuántos hay de cada nivel. */
  private readonly base = computed(() => {
    const jug = this.jug(), q = normalizar(this.q().trim()), cat = this.cat(), dur = this.dur(), disp = this.disp();
    return this.juegos().filter(
      (j) =>
        (!jug || (jug === 8 ? j.jugadores_max >= 8 : jug >= j.jugadores_min && jug <= j.jugadores_max)) &&
        (!q || j._n.includes(q)) &&
        (!cat || j.categoria === cat) &&
        (!dur || j.duracion_min <= dur) &&
        (!disp || (disp === 'local' ? j.en_local : j.para_llevar)),
    );
  });
  protected readonly porNivel = computed(() => {
    const c = [0, 0, 0, 0, 0, 0];
    for (const j of this.base()) c[j.dificultad]++;
    return c;
  });
  protected readonly resultados = computed(() =>
    this.base()
      .filter((j) => !this.dif() || j.dificultad === this.dif())
      .sort(ORDEN[this.orden()]),
  );

  /** Cuántos juegos se dibujan: la lista crece sola al acercarse al final (scroll infinito). */
  protected readonly limite = signal(TANDA);
  protected readonly mostrados = computed(() => this.resultados().slice(0, this.limite()));
  private readonly centinela = viewChild<ElementRef<HTMLElement>>('centinela');

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    if (!host.hasAttribute('tema')) host.setAttribute('tema', inject(TEMA_POR_DEFECTO));

    // Al cambiar filtros u orden la lista vuelve a empezar desde arriba.
    effect(() => {
      this.resultados();
      untracked(() => this.limite.set(TANDA));
    });

    // Se vuelve a observar tras cada tanda: si el final sigue a la vista (pantalla alta), pide la siguiente.
    effect((limpiar) => {
      const el = this.centinela()?.nativeElement;
      this.limite();
      if (!el || typeof IntersectionObserver === 'undefined') return;
      const obs = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) this.limite.update((n) => Math.min(n + TANDA, untracked(this.resultados).length));
        },
        { rootMargin: '600px 0px' },
      );
      obs.observe(el);
      limpiar(() => obs.disconnect());
    });

    Promise.all([this.api.visibles(), this.api.categorias()])
      .then(([juegos, cats]) => {
        this.juegos.set(juegos.map((j) => ({ ...j, _n: normalizar(j.nombre) })));
        this.colores.set(Object.fromEntries(cats.map((c) => [c.nombre, c.color])));
        this.estado.set('listo');
      })
      .catch((e) => {
        console.error(e);
        this.estado.set('error');
      });
  }

  protected alternarDif(n: number) {
    this.dif.update((d) => (d === n ? 0 : n));
  }

  protected verDesdeRuleta(j: JuegoPublico) {
    this.ruleta.set(false);
    this.abierto.set(j);
  }

  protected limpiar() {
    this.jug.set(0);
    this.dif.set(0);
    this.q.set('');
    this.cat.set('');
    this.dur.set(0);
    this.disp.set('');
  }

  protected jugadores(j: JuegoPublico) {
    return j.jugadores_min === j.jugadores_max ? `${j.jugadores_min}` : `${j.jugadores_min}–${j.jugadores_max}`;
  }

  protected etiquetaSilla(n: number) {
    return n === 8 ? '8 o más jugadores' : n === 1 ? '1 jugador' : `${n} jugadores`;
  }
}
