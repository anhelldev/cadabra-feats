// Pruebas de torneos-logica.ts. No necesitan red ni Supabase.
// Uso (desde esta carpeta, con Node 24):  node --experimental-strip-types --no-warnings torneos-logica.test.mjs
import assert from 'node:assert/strict';
const D = new URL('.', import.meta.url).pathname;
const t = await import(D + 'torneos-logica.ts');

// RNG determinista para que las pruebas no dependan del azar
const semilla = (s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

// sortear: misma gente, no modifica la entrada, y de verdad cambia el orden
const base = ids(20);
const mezcla = t.sortear(base, semilla(1));
assert.deepEqual([...mezcla].sort((a, b) => a - b), base);
assert.deepEqual(base, ids(20));
assert.notDeepEqual(mezcla, base);

// armarMesas: tamaños parejos, nadie repetido, ninguna mesa sola ni más grande que lo pedido
for (let n = 2; n <= 40; n++) {
  for (let k = 2; k <= 8; k++) {
    const mesas = t.armarMesas(ids(n), k, semilla(n * 10 + k));
    assert.deepEqual(mesas.flat().sort((a, b) => a - b), ids(n), `n=${n} k=${k}`);
    for (const m of mesas) {
      assert.ok(m.length >= 2, `mesa de 1 con n=${n} k=${k}`);
      assert.ok(m.length <= (k === 2 ? 3 : k), `mesa grande con n=${n} k=${k}`);
    }
    const tam = mesas.map((m) => m.length);
    assert.ok(Math.max(...tam) - Math.min(...tam) <= 1, `mesas dispares con n=${n} k=${k}: ${tam}`);
  }
}
assert.deepEqual(t.armarMesas(ids(9), 4, semilla(3)).map((m) => m.length), [3, 3, 3]);
assert.deepEqual(t.armarMesas(ids(5), 2, semilla(3)).map((m) => m.length), [3, 2]);
assert.throws(() => t.armarMesas([1], 4), /al menos 2/);
assert.throws(() => t.armarMesas(ids(4), 1), /al menos 2/);

// rondas de llave
assert.deepEqual([2, 3, 4, 5, 8, 9, 16, 17].map(t.rondasDeLlave), [1, 2, 2, 3, 3, 4, 4, 5]);

// generarLlave: todos presentes una vez en la primera ronda, byes bien resueltos
for (let n = 2; n <= 33; n++) {
  const llave = t.generarLlave(ids(n), semilla(n));
  const total = t.rondasDeLlave(n);
  const r1 = llave.filter((p) => p.ronda === 1);
  assert.equal(r1.length, 2 ** total / 2);
  assert.equal(llave.length, 2 ** total - 1, `partidas n=${n}`);
  assert.deepEqual(r1.flatMap((p) => p.jugadores.map((j) => j.inscripcion_id)).sort((a, b) => a - b), ids(n), `n=${n}`);
  const byes = r1.filter((p) => p.jugadores.length === 1);
  assert.equal(byes.length, 2 ** total - n, `byes n=${n}`);
  for (const b of byes) {
    assert.equal(b.estado, 'jugada');
    assert.equal(b.jugadores[0].gano, true);
    const sig = llave.find((p) => p.ronda === 2 && p.numero === Math.ceil(b.numero / 2));
    assert.ok(sig.jugadores.some((j) => j.inscripcion_id === b.jugadores[0].inscripcion_id), `el bye avanza n=${n}`);
  }
  for (const p of r1.filter((x) => x.jugadores.length === 2)) assert.equal(p.estado, 'pendiente');
  // nunca un cruce de la primera ronda con dos byes (vacío)
  assert.ok(r1.every((p) => p.jugadores.length >= 1));
}
assert.throws(() => t.generarLlave([1]), /al menos 2/);

// avanzarGanador: recorrer una llave de 6 hasta el campeón
let llave = t.generarLlave(ids(6), semilla(42));
const aplicar = (av) => {
  for (const m of av.marcar) llave.find((p) => p.ronda === m.ronda && p.numero === m.numero).jugadores.find((j) => j.inscripcion_id === m.inscripcion_id).gano = m.gano;
  llave.find((p) => p.ronda === av.marcar[0].ronda && p.numero === av.marcar[0].numero).estado = 'jugada';
  if (av.siguiente) llave.find((p) => p.ronda === av.siguiente.ronda && p.numero === av.siguiente.numero).jugadores.push({ inscripcion_id: av.siguiente.inscripcion_id });
};
let campeon;
for (let r = 1; r <= 3; r++) {
  for (const p of llave.filter((x) => x.ronda === r && x.estado === 'pendiente')) {
    assert.equal(p.jugadores.length, 2, `ronda ${r} cruce ${p.numero} completo`);
    const av = t.avanzarGanador(llave, r, p.numero, p.jugadores[0].inscripcion_id);
    aplicar(av);
    if (av.campeon) campeon = av.campeon;
  }
}
assert.ok(campeon, 'hubo campeón');
const podio = t.podioLlave(llave);
assert.equal(podio.find((p) => p.posicion === 1).inscripcion_id, campeon);
assert.equal(podio.filter((p) => p.posicion === 2).length, 1);
assert.ok(podio.filter((p) => p.posicion === 3).length >= 1);
assert.throws(() => t.avanzarGanador(llave, 1, 1, 999), /no está en el cruce/);
assert.throws(() => t.avanzarGanador(t.generarLlave(ids(4), semilla(1)), 2, 1, 1), /dos jugadores/);
assert.throws(() => t.avanzarGanador(llave, 9, 9, 1), /no existe/);
assert.deepEqual([1, 2, 3, 4, 5].map((r) => t.nombreRonda(r, 5)), ['Ronda 1', 'Octavos de final', 'Cuartos de final', 'Semifinal', 'Final']);

// tablaPuntos: suma, empates comparten posición (1, 2, 2, 4) y los que no jugaron aparecen
const jug = [{ inscripcion_id: 1, nombre: 'Ana' }, { inscripcion_id: 2, nombre: 'Beto' }, { inscripcion_id: 3, nombre: 'Carla' }, { inscripcion_id: 4, nombre: 'Dani' }, { inscripcion_id: 5, nombre: 'Eli' }];
const filas = [
  { inscripcion_id: 1, puntos: 10 }, { inscripcion_id: 1, puntos: 5 },
  { inscripcion_id: 2, puntos: 20 },
  { inscripcion_id: 3, puntos: 8 }, { inscripcion_id: 3, puntos: 7 },
  { inscripcion_id: 4, puntos: 3 }, { inscripcion_id: 5, puntos: null },
];
const tabla = t.tablaPuntos(jug, filas);
assert.deepEqual(tabla.map((x) => [x.nombre, x.puntos, x.posicion]), [['Beto', 20, 1], ['Ana', 15, 2], ['Carla', 15, 2], ['Dani', 3, 4], ['Eli', 0, 4 + 1]]);
assert.deepEqual(t.podioPuntos(tabla).map((x) => x.nombre), ['Beto', 'Ana', 'Carla']);
assert.equal(tabla.find((x) => x.nombre === 'Eli').jugadas, 0);

console.log('torneos-logica: todo bien');
