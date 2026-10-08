import { inject, Injectable } from '@angular/core';
import { Supabase } from './supabase';
import { faltantes } from './util-juegos';

export interface Video {
  id: number;
  titulo: string;
  url: string;
  categoria: string;
  idioma: string;
}

export interface BggDatos {
  nombre: string;
  anio: number | null;
  rating: number | null;
  votos: number | null;
  peso: number | null;
  ranking: number | null;
  mecanicas: string[];
  categorias: string[];
  disenadores: string[];
  editoriales: string[];
  nombres_alt: string[];
  descripcion: string | null;
  miniatura: string | null;
  videos_total: number;
}

export interface CandidatoBgg {
  id: number;
  nombre: string;
  anio: number | null;
  tipo: string;
  motivo?: string;
}

export type EstadoBgg = 'pendiente' | 'ok' | 'dudoso' | 'sin_resultado' | 'omitido';

export interface Juego {
  id: number;
  slug: string;
  nombre: string;
  jugadores_min: number | null;
  jugadores_max: number | null;
  duracion_min: number | null;
  duracion_max: number | null;
  dificultad: number | null;
  edad_min: number | null;
  categoria: string | null;
  descripcion: string | null;
  descripcion_tienda: string | null;
  tips: string[];
  portada: string | null;
  tienda_id: number | null;
  url_tienda: string | null;
  origen: 'catalogo' | 'tienda' | 'local' | 'bgg';
  revisar: boolean;
  visible: boolean;
  en_local: boolean;
  para_llevar: boolean;
  bgg_id: number | null;
  bgg_tipo: string | null;
  bgg_estado: EstadoBgg;
  bgg_candidatos: CandidatoBgg[];
  bgg_datos: BggDatos | null;
  videos: Video[];
  portada_origen: 'tienda' | 'bgg' | 'manual' | null;
  bgg_sync: string | null;
  actualizado: string;
}

/** Un juego visible siempre tiene estos datos (lo garantiza la restricción visible_completo). */
export type JuegoPublico = Juego & {
  [K in 'jugadores_min' | 'jugadores_max' | 'duracion_min' | 'dificultad' | 'edad_min' | 'categoria']: NonNullable<Juego[K]>;
};

export interface Categoria {
  nombre: string;
  color: string;
}

export type CambiosJuego = Partial<Omit<Juego, 'id' | 'actualizado'>>;

/**
 * Imagen para listas y tablas. Una portada que sigue en el servidor de BGG puede pesar varios MB, así que ahí se usa su
 * miniatura; una portada copiada a nuestro almacenamiento ya está achicada y se usa tal cual.
 */
export const miniaturaDe = (j: Pick<Juego, 'portada' | 'bgg_datos'>): string | null =>
  (j.portada?.includes('geekdo-images.com') && j.bgg_datos?.miniatura) || j.portada;

/** Qué tan buen candidato es un juego para conservarlo al fusionar duplicados: visible, completo y revisado pesan más. */
export const puntosParaConservar = (j: Juego): number =>
  (j.visible ? 8 : 0) + (faltantes(j).length ? 0 : 4) + (j.revisar ? 0 : 2) + (j.en_local ? 1 : 0) + (j.origen === 'catalogo' ? 1 : 0) + (j.bgg_id ? 1 : 0);

export const urlBgg = (j: Pick<Juego, 'bgg_id' | 'bgg_tipo'>) =>
  j.bgg_id ? `https://boardgamegeek.com/${j.bgg_tipo === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame'}/${j.bgg_id}` : null;

export const NIVELES = ['', 'Muy fácil', 'Fácil', 'Media', 'Difícil', 'Experto'] as const;

export { faltantes } from './util-juegos';

const TANDA = 1000;

@Injectable({ providedIn: 'root' })
export class Juegos {
  private readonly db = inject(Supabase).client;

  async visibles(): Promise<JuegoPublico[]> {
    return (await this.paginado(true)) as JuegoPublico[];
  }

  /** Para el panel: con sesión de admin, RLS devuelve también los ocultos. */
  async todos(): Promise<Juego[]> {
    return this.paginado(false);
  }

  /** La API devuelve como mucho 1000 filas por petición (max_rows), así que se pide por tandas. */
  private async paginado(soloVisibles: boolean): Promise<Juego[]> {
    const todos: Juego[] = [];
    for (let desde = 0; ; desde += TANDA) {
      let consulta = this.db.from('juegos').select('*').order('nombre').order('id');
      if (soloVisibles) consulta = consulta.eq('visible', true);
      const { data, error } = await consulta.range(desde, desde + TANDA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < TANDA) return todos;
    }
  }

  async categorias(): Promise<Categoria[]> {
    const { data, error } = await this.db.from('categorias').select('*').order('nombre');
    if (error) throw error;
    return data;
  }

  async actualizar(id: number, cambios: CambiosJuego): Promise<Juego> {
    const { data, error } = await this.db.from('juegos').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async crear(juego: CambiosJuego & Pick<Juego, 'slug' | 'nombre'>): Promise<Juego> {
    const { data, error } = await this.db.from('juegos').insert(juego).select().single();
    if (error) throw error;
    return data;
  }

  /** Crea varios juegos de una vez (por tandas); devuelve cuántos se crearon. Una tanda con un problema falla completa. */
  async crearVarios(filas: Record<string, unknown>[]): Promise<number> {
    let creados = 0;
    for (let i = 0; i < filas.length; i += 100) {
      const tanda = filas.slice(i, i + 100);
      const { error } = await this.db.from('juegos').insert(tanda);
      if (error) throw error;
      creados += tanda.length;
    }
    return creados;
  }

  /**
   * Fusiona duplicados en el juego que se conserva: lo que a éste le falte (portada, enlace a la tienda, vínculo con BGG,
   * datos de juego…) se toma de los duplicados, y después los duplicados se borran. Orden de pasos pensado para no perder
   * datos: 1) liberar los campos únicos del duplicado, 2) completar el juego conservado, 3) borrar los duplicados.
   */
  async fusionar(conservar: Juego, duplicados: Juego[]): Promise<Juego> {
    const vacio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length);
    const cambios: Record<string, unknown> = {};
    const tomar = (campo: keyof Juego, extra: (d: Juego) => Record<string, unknown> = () => ({})) => {
      if (!vacio(conservar[campo]) || campo in cambios) return;
      const fuente = duplicados.find((d) => !vacio(d[campo]));
      if (fuente) Object.assign(cambios, { [campo]: fuente[campo] }, extra(fuente));
    };
    tomar('portada', (d) => ({ portada_origen: d.portada_origen }));
    for (const c of ['url_tienda', 'tienda_id', 'descripcion_tienda', 'descripcion', 'tips'] as const) tomar(c);
    tomar('bgg_id', (d) => ({ bgg_tipo: d.bgg_tipo, bgg_estado: d.bgg_estado, bgg_datos: d.bgg_datos, videos: d.videos, bgg_candidatos: [] }));
    // Datos emparejados (máx ≥ mín) salen siempre del mismo duplicado. Si eran estimados, el juego sigue "para revisar".
    const grupo = (campos: (keyof Juego)[], obligatorios: (keyof Juego)[]) => {
      if (obligatorios.every((c) => !vacio(conservar[c]))) return;
      const fuente = duplicados.find((d) => obligatorios.every((c) => !vacio(d[c])));
      if (!fuente) return;
      for (const c of campos) cambios[c] = fuente[c];
      if (fuente.revisar) cambios['revisar'] = true;
    };
    grupo(['jugadores_min', 'jugadores_max'], ['jugadores_min', 'jugadores_max']);
    grupo(['duracion_min', 'duracion_max'], ['duracion_min']);
    for (const c of ['dificultad', 'edad_min', 'categoria'] as const) tomar(c, (d) => (d.revisar ? { revisar: true } : {}));
    if (!conservar.en_local && duplicados.some((d) => d.en_local)) cambios['en_local'] = true;

    const liberar: Record<string, null> = {};
    if ('tienda_id' in cambios) liberar['tienda_id'] = null;
    if ('bgg_id' in cambios) liberar['bgg_id'] = null;
    if (Object.keys(liberar).length) {
      for (const d of duplicados) {
        const { error } = await this.db.from('juegos').update(liberar).eq('id', d.id);
        if (error) throw error;
      }
    }
    const conservado = Object.keys(cambios).length ? await this.actualizar(conservar.id, cambios as CambiosJuego) : conservar;
    await this.moverSolicitudes(duplicados.map((d) => d.id), conservar.id);
    for (const d of duplicados) await this.borrar(d.id);
    return conservado;
  }

  /**
   * Las solicitudes de los duplicados pasan al juego que se conserva. Si la misma persona ya tenía pendiente ese juego,
   * la repetida sobra y se borra (la base de datos no admite dos pendientes iguales).
   */
  private async moverSolicitudes(desde: number[], hacia: number): Promise<void> {
    const { data, error } = await this.db.from('solicitudes').select('id').in('juego_id', desde);
    if (error) throw error;
    for (const { id } of data ?? []) {
      const { error: e } = await this.db.from('solicitudes').update({ juego_id: hacia }).eq('id', id);
      if (e?.code === '23505') await this.db.from('solicitudes').delete().eq('id', id);
      else if (e) throw e;
    }
  }

  async borrar(id: number): Promise<void> {
    const { error } = await this.db.from('juegos').delete().eq('id', id);
    if (error) throw error;
  }

  async subirPortada(slug: string, archivo: File): Promise<string> {
    const ext = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const ruta = `${slug}-${Date.now()}.${ext}`;
    const { error } = await this.db.storage.from('portadas').upload(ruta, archivo, { contentType: archivo.type });
    if (error) throw error;
    return this.db.storage.from('portadas').getPublicUrl(ruta).data.publicUrl;
  }
}

export function textoDuracion(min: number | null, max: number | null): string {
  if (min == null) return '—';
  return max != null && max > min ? `${min}–${max} min` : `${min} min`;
}


export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m.includes('visible_completo')) return 'Para hacerlo visible faltan datos del juego.';
  if (m.includes('juegos_slug_key')) return 'Ya hay otro juego con ese slug.';
  if (m.includes('juegos_bgg_id_key')) return 'Ese juego de BGG ya está en el catálogo.';
  return m;
}
export { aSlug, normalizar } from './util-juegos';
