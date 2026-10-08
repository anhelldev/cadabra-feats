// Pruebas de masivo.ts (edición masiva). No necesitan red ni Supabase.
// Uso (desde esta carpeta, con Node 24):  node --experimental-strip-types --no-warnings masivo.test.mjs
import assert from 'node:assert/strict';
const D = new URL('.', import.meta.url).pathname;
const m = await import(D + 'masivo.ts');

const CATS = ['Estrategia', 'Familiar', 'Party'];
const juego = (id, extra = {}) => ({
  id, slug: `juego-${id}`, nombre: `Juego ${id}`, jugadores_min: 2, jugadores_max: 4, duracion_min: 30, duracion_max: 60, dificultad: 3,
  edad_min: 10, categoria: 'Estrategia', descripcion: `Descripción ${id}`, descripcion_tienda: null, tips: ['uno', 'dos'], portada: 'https://x.test/a.webp',
  tienda_id: null, url_tienda: null, origen: 'catalogo', revisar: false, visible: true, en_local: false, para_llevar: false, bgg_id: null,
  actualizado: '2026-10-01T12:00:00.000Z', ...extra,
});
const actuales = [juego(1), juego(2, { en_local: true }), juego(3, { visible: false, jugadores_min: null, categoria: null })];
const hoja = () => m.aFilas(actuales).map((f) => [...f]);
const plan = (filas, op = {}) => m.planificar(m.leerHoja(filas).registros, actuales, { categorias: CATS, ...op });
const col = (nombre) => m.COLUMNAS.findIndex((c) => c.titulo.startsWith(nombre));

// Exportación: encabezado + una fila por juego, booleanos y listas legibles
const filas = hoja();
assert.equal(filas.length, 4);
assert.equal(filas[0][0], 'ID');
assert.equal(filas[2][col('En el local')], 'Sí');
assert.equal(filas[1][col('En el local')], 'No');
assert.equal(filas[1][col('Consejos')], 'uno\ndos');
assert.equal(filas[3][col('Jugadores mín')], null);

// Sin tocar nada no cambia nada
let p = plan(hoja());
assert.deepEqual(p.cuentas, { actualizar: 0, crear: 0, 'sin-cambios': 3, error: 0, obsoleta: 0 });

// Editar: nombre, descripción, consejos, booleano en texto, entero con coma
let f = hoja();
f[1][col('Nombre')] = 'Catan Edición Nueva';
f[1][col('Descripción')] = 'Línea 1\nLínea 2';
f[1][col('Consejos')] = 'a\r\n\r\n b ';
f[1][col('Revisar')] = 'sí';
f[1][col('Dificultad')] = '4,0';
p = plan(f);
assert.equal(p.cuentas.actualizar, 1);
const fila1 = p.filas[0];
assert.deepEqual(fila1.cambios.map((c) => c.clave).sort(), ['descripcion', 'dificultad', 'nombre', 'revisar', 'tips']);
assert.deepEqual(fila1.datos.tips, ['a', 'b']);
assert.equal(fila1.datos.dificultad, 4);
assert.equal(fila1.datos.revisar, true);
assert.equal(fila1.cambios.find((c) => c.clave === 'nombre').antes, 'Juego 1');

// Casilla booleana en blanco: no cambia; columna que falta: no cambia; columna desconocida: aviso
f = hoja();
f[2][col('En el local')] = '';
f[1][col('Visible')] = null;
let lec = m.leerHoja(f);
assert.equal(plan(f).cuentas['sin-cambios'], 3);
const sinCol = f.map((r) => r.filter((_, i) => i !== col('Edad mín')));
sinCol[0].push('Color favorito');
lec = m.leerHoja(sinCol);
assert.ok(lec.avisos.some((a) => a.includes('Color favorito')));
assert.equal(plan(sinCol).cuentas['sin-cambios'], 3);

// Vaciar un campo opcional sí es un cambio (y se muestra)
f = hoja();
f[1][col('Descripción')] = '';
p = plan(f);
assert.equal(p.filas[0].cambios[0].despues, '');
assert.equal(p.filas[0].datos.descripcion, null);

// Errores de validación, todos en español y por fila
f = hoja();
f[1][col('Dificultad')] = 9;
f[2][col('Categoría')] = 'estratEgia'; // se normaliza, no es error
f[2][col('Nombre')] = 'Otro';
f[3][col('Categoría')] = 'Inventada';
f[3][col('Visible')] = 'sí'; // faltan datos
p = plan(f);
assert.equal(p.filas[0].accion, 'error');
assert.ok(p.filas[0].errores[0].includes('entre 1 y 5'));
assert.equal(p.filas[1].accion, 'actualizar');
assert.equal(p.filas[1].datos.categoria ?? 'Estrategia', 'Estrategia');
assert.equal(p.filas[2].accion, 'error');
assert.ok(p.filas[2].errores.some((e) => e.includes('Inventada')));
assert.ok(p.filas[2].errores.some((e) => e.includes('falta')));

f = hoja();
f[1][col('Jugadores máx')] = 1; // menor que el mínimo
f[2][col('Para solicitar')] = 'Sí'; // ya está en el local
p = plan(f);
assert.ok(p.filas[0].errores.some((e) => e.includes('menor que el mínimo')));
assert.ok(p.filas[1].errores.some((e) => e.includes('a la vez')));

f = hoja();
f[1][col('Edad mín')] = 'diez';
f[2][col('Portada')] = 'no-es-url';
p = plan(f);
assert.ok(p.filas[0].errores[0].includes('entero'));
assert.ok(p.filas[1].errores[0].includes('http'));

// IDs raros: inexistente y repetido
f = hoja();
f[1][col('ID')] = 999;
f.push([...f[2]]);
p = plan(f);
assert.ok(p.filas[0].errores[0].includes('no existe'));
assert.ok(p.filas[3].errores.some((e) => e.includes('más de una vez')));

// Cambios hechos mientras se editaba: se apartan salvo que se pida sobrescribir
f = hoja();
f[1][col('Nombre')] = 'Nuevo nombre';
f[1][col('Actualizado')] = '2026-09-30T00:00:00.000Z'; // exportado antes de la última edición (2026-10-01)
p = plan(f);
assert.equal(p.filas[0].accion, 'obsoleta');
assert.equal(plan(f, { sobrescribir: true }).filas[0].accion, 'actualizar');
f[1][col('Actualizado')] = new Date('2026-10-01T12:00:00.000Z'); // Excel puede devolver fechas
assert.equal(plan(f).filas[0].accion, 'actualizar');

// Juegos nuevos: sin ID, slug único (contra la base y entre ellos), ocultos por defecto
f = hoja();
const nueva = (nombre, extra = {}) => { const r = new Array(f[0].length).fill(null); r[col('Nombre')] = nombre; Object.entries(extra).forEach(([k, v]) => (r[col(k)] = v)); return r; };
f.push(nueva('Juego 1'), nueva('Juego 1'), nueva('Árbol Mágico', { Categoría: 'Familiar', 'Jugadores mín': 2, 'Jugadores máx': 5, 'Duración mín (min)': 20, 'Dificultad (1-5)': 2, 'Edad mín': 8, Visible: 'Sí' }));
p = plan(f);
const nuevas = p.filas.filter((x) => x.id == null);
assert.deepEqual(nuevas.map((x) => x.accion), ['crear', 'crear', 'crear']);
assert.deepEqual(nuevas.map((x) => x.datos.slug), ['juego-1-2', 'juego-1-3', 'arbol-magico']);
assert.equal(nuevas[0].datos.visible, false);
assert.equal(nuevas[0].datos.origen, 'catalogo');
assert.equal(nuevas[2].datos.visible, true); // completo, así que puede ser visible
f.push(nueva('', { Categoría: 'Party' }));
assert.equal(plan(f).filas.at(-1).accion, 'error');
f.push(nueva('Sin datos', { Visible: 'Sí' }));
assert.ok(plan(f).filas.at(-1).errores.some((e) => e.includes('falta')));

// Archivo que no es el exportado
assert.throws(() => m.leerHoja([['Nombre', 'Otra']]), /ID/);
assert.throws(() => m.leerHoja([['ID', 'Otra']]), /Nombre/);
assert.throws(() => m.leerHoja([]), /vacío/);
// Filas totalmente vacías se saltan
f = hoja();
f.push(new Array(f[0].length).fill(null), ['', '', '']);
assert.equal(m.leerHoja(f).registros.length, 3);
// Encabezados reescritos a mano siguen valiendo
const manual = [['id', 'nombre', 'Dificultad (1-5)'], [1, 'Juego 1', 5]];
assert.deepEqual(m.planificar(m.leerHoja(manual).registros, actuales, { categorias: CATS }).filas[0].cambios.map((c) => c.clave), ['dificultad']);

console.log('masivo: todo bien');
