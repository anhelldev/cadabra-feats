// Conversión de la respuesta de BGG (XML ya parseado) a datos del catálogo. Sin dependencias, para poder probarlo.

export interface Video {
  id: number;
  titulo: string;
  url: string;
  categoria: string;
  idioma: string;
}

export interface Ficha {
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
  datos: {
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
  };
  videos: Video[];
}

export interface Candidato {
  id: number;
  nombre: string;
  anio: number | null;
  tipo: string;
  motivo?: string;
}

/** Opciones de fast-xml-parser: atributos con prefijo @_ y texto sin convertir a número. */
export const OPCIONES_XML = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: true,
  trimValues: true,
};

// deno-lint-ignore no-explicit-any
type Nodo = any;

const lista = (x: Nodo): Nodo[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const valor = (x: Nodo): string | null => {
  const v = Array.isArray(x) ? x[0]?.['@_value'] : x?.['@_value'];
  return v == null || v === '' ? null : String(v);
};
const numero = (x: Nodo): number | null => {
  const n = Number(valor(x));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', times: '×', bull: '•', eacute: 'é', egrave: 'è', aacute: 'á', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

/** BGG devuelve descripciones con entidades HTML (a veces doble codificadas). */
export function limpiarTexto(s: string): string {
  const una = (t: string) =>
    t
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
  return una(una(s)).replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const PRIORIDAD_VIDEO = ['instructional', 'review', 'unboxing', 'session', 'preview', 'interview', 'humor', 'other'];

function videosDe(item: Nodo): Video[] {
  const vs = lista(item.videos?.video)
    .map((v): Video => ({
      id: Number(v['@_id']),
      titulo: String(v['@_title'] ?? ''),
      url: String(v['@_link'] ?? '').replace(/^http:\/\/((?:www\.)?(?:youtube\.com|youtu\.be)\/)/i, 'https://$1'),
      categoria: String(v['@_category'] ?? 'other'),
      idioma: String(v['@_language'] ?? ''),
    }))
    .filter((v) => /^https?:\/\//.test(v.url));
  const rangoCategoria = (c: string) => {
    const i = PRIORIDAD_VIDEO.indexOf(c.toLowerCase());
    return i < 0 ? PRIORIDAD_VIDEO.length : i;
  };
  // Primero español, luego inglés, luego el resto; dentro de cada idioma, por tipo de video.
  const rangoIdioma = (l: string) => (/^spanish/i.test(l) ? 0 : /^english/i.test(l) ? 1 : 2);
  const rango = (v: Video) => rangoIdioma(v.idioma) * 100 + rangoCategoria(v.categoria);
  return vs.sort((a, b) => rango(a) - rango(b)).slice(0, 12);
}

const enlaces = (item: Nodo, tipo: string): string[] =>
  lista(item.link).filter((l) => l['@_type'] === tipo).map((l) => String(l['@_value']));

/** Reglas para encajar las categorías/mecánicas de BGG en las categorías del catálogo. El orden importa. */
export function categoriaCadabra(tipo: string, categorias: string[], mecanicas: string[], peso: number | null): string | null {
  if (tipo === 'boardgameexpansion') return 'Expansión';
  if (tipo !== 'boardgame') return null;
  const c = new Set([...categorias, ...mecanicas].map((x) => x.toLowerCase()));
  const tiene = (...ks: string[]) => ks.some((k) => c.has(k.toLowerCase()));
  if (tiene("Children's Game")) return 'Infantil';
  if (tiene('Mature / Adult')) return 'Adultos';
  if (tiene('Party Game')) return 'Party';
  if (tiene('Cooperative Game')) return 'Cooperativo';
  if (tiene('Deduction', 'Murder/Mystery')) return 'Deducción';
  if (tiene('Word Game', 'Trivia')) return 'Palabras y trivia';
  if (tiene('Dexterity')) return 'Habilidad';
  if (tiene('Abstract Strategy')) return 'Abstracto';
  // Un juego de cartas pesado (p. ej. Ark Nova, 3.8) es de estrategia; "Cartas" queda para los ligeros.
  if (tiene('Card Game') && (peso == null || peso < 2.8)) return 'Cartas';
  if (tiene('Adventure')) return 'Aventura';
  return peso != null && peso >= 2.5 ? 'Estrategia' : 'Familiar';
}

export function fichaDesdeItem(item: Nodo): Ficha {
  const nombres = lista(item.name);
  const principal = nombres.find((n) => n['@_type'] === 'primary') ?? nombres[0];
  const tipo = String(item['@_type'] ?? 'boardgame');
  const stats = item.statistics?.ratings;
  const peso = numero(stats?.averageweight);
  const rating = numero(stats?.average);
  const ranks = lista(stats?.ranks?.rank);
  const general = ranks.find((r) => r['@_name'] === 'boardgame');
  const rankNum = Number(general?.['@_value']);

  const dmin = numero(item.minplaytime) ?? numero(item.playingtime);
  const dmaxRaw = numero(item.maxplaytime) ?? numero(item.playingtime);
  const categorias = enlaces(item, 'boardgamecategory');
  const mecanicas = enlaces(item, 'boardgamemechanic');
  const desc = item.description ? limpiarTexto(String(item.description)) : '';

  return {
    bgg_id: Number(item['@_id']),
    tipo,
    nombre: String(principal?.['@_value'] ?? ''),
    jugadores_min: numero(item.minplayers),
    jugadores_max: numero(item.maxplayers),
    duracion_min: dmin,
    duracion_max: dmin != null && dmaxRaw != null && dmaxRaw > dmin ? dmaxRaw : null,
    edad_min: numero(item.minage),
    dificultad: peso == null ? null : Math.min(5, Math.max(1, Math.round(peso))),
    categoria: categoriaCadabra(tipo, categorias, mecanicas, peso),
    imagen: item.image ? String(item.image).trim() : null,
    datos: {
      nombre: String(principal?.['@_value'] ?? ''),
      anio: numero(item.yearpublished),
      rating: rating == null ? null : Math.round(rating * 10) / 10,
      votos: numero(stats?.usersrated),
      peso: peso == null ? null : Math.round(peso * 100) / 100,
      ranking: Number.isFinite(rankNum) && rankNum > 0 ? rankNum : null,
      mecanicas,
      categorias,
      disenadores: enlaces(item, 'boardgamedesigner'),
      editoriales: enlaces(item, 'boardgamepublisher').slice(0, 5),
      nombres_alt: nombres.filter((n) => n['@_type'] !== 'primary').map((n) => String(n['@_value'])).slice(0, 12),
      descripcion: desc || null,
      miniatura: item.thumbnail ? String(item.thumbnail).trim() : null,
      videos_total: Number(item.videos?.['@_total'] ?? 0) || 0,
    },
    videos: videosDe(item),
  };
}

export function candidatosDesdeBusqueda(parsed: Nodo): Candidato[] {
  return lista(parsed?.items?.item).map((it) => {
    const nombres = lista(it.name);
    const principal = nombres.find((n) => n['@_type'] === 'primary') ?? nombres[0];
    return {
      id: Number(it['@_id']),
      nombre: String(principal?.['@_value'] ?? ''),
      anio: numero(it.yearpublished),
      tipo: String(it['@_type'] ?? 'boardgame'),
    };
  });
}

// --- Qué se escribe en el juego ---------------------------------------------------------------------------

export interface JuegoBase {
  revisar: boolean;
  portada: string | null;
  jugadores_min: number | null;
  jugadores_max: number | null;
  duracion_min: number | null;
  duracion_max: number | null;
  dificultad: number | null;
  edad_min: number | null;
  categoria: string | null;
}

/**
 * Datos curados se respetan: solo se reemplaza lo vacío, o todo si el juego estaba marcado como estimado.
 * Si BGG aporta todos los datos de juego de un juego estimado, deja de estar "para revisar".
 */
export function cambiosDesdeFicha(j: JuegoBase, f: Ficha): Record<string, unknown> {
  const cambios: Record<string, unknown> = {
    bgg_id: f.bgg_id,
    bgg_tipo: f.tipo,
    bgg_estado: 'ok',
    bgg_candidatos: [],
    bgg_datos: f.datos,
    videos: f.videos,
    bgg_sync: new Date().toISOString(),
  };
  const sobrescribe = j.revisar;
  let faltaDeBgg = false;

  if (f.jugadores_min != null && f.jugadores_max != null) {
    if (sobrescribe || j.jugadores_min == null || j.jugadores_max == null) {
      cambios.jugadores_min = f.jugadores_min;
      cambios.jugadores_max = f.jugadores_max;
    }
  } else faltaDeBgg = true;

  if (f.duracion_min != null) {
    if (sobrescribe || j.duracion_min == null) {
      cambios.duracion_min = f.duracion_min;
      cambios.duracion_max = f.duracion_max;
    }
  } else faltaDeBgg = true;

  if (f.dificultad != null) {
    if (sobrescribe || j.dificultad == null) cambios.dificultad = f.dificultad;
  } else faltaDeBgg = true;

  if (f.edad_min != null) {
    if (sobrescribe || j.edad_min == null) cambios.edad_min = f.edad_min;
  } else faltaDeBgg = true;

  if (f.categoria != null && (sobrescribe || j.categoria == null)) cambios.categoria = f.categoria;

  if (j.portada == null && f.imagen) {
    cambios.portada = f.imagen;
    cambios.portada_origen = 'bgg';
  }
  if (sobrescribe && !faltaDeBgg) cambios.revisar = false;
  return cambios;
}

export type Decision =
  | { estado: 'ok'; id: number }
  | { estado: 'dudoso'; candidatos: Candidato[] }
  | { estado: 'sin_resultado' };

/** Solo se vincula solo si hay un único resultado con el mismo nombre; si no, decide el admin. */
export function decidir(nombre: string, resultados: Candidato[]): Decision {
  if (!resultados.length) return { estado: 'sin_resultado' };
  const n = normalizar(nombre);
  // Un mismo juego puede salir como juego y como expansión: se cuenta una sola vez.
  resultados = resultados.filter((r, i) => resultados.findIndex((x) => x.id === r.id) === i);
  const iguales = resultados.filter((r) => normalizar(r.nombre) === n);
  if (iguales.length === 1) return { estado: 'ok', id: iguales[0].id };
  const base = iguales.length > 1 ? iguales : resultados;
  return { estado: 'dudoso', candidatos: base.slice(0, 6) };
}
