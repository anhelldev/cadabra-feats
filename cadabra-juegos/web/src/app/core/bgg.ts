import { inject, Injectable } from '@angular/core';
import { CandidatoBgg, EstadoBgg, Juego, BggDatos, Video } from './juegos';
import { Supabase } from './supabase';

/** Tipos de "thing" que acepta la API v2 de BGG (lista fija de su documentación). */
export const TIPOS_BGG = [
  { id: 'boardgame', etiqueta: 'Juego de mesa' },
  { id: 'boardgameexpansion', etiqueta: 'Expansión' },
  { id: 'boardgameaccessory', etiqueta: 'Accesorio' },
  { id: 'videogame', etiqueta: 'Videojuego' },
  { id: 'rpgitem', etiqueta: 'Rol (libro)' },
  { id: 'rpgissue', etiqueta: 'Rol (revista)' },
] as const;

export interface ResultadoBgg extends CandidatoBgg {
  en_catalogo: { id: number; nombre: string } | null;
}

export interface FichaBgg {
  bgg_id: number;
  tipo: string;
  nombre: string;
  jugadores_min: number | null;
  jugadores_max: number | null;
  duracion_min: number | null;
  duracion_max: number | null;
  edad_min: number | null;
  dificultad: number | null;
  categoria: string | null;
  imagen: string | null;
  datos: BggDatos;
  videos: Video[];
}

export interface Tanda {
  procesados: number;
  ok: number;
  dudosos: number;
  sin_resultado: number;
  avisos: string[];
  pendientes: number;
  espera_ms: number;
}

export class ErrorFuncion extends Error {
  constructor(mensaje: string, readonly codigo: string, readonly esperaSeg = 0) {
    super(mensaje);
  }
}

@Injectable({ providedIn: 'root' })
export class Bgg {
  private readonly db = inject(Supabase).client;

  async buscar(q: string, tipos: string[]): Promise<{ total: number; resultados: ResultadoBgg[] }> {
    return this.llamar({ accion: 'buscar', q, tipos });
  }

  private readonly fichas = new Map<number, Promise<FichaBgg>>();

  /** Un juego ya consultado no se vuelve a pedir a BGG mientras la página siga abierta, lo pida quien lo pida. */
  ficha(id: number): Promise<FichaBgg> {
    let pedida = this.fichas.get(id);
    if (!pedida) {
      pedida = this.llamar<{ ficha: FichaBgg }>({ accion: 'ficha', id }).then((r) => r.ficha);
      this.fichas.set(id, pedida);
      pedida.catch(() => this.fichas.delete(id));
    }
    return pedida;
  }

  /** Miniaturas (id → url) de hasta 20 juegos de BGG en una sola petición. */
  async miniaturas(ids: number[]): Promise<Record<number, string>> {
    return (await this.llamar<{ miniaturas: Record<number, string> }>({ accion: 'miniaturas', ids })).miniaturas;
  }

  async vincular(juegoId: number, bggId: number): Promise<Juego> {
    return (await this.llamar<{ juego: Juego }>({ accion: 'vincular', juego_id: juegoId, bgg_id: bggId })).juego;
  }

  async sincronizar(limite = 6): Promise<Tanda> {
    return this.llamar<Tanda>({ accion: 'sincronizar', limite });
  }

  async contar(): Promise<Record<EstadoBgg, number>> {
    const estados: EstadoBgg[] = ['pendiente', 'ok', 'dudoso', 'sin_resultado', 'omitido'];
    const cuentas = await Promise.all(
      estados.map((e) => this.db.from('juegos').select('id', { count: 'exact', head: true }).eq('bgg_estado', e)),
    );
    return Object.fromEntries(estados.map((e, i) => [e, cuentas[i].count ?? 0])) as Record<EstadoBgg, number>;
  }

  /** Vuelve a poner en cola los juegos que BGG no encontró, para intentarlo de nuevo. */
  async reintentarSinResultado(): Promise<void> {
    const { error } = await this.db.from('juegos').update({ bgg_estado: 'pendiente' }).eq('bgg_estado', 'sin_resultado');
    if (error) throw error;
  }

  private async llamar<T>(cuerpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke('bgg', { body: cuerpo });
    if (error) {
      const respuesta = (error as { context?: Response }).context;
      const detalle = respuesta ? await respuesta.json().catch(() => null) : null;
      throw new ErrorFuncion(detalle?.error ?? error.message, 'http');
    }
    if (!data?.ok) throw new ErrorFuncion(data?.error ?? 'Error desconocido', data?.codigo ?? 'interno', data?.espera_s ?? 0);
    return data as T;
  }
}
