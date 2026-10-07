import { signal } from '@angular/core';

export interface GrupoDuplicados {
  /** Ids ordenados unidos por coma: identifica al grupo para poder descartarlo. */
  clave: string;
  ids: number[];
  motivo: 'mismo' | 'parecido';
}

/**
 * Palabras que no distinguen un juego de otro. "cartas" y "expansion" no están: "Camel Up" y "Camel Up Juego Cartas",
 * o un juego y su expansión, son productos distintos.
 */
const RUIDO = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'the', 'a', 'y', 'and', 'of', 'juego', 'game', 'base', 'original',
  'edicion', 'edition', 'espanol', 'spanish', 'ingles', 'english', 'version',
]);

/** Nombre reducido a lo esencial: sin acentos, signos, artículos, idiomas ni plurales, y sin espacios. */
export function claveNombre(nombre: string): string {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !RUIDO.has(p))
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p));
  return palabras.join('');
}

/** ¿Difieren en una sola letra (cambiada, añadida o quitada) y esa letra no es un número? */
export function unaLetraDeDiferencia(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < corto.length && corto[i] === largo[i]) i++;
  const distinto = (x: string) => /\d/.test(x);
  if (corto.length === largo.length) {
    return corto.slice(i + 1) === largo.slice(i + 1) && !distinto(corto[i]) && !distinto(largo[i]);
  }
  return corto.slice(i) === largo.slice(i + 1) && !distinto(largo[i]);
}

export function detectarDuplicados(juegos: readonly { id: number; nombre: string }[]): GrupoDuplicados[] {
  const claves = juegos.map((j) => ({ id: j.id, clave: claveNombre(j.nombre) })).filter((j) => j.clave);
  const padre = new Map<number, number>(claves.map((j) => [j.id, j.id]));
  const raiz = (x: number): number => {
    while (padre.get(x) !== x) {
      padre.set(x, padre.get(padre.get(x)!)!);
      x = padre.get(x)!;
    }
    return x;
  };
  const unir = (a: number, b: number) => padre.set(raiz(a), raiz(b));
  const aproximados = new Set<number>();

  const porClave = new Map<string, number[]>();
  for (const j of claves) porClave.set(j.clave, [...(porClave.get(j.clave) ?? []), j.id]);
  for (const ids of porClave.values()) for (const id of ids.slice(1)) unir(ids[0], id);

  // Errores de tipeo: claves distintas de 7+ letras con una sola letra de diferencia (por longitud, para no comparar todo con todo).
  const largas = [...porClave.keys()].filter((c) => c.length >= 7);
  const porLongitud = new Map<number, string[]>();
  for (const c of largas) porLongitud.set(c.length, [...(porLongitud.get(c.length) ?? []), c]);
  for (const c of largas) {
    for (const otra of [...(porLongitud.get(c.length) ?? []), ...(porLongitud.get(c.length + 1) ?? [])]) {
      if (otra === c || !unaLetraDeDiferencia(c, otra)) continue;
      const a = porClave.get(c)![0], b = porClave.get(otra)![0];
      unir(a, b);
      aproximados.add(raiz(a));
    }
  }

  const grupos = new Map<number, number[]>();
  for (const { id } of claves) grupos.set(raiz(id), [...(grupos.get(raiz(id)) ?? []), id]);
  const aproxFinal = new Set([...aproximados].map(raiz));
  return [...grupos.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([r, ids]) => {
      const ordenados = [...ids].sort((x, y) => x - y);
      return { clave: ordenados.join(','), ids: ordenados, motivo: aproxFinal.has(r) ? ('parecido' as const) : ('mismo' as const) };
    })
    .sort((x, y) => x.ids[0] - y.ids[0]);
}

const LLAVE = 'cadabra-duplicados-descartados';

function leer(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LLAVE) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** Grupos que el admin marcó como "no son duplicados". Se guardan en este navegador. */
export const descartados = signal(leer());

export function descartarGrupo(clave: string) {
  const nuevo = new Set(descartados()).add(clave);
  descartados.set(nuevo);
  try {
    localStorage.setItem(LLAVE, JSON.stringify([...nuevo]));
  } catch {
    // Sin almacenamiento el descarte dura lo que dure la pestaña.
  }
}
