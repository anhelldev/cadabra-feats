// Funciones puras sobre juegos (sin Angular), compartidas con la edición masiva y sus pruebas en node.
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function aSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const OBLIGATORIOS = {
  jugadores_min: 'jugadores mín.',
  jugadores_max: 'jugadores máx.',
  duracion_min: 'duración',
  dificultad: 'dificultad',
  edad_min: 'edad',
  categoria: 'categoría',
} as const;

/** Datos que un juego debe tener para poder ser visible (la base de datos lo exige con visible_completo). */
export function faltantes(j: Partial<Record<keyof typeof OBLIGATORIOS, unknown>>): string[] {
  return (Object.keys(OBLIGATORIOS) as (keyof typeof OBLIGATORIOS)[])
    .filter((k) => j[k] == null || j[k] === '')
    .map((k) => OBLIGATORIOS[k]);
}
