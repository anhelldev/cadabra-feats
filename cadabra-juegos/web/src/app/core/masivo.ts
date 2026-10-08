// Edición masiva: exportar los juegos a una hoja, leer la hoja editada y calcular qué cambia (sin Angular, para poder probarla con node).
import type { Juego } from './juegos';
import { aSlug, faltantes, normalizar } from './util-juegos.ts';

export type Celda = string | number | boolean | Date | null | undefined;
type Tipo = 'texto' | 'entero' | 'bool' | 'lista' | 'url';

interface Columna {
  clave: string;
  titulo: string;
  tipo: Tipo;
  /** Las columnas de solo lectura sirven de referencia o de control y se ignoran al importar. */
  editable: boolean;
}

export const COLUMNAS: readonly Columna[] = [
  { clave: 'id', titulo: 'ID', tipo: 'entero', editable: false },
  { clave: 'nombre', titulo: 'Nombre', tipo: 'texto', editable: true },
  { clave: 'categoria', titulo: 'Categoría', tipo: 'texto', editable: true },
  { clave: 'jugadores_min', titulo: 'Jugadores mín', tipo: 'entero', editable: true },
  { clave: 'jugadores_max', titulo: 'Jugadores máx', tipo: 'entero', editable: true },
  { clave: 'duracion_min', titulo: 'Duración mín (min)', tipo: 'entero', editable: true },
  { clave: 'duracion_max', titulo: 'Duración máx (min)', tipo: 'entero', editable: true },
  { clave: 'dificultad', titulo: 'Dificultad (1-5)', tipo: 'entero', editable: true },
  { clave: 'edad_min', titulo: 'Edad mín', tipo: 'entero', editable: true },
  { clave: 'descripcion', titulo: 'Descripción', tipo: 'texto', editable: true },
  { clave: 'tips', titulo: 'Consejos (uno por línea)', tipo: 'lista', editable: true },
  { clave: 'portada', titulo: 'Portada (URL)', tipo: 'url', editable: true },
  { clave: 'visible', titulo: 'Visible', tipo: 'bool', editable: true },
  { clave: 'en_local', titulo: 'En el local', tipo: 'bool', editable: true },
  { clave: 'para_llevar', titulo: 'Para solicitar', tipo: 'bool', editable: true },
  { clave: 'revisar', titulo: 'Revisar', tipo: 'bool', editable: true },
  { clave: 'slug', titulo: 'Slug (no editar)', tipo: 'texto', editable: false },
  { clave: 'origen', titulo: 'Origen (no editar)', tipo: 'texto', editable: false },
  { clave: 'bgg_id', titulo: 'BGG id (no editar)', tipo: 'entero', editable: false },
  { clave: 'actualizado', titulo: 'Actualizado (no editar)', tipo: 'texto', editable: false },
];

const POR_TITULO = new Map(COLUMNAS.map((c) => [normalizar(c.titulo), c]));
// También se aceptan los títulos sin el aviso "(no editar)" y la clave técnica, por si alguien reescribe los encabezados.
for (const c of COLUMNAS) {
  POR_TITULO.set(normalizar(c.titulo.replace(/\s*\(no editar\)/, '')), c);
  POR_TITULO.set(normalizar(c.clave), c);
}

export type Datos = Record<string, string | number | boolean | string[] | null>;

const valorDe = (j: Juego, c: Columna): Celda => {
  const v = (j as unknown as Record<string, unknown>)[c.clave];
  if (v == null) return null;
  if (c.tipo === 'bool') return v ? 'Sí' : 'No';
  if (c.tipo === 'lista') return (v as string[]).join('\n') || null;
  return v as string | number;
};

/** Encabezado + una fila por juego, listo para escribir como hoja de Excel. */
export function aFilas(juegos: readonly Juego[]): Celda[][] {
  return [COLUMNAS.map((c) => c.titulo), ...juegos.map((j) => COLUMNAS.map((c) => valorDe(j, c)))];
}

// ---------- Lectura de la hoja ----------

export interface Registro {
  /** Número de fila en la hoja (la 1 es el encabezado). */
  fila: number;
  id: number | null;
  datos: Datos;
  /** Valor de la columna "Actualizado" de la exportación, para detectar cambios hechos mientras se editaba. */
  actualizadoEnArchivo: string | null;
  errores: string[];
}

export interface Lectura {
  registros: Registro[];
  avisos: string[];
}

const SI = new Set(['si', 's', 'x', '1', 'true', 'verdadero', 'yes', 'y']);
const NO = new Set(['no', 'n', '0', 'false', 'falso']);

function convertir(c: Columna, v: Celda): { valor: Datos[string] | undefined; error?: string } {
  const vacia = v == null || (typeof v === 'string' && v.trim() === '');
  if (c.tipo === 'bool') {
    if (vacia) return { valor: undefined }; // una casilla en blanco no cambia nada: evita apagar cosas por accidente
    if (typeof v === 'boolean') return { valor: v };
    const t = normalizar(String(v).trim());
    if (SI.has(t)) return { valor: true };
    if (NO.has(t)) return { valor: false };
    return { valor: undefined, error: `${c.titulo}: escribe Sí o No (y no «${String(v)}»).` };
  }
  if (vacia) return { valor: c.tipo === 'lista' ? [] : null };
  if (c.tipo === 'entero') {
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { valor: undefined, error: `${c.titulo}: debe ser un número entero (y no «${String(v)}»).` };
    return { valor: n };
  }
  const texto = String(v).trim();
  if (c.tipo === 'lista') return { valor: texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) };
  if (c.tipo === 'url' && !/^https?:\/\/\S+$/.test(texto)) return { valor: undefined, error: `${c.titulo}: debe ser un enlace que empiece con http:// o https://.` };
  return { valor: texto };
}

/** Convierte las filas de la hoja en registros. Las columnas que falten no se tocan; las desconocidas se avisan y se ignoran. */
export function leerHoja(filas: readonly (readonly Celda[])[]): Lectura {
  const avisos: string[] = [];
  if (!filas.length) throw new Error('El archivo está vacío.');
  const encabezado = filas[0].map((t) => (t == null ? '' : normalizar(String(t).trim())));
  const columnas = encabezado.map((t) => (t ? POR_TITULO.get(t) : undefined));
  if (!columnas.some((c) => c?.clave === 'id')) throw new Error('No encuentro la columna «ID». Usa el archivo que descargaste con «Exportar» (puedes dejar el ID vacío en los juegos nuevos).');
  if (!columnas.some((c) => c?.clave === 'nombre')) throw new Error('No encuentro la columna «Nombre».');
  filas[0].forEach((t, i) => {
    if (t != null && String(t).trim() && !columnas[i]) avisos.push(`La columna «${String(t).trim()}» no se reconoce y se ignora.`);
  });

  const registros: Registro[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = filas[i];
    if (celdas.every((v) => v == null || String(v).trim() === '')) continue;
    const r: Registro = { fila: i + 1, id: null, datos: {}, actualizadoEnArchivo: null, errores: [] };
    columnas.forEach((c, k) => {
      if (!c) return;
      const v = celdas[k];
      if (c.clave === 'id') {
        const { valor, error } = convertir(c, v);
        if (error) r.errores.push(error);
        else r.id = typeof valor === 'number' ? valor : null;
      } else if (c.clave === 'actualizado') {
        r.actualizadoEnArchivo = v == null || String(v).trim() === '' ? null : v instanceof Date ? v.toISOString() : String(v).trim();
      } else if (c.editable) {
        const { valor, error } = convertir(c, v);
        if (error) r.errores.push(error);
        else if (valor !== undefined) r.datos[c.clave] = valor;
      }
    });
    registros.push(r);
  }
  return { registros, avisos };
}

// ---------- Plan de cambios ----------

export interface Cambio {
  clave: string;
  titulo: string;
  antes: string;
  despues: string;
}

export type Accion = 'actualizar' | 'crear' | 'sin-cambios' | 'error' | 'obsoleta';

export interface FilaPlan {
  fila: number;
  id: number | null;
  nombre: string;
  accion: Accion;
  cambios: Cambio[];
  /** Valores listos para guardar (para «crear», incluye slug y origen). */
  datos: Datos;
  errores: string[];
}

export interface Plan {
  filas: FilaPlan[];
  cuentas: Record<Accion, number>;
}

const TITULO = new Map(COLUMNAS.map((c) => [c.clave, c.titulo.replace(/\s*\(no editar\)/, '')]));
const texto = (v: unknown, tipo: Tipo): string => (v == null || v === '' ? '' : tipo === 'bool' ? (v ? 'Sí' : 'No') : Array.isArray(v) ? v.join(' | ') : String(v));
const TIPO = new Map(COLUMNAS.map((c) => [c.clave, c.tipo]));
const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (Array.isArray(a) && !a.length && b == null) || (Array.isArray(b) && !b.length && a == null);

/** Revisa que el juego resultante cumpla las reglas de la base de datos; devuelve los problemas en español. */
function validar(j: Record<string, unknown>, categorias: readonly string[]): string[] {
  const e: string[] = [];
  const n = (k: string) => j[k] as number | null;
  if (typeof j['nombre'] !== 'string' || (j['nombre'] as string).trim().length < 2) e.push('Nombre: escribe al menos 2 letras.');
  if (j['categoria'] != null && !categorias.includes(j['categoria'] as string)) e.push(`Categoría: «${j['categoria']}» no existe. Las válidas son: ${categorias.join(', ')}.`);
  if (n('jugadores_min') != null && n('jugadores_min')! < 1) e.push('Jugadores mín: debe ser 1 o más.');
  if (n('jugadores_min') != null && n('jugadores_max') != null && n('jugadores_max')! < n('jugadores_min')!) e.push('Jugadores máx: no puede ser menor que el mínimo.');
  if (n('duracion_min') != null && n('duracion_min')! < 1) e.push('Duración mín: debe ser 1 o más.');
  if (n('duracion_min') != null && n('duracion_max') != null && n('duracion_max')! < n('duracion_min')!) e.push('Duración máx: no puede ser menor que el mínimo.');
  if (n('dificultad') != null && (n('dificultad')! < 1 || n('dificultad')! > 5)) e.push('Dificultad: debe estar entre 1 y 5.');
  if (n('edad_min') != null && n('edad_min')! < 0) e.push('Edad mín: no puede ser negativa.');
  if (j['en_local'] && j['para_llevar']) e.push('No puede estar «En el local» y «Para solicitar» a la vez.');
  if (j['visible']) {
    const f = faltantes(j as Parameters<typeof faltantes>[0]);
    if (f.length) e.push(`Visible: para mostrarlo falta ${f.join(', ')}.`);
  }
  return e;
}

export interface Opciones {
  categorias: readonly string[];
  /** Aplicar también las filas de juegos que cambiaron después de exportar el archivo. */
  sobrescribir?: boolean;
}

export function planificar(registros: readonly Registro[], actuales: readonly Juego[], opciones: Opciones): Plan {
  const porId = new Map(actuales.map((j) => [j.id, j]));
  const slugs = new Set(actuales.map((j) => j.slug));
  const categoriasPorClave = new Map(opciones.categorias.map((c) => [normalizar(c), c]));
  const vistos = new Set<number>();
  const filas: FilaPlan[] = [];

  for (const r of registros) {
    const datos: Datos = { ...r.datos };
    const errores = [...r.errores];
    // «Categoría» sin importar mayúsculas ni acentos: se guarda con el nombre exacto.
    if (typeof datos['categoria'] === 'string') datos['categoria'] = categoriasPorClave.get(normalizar(datos['categoria'])) ?? datos['categoria'];

    const actual = r.id == null ? undefined : porId.get(r.id);
    if (r.id != null && !actual) errores.push(`El ID ${r.id} no existe en el catálogo. Déjalo vacío si es un juego nuevo.`);
    if (r.id != null && vistos.has(r.id)) errores.push(`El ID ${r.id} aparece más de una vez en el archivo.`);
    if (r.id != null) vistos.add(r.id);

    if (actual) {
      const cambios: Cambio[] = Object.entries(datos)
        .filter(([k, v]) => !igual((actual as unknown as Record<string, unknown>)[k], v))
        .map(([k, v]) => ({ clave: k, titulo: TITULO.get(k) ?? k, antes: texto((actual as unknown as Record<string, unknown>)[k], TIPO.get(k)!), despues: texto(v, TIPO.get(k)!) }));
      const resultante = { ...(actual as unknown as Record<string, unknown>), ...Object.fromEntries(cambios.map((c) => [c.clave, datos[c.clave]])) };
      if (cambios.length) errores.push(...validar(resultante, opciones.categorias));
      const obsoleta = !!r.actualizadoEnArchivo && Date.parse(actual.actualizado) > Date.parse(r.actualizadoEnArchivo) + 1000;
      const accion: Accion = errores.length ? 'error' : !cambios.length ? 'sin-cambios' : obsoleta && !opciones.sobrescribir ? 'obsoleta' : 'actualizar';
      filas.push({ fila: r.fila, id: actual.id, nombre: actual.nombre, accion, cambios, datos: Object.fromEntries(cambios.map((c) => [c.clave, datos[c.clave]])), errores });
      continue;
    }

    if (r.id == null) {
      const nuevo: Record<string, unknown> = { visible: false, en_local: false, para_llevar: false, revisar: false, tips: [], ...datos };
      errores.push(...validar(nuevo, opciones.categorias));
      let slug = aSlug(String(nuevo['nombre'] ?? ''));
      if (!slug) slug = 'juego';
      const base = slug;
      for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`;
      slugs.add(slug);
      const cambios: Cambio[] = Object.entries(datos).map(([k, v]) => ({ clave: k, titulo: TITULO.get(k) ?? k, antes: '', despues: texto(v, TIPO.get(k)!) }));
      filas.push({
        fila: r.fila, id: null, nombre: String(nuevo['nombre'] ?? '(sin nombre)'), accion: errores.length ? 'error' : 'crear', cambios, errores,
        datos: errores.length ? datos : { ...nuevo, slug, origen: 'catalogo' } as Datos,
      });
      continue;
    }
    filas.push({ fila: r.fila, id: r.id, nombre: String(datos['nombre'] ?? `ID ${r.id}`), accion: 'error', cambios: [], datos, errores });
  }

  const cuentas: Record<Accion, number> = { actualizar: 0, crear: 0, 'sin-cambios': 0, error: 0, obsoleta: 0 };
  for (const f of filas) cuentas[f.accion]++;
  return { filas, cuentas };
}
