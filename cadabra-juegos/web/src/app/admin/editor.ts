import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Bgg } from '../core/bgg';
import { DetalleBgg } from './detalle-bgg';
import { aSlug, CambiosJuego, CandidatoBgg, Categoria, faltantes, Juego, Juegos, mensajeError, NIVELES, urlBgg } from '../core/juegos';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function rangos(g: AbstractControl): ValidationErrors | null {
  const v = g.value;
  const errores: ValidationErrors = {};
  if (v.jugadores_min != null && v.jugadores_max != null && v.jugadores_max < v.jugadores_min) errores['rango'] = true;
  if (v.duracion_min != null && v.duracion_max != null && v.duracion_max < v.duracion_min) errores['rangoDuracion'] = true;
  return Object.keys(errores).length ? errores : null;
}

@Component({
  selector: 'app-editor',
  imports: [ReactiveFormsModule, DetalleBgg],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.css',
})
export class Editor {
  private readonly api = inject(Juegos);
  private readonly bgg = inject(Bgg);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly juego = input<Juego | null>(null);
  /** Datos de BGG con los que arranca un juego nuevo. */
  readonly precarga = input<Partial<Juego> | null>(null);
  readonly categorias = input<Categoria[]>([]);
  /** Todos los juegos, para saber qué opción de BGG ya está vinculada a otro. */
  readonly juegos = input<Juego[]>([]);
  readonly buscarEnBgg = output();
  readonly guardado = output<Juego>();
  readonly borrado = output<number>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly niveles = NIVELES;
  protected readonly error = signal('');
  protected readonly ocupado = signal(false);
  protected readonly confirmarBorrado = signal(false);
  /** Opción de BGG cuyo detalle se está viendo (el ojo). */
  protected readonly detalle = signal<CandidatoBgg | null>(null);

  protected readonly form = this.fb.group(
    {
      nombre: ['', Validators.required],
      slug: ['', [Validators.required, Validators.pattern(SLUG)]],
      categoria: this.fb.control<string | null>(null),
      jugadores_min: this.fb.control<number | null>(null, Validators.min(1)),
      jugadores_max: this.fb.control<number | null>(null, Validators.min(1)),
      duracion_min: this.fb.control<number | null>(null, Validators.min(1)),
      duracion_max: this.fb.control<number | null>(null, Validators.min(1)),
      dificultad: this.fb.control<number | null>(null),
      edad_min: this.fb.control<number | null>(null, Validators.min(0)),
      descripcion: '',
      tips: '',
      portada: '',
      url_tienda: '',
      revisar: false,
      en_local: false,
      para_llevar: false,
      visible: false,
    },
    { validators: rangos },
  );

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly faltan = computed(() => faltantes(this.valores()));
  protected readonly portada = computed(() => this.valores().portada);
  /** Lo que se sabe de BGG para este juego (el guardado o el recién elegido). */
  protected readonly datosBgg = computed(() => this.juego() ?? this.precarga());
  protected readonly urlBgg = urlBgg;
  protected readonly enlace = computed(() => {
    const d = this.datosBgg();
    return d ? urlBgg({ bgg_id: d.bgg_id ?? null, bgg_tipo: d.bgg_tipo ?? null }) : null;
  });

  constructor() {
    afterNextRender(() => {
      const j = this.juego();
      if (j) {
        this.form.reset({
          ...j,
          descripcion: j.descripcion ?? '',
          tips: j.tips.join('\n'),
          portada: j.portada ?? '',
          url_tienda: j.url_tienda ?? '',
        });
      }
      const p = this.precarga();
      if (!j && p) {
        this.form.reset({
          nombre: p.nombre ?? '',
          slug: p.slug ?? '',
          categoria: p.categoria ?? null,
          jugadores_min: p.jugadores_min ?? null,
          jugadores_max: p.jugadores_max ?? null,
          duracion_min: p.duracion_min ?? null,
          duracion_max: p.duracion_max ?? null,
          dificultad: p.dificultad ?? null,
          edad_min: p.edad_min ?? null,
          portada: p.portada ?? '',
        });
        this.form.controls.slug.markAsDirty();
      }
      // Un juego nuevo propone el slug a partir del nombre mientras no se toque el slug.
      this.form.controls.nombre.valueChanges.subscribe((n) => {
        if (!this.juego() && !this.form.controls.slug.dirty) this.form.controls.slug.setValue(aSlug(n));
      });
      this.dialogo().nativeElement.showModal();
    });
  }

  protected async guardar() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (v.visible && this.faltan().length) {
      this.error.set(`Para hacerlo visible falta: ${this.faltan().join(', ')}.`);
      return;
    }
    const cambios: CambiosJuego = {
      ...v,
      nombre: v.nombre.trim(),
      dificultad: v.dificultad == null ? null : +v.dificultad,
      descripcion: v.descripcion.trim() || null,
      tips: v.tips.split('\n').map((t) => t.trim()).filter(Boolean),
      portada: v.portada.trim() || null,
      url_tienda: v.url_tienda.trim() || null,
    };
    const j = this.juego();
    const p = this.precarga();
    // Si la portada cambió respecto a la original (la de BGG o la que ya tenía), pasa a ser manual.
    const inicial = (j ?? p)?.portada ?? null;
    if ((cambios.portada ?? null) !== inicial) cambios.portada_origen = cambios.portada ? 'manual' : null;
    await this.ejecutar(async () => {
      if (j) return this.guardado.emit(await this.api.actualizar(j.id, cambios));
      const bgg: CambiosJuego = p
        ? { origen: 'bgg', bgg_id: p.bgg_id, bgg_tipo: p.bgg_tipo, bgg_estado: p.bgg_estado, bgg_datos: p.bgg_datos, videos: p.videos }
        : {};
      if (p?.portada_origen && cambios.portada_origen === undefined) bgg.portada_origen = p.portada_origen;
      this.guardado.emit(await this.api.crear({ ...cambios, ...bgg, slug: v.slug, nombre: v.nombre }));
    });
  }

  protected async borrar() {
    const j = this.juego();
    if (!j) return;
    if (!this.confirmarBorrado()) return this.confirmarBorrado.set(true);
    await this.ejecutar(async () => {
      await this.api.borrar(j.id);
      this.borrado.emit(j.id);
    });
  }

  protected async subir(e: Event) {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    if (archivo.size > 500 * 1024) {
      this.error.set('La imagen pesa más de 500 KB. Redúcela (unos 600 px de ancho, webp o jpg).');
      return;
    }
    await this.ejecutar(async () => {
      const url = await this.api.subirPortada(this.form.controls.slug.value || 'juego', archivo);
      this.form.controls.portada.setValue(url);
      this.form.controls.portada.markAsDirty();
    });
  }

  protected titular(c: CandidatoBgg): Juego | undefined {
    return this.juegos().find((x) => x.bgg_id === c.id && x.id !== this.juego()?.id);
  }

  protected avisoBloqueo(c: CandidatoBgg): string | null {
    const t = this.titular(c);
    return t ? `Ya está vinculado a «${t.nombre}». Si es el mismo juego, fusiónalos desde «Revisar BGG» o «Duplicados».` : (c.motivo ?? null);
  }

  protected async elegirDesdeDetalle(c: CandidatoBgg) {
    this.detalle.set(null);
    await this.elegirCandidato(c);
  }

  protected async elegirCandidato(c: CandidatoBgg) {
    const j = this.juego();
    if (!j) return;
    await this.ejecutar(async () => {
      this.guardado.emit(await this.bgg.vincular(j.id, c.id));
    });
  }

  protected cerrarSiFuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }

  private async ejecutar(fn: () => Promise<void>) {
    this.error.set('');
    this.ocupado.set(true);
    try {
      await fn();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
