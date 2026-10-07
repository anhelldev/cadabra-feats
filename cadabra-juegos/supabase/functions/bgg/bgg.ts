import { XMLParser } from 'npm:fast-xml-parser@4';
import { Candidato, candidatosDesdeBusqueda, Ficha, fichaDesdeItem, OPCIONES_XML } from './mapeo.ts';

export type CodigoError = 'token' | 'limite' | 'cola' | 'red' | 'respuesta';

export class ErrorBgg extends Error {
  constructor(mensaje: string, readonly codigo: CodigoError, readonly esperaSeg = 0) {
    super(mensaje);
  }
}

const parser = new XMLParser({ ...OPCIONES_XML, isArray: (n) => ['item', 'name', 'link', 'video', 'rank', 'poll'].includes(n) });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Separación mínima entre peticiones a BGG. BGG limita el ritmo; mejor ir despacio que ser bloqueado. */
export const SEPARACION_MS = Number(Deno.env.get('BGG_DELAY_MS') ?? 2000);
let ultima = 0;

// deno-lint-ignore no-explicit-any
async function pedir(ruta: string, params: Record<string, string>): Promise<any> {
  const token = Deno.env.get('BGG_TOKEN');
  if (!token) throw new ErrorBgg('Falta el token de BGG en el servidor (secreto BGG_TOKEN).', 'token');
  const base = Deno.env.get('BGG_BASE') ?? 'https://boardgamegeek.com/xmlapi2';

  const espera = ultima + SEPARACION_MS - Date.now();
  if (espera > 0) await dormir(espera);
  ultima = Date.now();

  let r: Response;
  try {
    r = await fetch(`${base}/${ruta}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml', 'User-Agent': 'CadabraJuegos/1.0' },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new ErrorBgg(`No se pudo conectar con BGG: ${(e as Error).message}`, 'red');
  } finally {
    ultima = Date.now();
  }

  if (r.status === 401 || r.status === 403) {
    throw new ErrorBgg('BGG rechazó el token (revisa que sea válido y de tu aplicación).', 'token');
  }
  if (r.status === 429) {
    throw new ErrorBgg('BGG pide ir más despacio.', 'limite', Number(r.headers.get('retry-after')) || 30);
  }
  if (r.status === 202) throw new ErrorBgg('BGG está preparando la respuesta; reintenta en unos segundos.', 'cola', 5);
  if (!r.ok) throw new ErrorBgg(`BGG respondió ${r.status}.`, 'respuesta');
  return parser.parse(await r.text());
}

export async function buscar(q: string, tipos: string[]): Promise<Candidato[]> {
  return candidatosDesdeBusqueda(await pedir('search', { query: q, type: tipos.join(',') }));
}

/** Miniaturas de hasta 20 juegos en una sola petición ligera (sin estadísticas ni videos). */
export async function miniaturas(ids: number[]): Promise<Map<number, string>> {
  const salida = new Map<number, string>();
  if (!ids.length) return salida;
  const xml = await pedir('thing', { id: ids.slice(0, 20).join(',') });
  // deno-lint-ignore no-explicit-any
  for (const item of (xml?.items?.item ?? []) as any[]) {
    const url = item.thumbnail ? String(item.thumbnail).trim() : '';
    if (url) salida.set(Number(item['@_id']), url);
  }
  return salida;
}

/** Hasta 20 ids por petición (límite de BGG). Devuelve las fichas por id. */
export async function fichas(ids: number[]): Promise<Map<number, Ficha>> {
  const salida = new Map<number, Ficha>();
  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    const xml = await pedir('thing', { id: lote.join(','), stats: '1', videos: '1' });
    // deno-lint-ignore no-explicit-any
    for (const item of (xml?.items?.item ?? []) as any[]) {
      const f = fichaDesdeItem(item);
      salida.set(f.bgg_id, f);
    }
  }
  return salida;
}
