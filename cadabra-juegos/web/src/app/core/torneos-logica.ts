// Lógica pura de los torneos (sin Angular ni Supabase) para poder probarla con node. Solo sintaxis "borrable" de TypeScript.
export type Rng = () => number;

export interface JugadorLlave {
  inscripcion_id: number;
  gano?: boolean | null;
}
export interface PartidaLlave {
  ronda: number;
  numero: number;
  estado: 'pendiente' | 'jugada';
  jugadores: JugadorLlave[];
}

/** Baraja con Fisher-Yates; no modifica el arreglo recibido. */
export function sortear<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reparte a los jugadores en mesas de tamaño parejo: ninguna pasa de `tamano` ni queda con un solo jugador. Con mesas de 2 y un
 * número impar de jugadores, una mesa queda de 3.
 */
export function armarMesas<T>(jugadores: readonly T[], tamano: number, rng: Rng = Math.random): T[][] {
  const n = jugadores.length;
  if (n < 2) throw new Error('Hacen falta al menos 2 jugadores.');
  if (!Number.isInteger(tamano) || tamano < 2) throw new Error('Las mesas necesitan al menos 2 jugadores.');
  let mesas = Math.ceil(n / tamano);
  if (Math.floor(n / mesas) < 2) mesas = Math.floor(n / 2);
  const base = Math.floor(n / mesas);
  const extra = n % mesas;
  const mezclados = sortear(jugadores, rng);
  const resultado: T[][] = [];
  let desde = 0;
  for (let m = 0; m < mesas; m++) {
    const cuantos = base + (m < extra ? 1 : 0);
    resultado.push(mezclados.slice(desde, desde + cuantos));
    desde += cuantos;
  }
  return resultado;
}

/** Cuántas rondas tiene una llave de eliminación directa para `jugadores` participantes. */
export const rondasDeLlave = (jugadores: number): number => Math.max(1, Math.ceil(Math.log2(jugadores)));

/**
 * Llave de eliminación directa con sorteo. Si los jugadores no son potencia de 2, los que sobran de espacio pasan directo
 * (bye): su partida de primera ronda queda jugada y ellos ya aparecen en la segunda. La partida (ronda, n) alimenta a la
 * (ronda + 1, ceil(n / 2)).
 */
export function generarLlave(jugadores: readonly number[], rng: Rng = Math.random): PartidaLlave[] {
  const n = jugadores.length;
  if (n < 2) throw new Error('Hacen falta al menos 2 jugadores.');
  const rondas = rondasDeLlave(n);
  const tamano = 2 ** rondas;
  const cruces = tamano / 2;
  const mezclados = sortear(jugadores, rng);

  const partidas: PartidaLlave[] = [];
  for (let r = 1; r <= rondas; r++) {
    const cuantas = tamano / 2 ** r;
    for (let numero = 1; numero <= cuantas; numero++) partidas.push({ ronda: r, numero, estado: 'pendiente', jugadores: [] });
  }
  const buscar = (ronda: number, numero: number) => partidas.find((p) => p.ronda === ronda && p.numero === numero)!;

  for (let numero = 1; numero <= cruces; numero++) {
    const partida = buscar(1, numero);
    partida.jugadores.push({ inscripcion_id: mezclados[numero - 1] });
    const rival = mezclados[cruces + numero - 1];
    if (rival !== undefined) {
      partida.jugadores.push({ inscripcion_id: rival });
    } else {
      partida.estado = 'jugada';
      partida.jugadores[0].gano = true;
      buscar(2, Math.ceil(numero / 2)).jugadores.push({ inscripcion_id: partida.jugadores[0].inscripcion_id });
    }
  }
  return partidas;
}

export interface AvanceLlave {
  /** El ganador queda marcado en su partida y el perdedor también. */
  marcar: { ronda: number; numero: number; inscripcion_id: number; gano: boolean }[];
  /** Partida a la que pasa el ganador; ausente si fue la final. */
  siguiente?: { ronda: number; numero: number; inscripcion_id: number };
  campeon?: number;
}

/** Qué cambia cuando se declara ganador de un cruce. No modifica la llave recibida. */
export function avanzarGanador(llave: readonly PartidaLlave[], ronda: number, numero: number, ganador: number): AvanceLlave {
  const partida = llave.find((p) => p.ronda === ronda && p.numero === numero);
  if (!partida) throw new Error('Ese cruce no existe.');
  if (partida.jugadores.length !== 2) throw new Error('El cruce todavía no tiene a sus dos jugadores.');
  if (!partida.jugadores.some((j) => j.inscripcion_id === ganador)) throw new Error('Ese jugador no está en el cruce.');
  const total = Math.max(...llave.map((p) => p.ronda));
  const marcar = partida.jugadores.map((j) => ({ ronda, numero, inscripcion_id: j.inscripcion_id, gano: j.inscripcion_id === ganador }));
  if (ronda >= total) return { marcar, campeon: ganador };
  return { marcar, siguiente: { ronda: ronda + 1, numero: Math.ceil(numero / 2), inscripcion_id: ganador } };
}

export const nombreRonda = (ronda: number, total: number): string =>
  total - ronda === 0 ? 'Final' : total - ronda === 1 ? 'Semifinal' : total - ronda === 2 ? 'Cuartos de final' : total - ronda === 3 ? 'Octavos de final' : `Ronda ${ronda}`;

export interface PosicionTabla {
  inscripcion_id: number;
  nombre: string;
  puntos: number;
  /** Mesas con puntos ya anotados. */
  jugadas: number;
  /** 1, 2, 2, 4…: los empates comparten posición. */
  posicion: number;
}

/** Tabla de posiciones por puntos acumulados; entran todos los inscritos aunque no hayan jugado todavía. */
export function tablaPuntos(
  jugadores: readonly { inscripcion_id: number; nombre: string }[],
  filas: readonly { inscripcion_id: number; puntos: number | null }[],
): PosicionTabla[] {
  const por = new Map<number, { puntos: number; jugadas: number }>();
  for (const f of filas) {
    if (f.puntos == null) continue;
    const acc = por.get(f.inscripcion_id) ?? { puntos: 0, jugadas: 0 };
    acc.puntos += Number(f.puntos);
    acc.jugadas++;
    por.set(f.inscripcion_id, acc);
  }
  const orden = jugadores
    .map((j) => ({ ...j, puntos: por.get(j.inscripcion_id)?.puntos ?? 0, jugadas: por.get(j.inscripcion_id)?.jugadas ?? 0 }))
    .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'));
  return orden.map((j, i) => ({ ...j, posicion: i > 0 && orden[i - 1].puntos === j.puntos ? 0 : i + 1 })).map((j, i, arr) => {
    if (j.posicion) return j;
    let k = i;
    while (!arr[k].posicion) k--;
    return { ...j, posicion: arr[k].posicion };
  });
}

/** Podio de un torneo por puntuación: posiciones 1 a 3 (con empates puede haber más de tres personas). */
export const podioPuntos = (tabla: readonly PosicionTabla[]): PosicionTabla[] => tabla.filter((p) => p.posicion <= 3 && p.jugadas > 0);

export interface PuestoPodio {
  inscripcion_id: number;
  /** 1 campeón, 2 finalista, 3 semifinalistas. */
  posicion: number;
}

/** Podio de una llave terminada: campeón, finalista y los perdedores de semifinales (tercer lugar compartido). */
export function podioLlave(llave: readonly PartidaLlave[]): PuestoPodio[] {
  const total = Math.max(...llave.map((p) => p.ronda));
  const final = llave.find((p) => p.ronda === total);
  const campeon = final?.jugadores.find((j) => j.gano === true);
  if (!final || !campeon) return [];
  const podio: PuestoPodio[] = [{ inscripcion_id: campeon.inscripcion_id, posicion: 1 }];
  const finalista = final.jugadores.find((j) => j.gano === false);
  if (finalista) podio.push({ inscripcion_id: finalista.inscripcion_id, posicion: 2 });
  if (total >= 2) {
    for (const p of llave.filter((x) => x.ronda === total - 1)) {
      for (const j of p.jugadores) if (j.gano === false) podio.push({ inscripcion_id: j.inscripcion_id, posicion: 3 });
    }
  }
  return podio;
}
