import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { Supabase } from './supabase';

export type EstadoSolicitud = 'pendiente' | 'contactado' | 'cancelada';

export interface Solicitud {
  id: number;
  juego_id: number | null;
  juego_nombre: string;
  nombre: string;
  telefono: string;
  email: string | null;
  nota: string | null;
  estado: EstadoSolicitud;
  creado: string;
  contactado_en: string | null;
}

export interface NuevaSolicitud {
  juego_id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  nota: string | null;
}

/** Error de envío con un código para que la pantalla decida qué mostrar (por ejemplo, "ya la tenías pedida"). */
export class ErrorSolicitud extends Error {
  constructor(mensaje: string, readonly codigo: 'duplicada' | 'no-disponible' | 'datos' | 'otro') {
    super(mensaje);
  }
}

/**
 * Deja el teléfono en formato internacional (+584121234567). Sin "+" se usa el prefijo configurado en el environment;
 * si no hay prefijo, el visitante tiene que escribir el código de país.
 */
export function normalizarTelefono(texto: string, prefijo: string = environment.solicitudes.prefijo): string | null {
  let s = texto.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (!prefijo) return null;
    s = prefijo + s.replace(/^0+/, '');
  }
  return /^\+[0-9]{8,15}$/.test(s) ? s : null;
}

/** Mensaje que se le envía a quien pidió el juego. En WhatsApp el encargado puede editarlo antes de mandarlo. */
export function mensajeWhatsapp(s: Pick<Solicitud, 'nombre' | 'juego_nombre'>): string {
  const primerNombre = s.nombre.trim().split(/\s+/)[0];
  return (
    `Hola ${primerNombre}, somos Cadabra 🎲\n\n` +
    `Queremos decirte que el juego «${s.juego_nombre}» que solicitaste para jugar en el local estará disponible. ` +
    `Un encargado se pondrá en contacto contigo para coordinar qué día podrás jugarlo.\n\n` +
    `¡Gracias por tu interés!`
  );
}

export const enlaceWhatsapp = (s: Pick<Solicitud, 'nombre' | 'juego_nombre' | 'telefono'>): string =>
  `https://wa.me/${s.telefono.replace('+', '')}?text=${encodeURIComponent(mensajeWhatsapp(s))}`;

function traducir(e: { code?: string; message: string }): ErrorSolicitud {
  if (e.code === '23505') return new ErrorSolicitud('Ya tienes una solicitud pendiente para este juego. ¡Te avisaremos!', 'duplicada');
  if (e.code === '42501') {
    return new ErrorSolicitud('Este juego ya no se puede solicitar: puede que ya esté disponible en el local.', 'no-disponible');
  }
  if (e.code === '23514') return new ErrorSolicitud('Revisa tus datos: hay algo que no tiene el formato correcto.', 'datos');
  // Los límites de uso los redacta la propia base de datos, en español.
  return new ErrorSolicitud(e.message, 'otro');
}

@Injectable({ providedIn: 'root' })
export class Solicitudes {
  private readonly db = inject(Supabase).client;

  /** Solo el admin puede cargarlas: a un visitante la base de datos le devuelve vacío o rechaza la consulta. */
  readonly lista = signal<Solicitud[]>([]);
  readonly cargando = signal(false);
  readonly pendientes = computed(() => this.lista().filter((s) => s.estado === 'pendiente'));
  readonly totalPendientes = computed(() => this.pendientes().length);
  readonly pendientesPorJuego = computed(() => {
    const m = new Map<number, number>();
    for (const s of this.pendientes()) if (s.juego_id != null) m.set(s.juego_id, (m.get(s.juego_id) ?? 0) + 1);
    return m;
  });

  /** Enviar una solicitud (lo hace el visitante, sin iniciar sesión). */
  async crear(s: NuevaSolicitud): Promise<void> {
    const { error } = await this.db.from('solicitudes').insert({ ...s, acepta: true });
    if (error) throw traducir(error);
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const todas: Solicitud[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await this.db.from('solicitudes').select('*').order('creado', { ascending: false }).range(desde, desde + 999);
        if (error) throw error;
        todas.push(...data);
        if (data.length < 1000) break;
      }
      this.lista.set(todas);
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarEstado(id: number, estado: EstadoSolicitud): Promise<void> {
    const cambios = { estado, contactado_en: estado === 'contactado' ? new Date().toISOString() : null };
    const { data, error } = await this.db.from('solicitudes').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    this.lista.update((l) => l.map((s) => (s.id === id ? data : s)));
  }

  async borrar(id: number): Promise<void> {
    const { error } = await this.db.from('solicitudes').delete().eq('id', id);
    if (error) throw error;
    this.lista.update((l) => l.filter((s) => s.id !== id));
  }
}
