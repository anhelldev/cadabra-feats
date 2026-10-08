import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { aSlug, Juego } from './juegos';
import { ErrorSolicitud } from './solicitudes';
import { Supabase } from './supabase';
import { PartidaLlave } from './torneos-logica';

export type FormatoTorneo = 'puntuacion' | 'eliminacion';
export type EstadoTorneo = 'borrador' | 'inscripcion' | 'en_curso' | 'finalizado' | 'cancelado';
export type EstadoInscripcion = 'inscrito' | 'espera' | 'retirado';

export const FORMATOS: Record<FormatoTorneo, string> = { puntuacion: 'Por puntuación', eliminacion: 'Eliminación directa' };
export const ESTADOS: Record<EstadoTorneo, string> = {
  borrador: 'Borrador',
  inscripcion: 'Inscripciones abiertas',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

/** El juego que se juega en un torneo: la fila completa, para poder abrir su ficha en la página pública. */
export type JuegoDeTorneo = Juego;

export interface Torneo {
  id: number;
  slug: string;
  nombre: string;
  juego_id: number | null;
  descripcion: string | null;
  formato: FormatoTorneo;
  fecha: string;
  lugar: string | null;
  cupos: number;
  rondas: number | null;
  tamano_mesa: number | null;
  estado: EstadoTorneo;
  ronda_actual: number;
  imagen: string | null;
  creado: string;
  /** Solo en la lectura pública (`publicos()`). */
  juego?: JuegoDeTorneo | null;
}
export type DatosTorneo = Pick<Torneo, 'nombre' | 'juego_id' | 'descripcion' | 'formato' | 'fecha' | 'lugar' | 'cupos' | 'rondas' | 'tamano_mesa' | 'imagen'>;

export interface Inscripcion {
  id: number;
  torneo_id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  estado: EstadoInscripcion;
  creado: string;
}
/** Lo que ve el público de un inscrito: solo el nombre. */
export interface Participante {
  id: number;
  torneo_id: number;
  nombre: string;
  estado: EstadoInscripcion;
}
export interface JugadorPartida {
  inscripcion_id: number;
  puntos: number | null;
  gano: boolean | null;
}
export interface PartidaFila {
  id: number;
  torneo_id: number;
  ronda: number;
  numero: number;
  estado: 'pendiente' | 'jugada';
  partida_jugadores: JugadorPartida[];
}
/** Fila de la vista pública: una por jugador de cada partida (o una sola con jugador nulo si la partida está vacía). */
export interface FilaPublica {
  partida_id: number;
  torneo_id: number;
  ronda: number;
  numero: number;
  estado: 'pendiente' | 'jugada';
  inscripcion_id: number | null;
  nombre: string | null;
  puntos: number | null;
  gano: boolean | null;
}
export interface NuevaInscripcion {
  torneo_id: number;
  nombre: string;
  telefono: string;
  email: string | null;
}

/** Link que se comparte para inscribirse: la página de WordPress con el catálogo de torneos, o la de la app si no hay. */
export const linkInscripcion = (slug: string): string => {
  const base = environment.torneos.urlPublica || `${location.origin}/torneos`;
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(slug)}`;
};

const mensajeInscripcion = (e: { code?: string; message: string }): ErrorSolicitud => {
  if (e.code === '23505') return new ErrorSolicitud('Ya estás inscrito en este torneo.', 'duplicada');
  if (e.code === '42501') return new ErrorSolicitud('Las inscripciones de este torneo no están abiertas.', 'no-disponible');
  if (e.code === '23514') return new ErrorSolicitud('Revisa tus datos: hay algo que no tiene el formato correcto.', 'datos');
  // Los límites y el cierre de inscripciones los redacta la propia base de datos, en español.
  return new ErrorSolicitud(e.message, 'otro');
};

@Injectable({ providedIn: 'root' })
export class Torneos {
  private readonly db = inject(Supabase).client;

  readonly lista = signal<Torneo[]>([]);
  readonly cargando = signal(false);
  /** Inscritos y en espera por torneo (solo el admin los puede contar). */
  readonly cuentas = signal<Map<number, { inscritos: number; espera: number }>>(new Map());
  readonly abiertos = computed(() => this.lista().filter((t) => t.estado === 'inscripcion').length);

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [t, i] = await Promise.all([
        this.db.from('torneos').select('*').order('fecha', { ascending: false }),
        this.db.from('inscripciones').select('torneo_id,estado'),
      ]);
      if (t.error) throw t.error;
      if (i.error) throw i.error;
      this.lista.set(t.data);
      const m = new Map<number, { inscritos: number; espera: number }>();
      for (const x of i.data) {
        const c = m.get(x.torneo_id) ?? { inscritos: 0, espera: 0 };
        if (x.estado === 'inscrito') c.inscritos++;
        else if (x.estado === 'espera') c.espera++;
        m.set(x.torneo_id, c);
      }
      this.cuentas.set(m);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Vuelve a leer un torneo (por ejemplo, después de que una función de la base de datos le cambió el estado). */
  async refrescar(id: number): Promise<Torneo> {
    const { data, error } = await this.db.from('torneos').select('*').eq('id', id).single();
    if (error) throw error;
    this.lista.update((l) => l.map((t) => (t.id === id ? data : t)));
    return data;
  }

  async crear(d: DatosTorneo): Promise<Torneo> {
    const base = aSlug(d.nombre) || 'torneo';
    const existentes = new Set(this.lista().map((t) => t.slug));
    let slug = base;
    for (let n = 2; existentes.has(slug); n++) slug = `${base}-${n}`;
    const { data, error } = await this.db.from('torneos').insert({ ...d, slug }).select().single();
    if (error) throw error;
    this.lista.update((l) => [data, ...l]);
    return data;
  }

  async actualizar(id: number, cambios: Partial<Torneo>): Promise<Torneo> {
    const { data, error } = await this.db.from('torneos').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    this.lista.update((l) => l.map((t) => (t.id === id ? data : t)));
    return data;
  }

  async borrar(id: number): Promise<void> {
    const { error } = await this.db.from('torneos').delete().eq('id', id);
    if (error) throw error;
    this.lista.update((l) => l.filter((t) => t.id !== id));
  }

  /** Sube la imagen promocional (ya reducida) al bucket público y devuelve su URL. */
  async subirImagen(slug: string, imagen: Blob): Promise<string> {
    const ruta = `torneos/${slug}-${Date.now()}.webp`;
    const { error } = await this.db.storage.from('portadas').upload(ruta, imagen, { contentType: 'image/webp' });
    if (error) throw error;
    return this.db.storage.from('portadas').getPublicUrl(ruta).data.publicUrl;
  }

  /** Borra una imagen que ya no se usa; si falla no importa, solo queda un archivo huérfano. */
  async borrarImagen(url: string | null): Promise<void> {
    const marca = '/portadas/';
    const i = url?.indexOf(marca) ?? -1;
    if (!url || i < 0) return;
    await this.db.storage.from('portadas').remove([url.slice(i + marca.length)]).catch(() => undefined);
  }

  // ---- Admin: inscritos y partidas ----

  async inscripciones(torneoId: number): Promise<Inscripcion[]> {
    const { data, error } = await this.db.from('inscripciones').select('id,torneo_id,nombre,telefono,email,estado,creado').eq('torneo_id', torneoId).order('creado');
    if (error) throw error;
    return data;
  }

  async cambiarInscripcion(id: number, estado: EstadoInscripcion): Promise<void> {
    const { error } = await this.db.from('inscripciones').update({ estado }).eq('id', id);
    if (error) throw error;
  }

  async partidas(torneoId: number): Promise<PartidaFila[]> {
    const { data, error } = await this.db
      .from('partidas')
      .select('id,torneo_id,ronda,numero,estado,partida_jugadores(inscripcion_id,puntos,gano)')
      .eq('torneo_id', torneoId)
      .order('ronda')
      .order('numero');
    if (error) throw error;
    return data as PartidaFila[];
  }

  async iniciar(torneoId: number, partidas: PartidaLlave[] | { ronda: number; numero: number; jugadores: { inscripcion_id: number }[] }[]): Promise<void> {
    const { error } = await this.db.rpc('iniciar_torneo', { p_torneo: torneoId, p_partidas: partidas });
    if (error) throw error;
  }

  async crearPartidas(torneoId: number, partidas: { ronda: number; numero: number; jugadores: { inscripcion_id: number }[] }[]): Promise<void> {
    const { error } = await this.db.rpc('crear_partidas', { p_torneo: torneoId, p_partidas: partidas });
    if (error) throw error;
  }

  /** Anota los puntos de una mesa y la da por jugada. */
  async guardarPuntos(partidaId: number, filas: { inscripcion_id: number; puntos: number }[]): Promise<void> {
    const r = await this.db.from('partida_jugadores').upsert(filas.map((f) => ({ partida_id: partidaId, ...f })));
    if (r.error) throw r.error;
    const p = await this.db.from('partidas').update({ estado: 'jugada' }).eq('id', partidaId);
    if (p.error) throw p.error;
  }

  /** Marca ganador y perdedor de un cruce, lo da por jugado y mete al ganador en la siguiente partida. */
  async guardarCruce(
    partidaId: number,
    marcar: { inscripcion_id: number; gano: boolean }[],
    siguiente?: { partida_id: number; inscripcion_id: number },
  ): Promise<void> {
    for (const m of marcar) {
      const r = await this.db.from('partida_jugadores').update({ gano: m.gano }).eq('partida_id', partidaId).eq('inscripcion_id', m.inscripcion_id);
      if (r.error) throw r.error;
    }
    const p = await this.db.from('partidas').update({ estado: 'jugada' }).eq('id', partidaId);
    if (p.error) throw p.error;
    if (siguiente) {
      const s = await this.db.from('partida_jugadores').insert({ partida_id: siguiente.partida_id, inscripcion_id: siguiente.inscripcion_id });
      if (s.error) throw s.error;
    }
  }

  // ---- Público ----

  async publicos(): Promise<Torneo[]> {
    const { data, error } = await this.db
      .from('torneos')
      
      .select('*, juego:juegos(*)')
      .neq('estado', 'borrador')
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data as unknown as Torneo[];
  }

  async participantes(torneoId: number): Promise<Participante[]> {
    const { data, error } = await this.db.from('torneo_participantes').select('*').eq('torneo_id', torneoId).order('id');
    if (error) throw error;
    return data as Participante[];
  }

  async partidasPublicas(torneoId: number): Promise<FilaPublica[]> {
    const { data, error } = await this.db.from('torneo_partidas_publicas').select('*').eq('torneo_id', torneoId).order('ronda').order('numero');
    if (error) throw error;
    return data as FilaPublica[];
  }

  async inscribir(i: NuevaInscripcion): Promise<void> {
    const { error } = await this.db.from('inscripciones').insert({ ...i, acepta: true });
    if (error) throw mensajeInscripcion(error);
  }
}
