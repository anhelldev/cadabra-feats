// Prueba de mapeo.ts con respuestas XML de ejemplo (fixtures/). No necesita red ni Supabase.
// Uso (desde esta carpeta):  npm i --no-save fast-xml-parser@4 && node --experimental-strip-types --no-warnings mapeo.test.mjs
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const D = new URL('.', import.meta.url).pathname;
const m = await import(D + 'mapeo.ts');
const p = new XMLParser({ ...m.OPCIONES_XML, isArray: (n) => ['item','name','link','video','rank'].includes(n) });
const lee = (f) => p.parse(readFileSync(D + 'fixtures/' + f, 'utf8'));

const catan = m.fichaDesdeItem(lee('thing-catan.xml').items.item[0]);
assert.equal(catan.bgg_id, 13); assert.equal(catan.nombre, 'CATAN'); assert.equal(catan.tipo, 'boardgame');
assert.deepEqual([catan.jugadores_min, catan.jugadores_max, catan.duracion_min, catan.duracion_max, catan.edad_min], [3,4,60,120,10]);
assert.equal(catan.dificultad, 2); assert.equal(catan.categoria, 'Familiar');
assert.equal(catan.datos.rating, 7.1); assert.equal(catan.datos.ranking, 450); assert.equal(catan.datos.anio, 1995);
assert.deepEqual(catan.datos.disenadores, ['Klaus Teuber']);
assert.equal(catan.datos.nombres_alt.length, 2);
assert.match(catan.datos.descripcion, /^In CATAN \(formerly/); assert.ok(catan.datos.descripcion.includes('—')); assert.ok(!catan.datos.descripcion.includes('&'));
assert.equal(catan.videos.length, 2, 'descarta el enlace no http'); assert.equal(catan.videos[0].idioma, 'Spanish', 'español primero'); assert.equal(catan.videos[0].url, 'https://www.youtube.com/watch?v=aaa');
assert.equal(m.fichaDesdeItem({'@_type':'boardgame','@_id':'1',name:[{'@_type':'primary','@_value':'X'}],videos:{'@_total':'2',video:[{'@_id':'1','@_title':'a','@_category':'review','@_language':'German','@_link':'http://www.youtube.com/watch?v=g'},{'@_id':'2','@_title':'b','@_category':'review','@_language':'English','@_link':'http://youtu.be/e'}]}}).videos.map(v=>v.url).join(' '), 'https://youtu.be/e https://www.youtube.com/watch?v=g', 'inglés antes que alemán; youtube a https');
assert.equal(catan.datos.videos_total, 3);

const exp = m.fichaDesdeItem(lee('thing-expansion-sinstats.xml').items.item[0]);
assert.equal(exp.categoria, 'Expansión'); assert.equal(exp.duracion_min, null); assert.equal(exp.edad_min, null); assert.equal(exp.dificultad, null);
assert.deepEqual(exp.videos, []);

const base = { revisar: false, portada: null, jugadores_min: null, jugadores_max: null, duracion_min: null, duracion_max: null, dificultad: null, edad_min: null, categoria: null };
// juego curado: no se pisa lo que ya tiene
const c1 = m.cambiosDesdeFicha({ ...base, jugadores_min: 2, jugadores_max: 5, duracion_min: 30, dificultad: 4, edad_min: 12, categoria: 'Cartas', portada: 'x.jpg' }, catan);
assert.equal(c1.jugadores_min, undefined); assert.equal(c1.duracion_min, undefined); assert.equal(c1.categoria, undefined); assert.equal(c1.portada, undefined);
assert.equal(c1.bgg_id, 13); assert.equal(c1.revisar, undefined); assert.equal(c1.videos.length, 2);
// estimado: BGG reemplaza y deja de estar para revisar; completa portada
const c2 = m.cambiosDesdeFicha({ ...base, revisar: true, jugadores_min: 2, jugadores_max: 5, duracion_min: 30, dificultad: 4, edad_min: 12, categoria: 'Cartas' }, catan);
assert.deepEqual([c2.jugadores_min, c2.jugadores_max, c2.duracion_min, c2.duracion_max, c2.dificultad, c2.edad_min, c2.categoria], [3,4,60,120,2,10,'Familiar']);
assert.equal(c2.revisar, false); assert.equal(c2.portada, catan.imagen); assert.equal(c2.portada_origen, 'bgg');
// estimado pero BGG sin datos: sigue para revisar y conserva lo que había
const c3 = m.cambiosDesdeFicha({ ...base, revisar: true, jugadores_min: 2, jugadores_max: 5, duracion_min: 30, dificultad: 4, edad_min: 12 }, exp);
assert.equal(c3.revisar, undefined); assert.equal(c3.duracion_min, undefined); assert.equal(c3.dificultad, undefined); assert.equal(c3.categoria, 'Expansión');

// categorías
assert.equal(m.categoriaCadabra('boardgame', ["Children's Game"], [], 1), 'Infantil');
assert.equal(m.categoriaCadabra('boardgame', ['Card Game'], ['Cooperative Game'], 2), 'Cooperativo');
assert.equal(m.categoriaCadabra('boardgame', ['Wargame'], [], 3.4), 'Estrategia');
assert.equal(m.categoriaCadabra('boardgame', ['Card Game', 'Animals'], [], 3.8), 'Estrategia', 'Ark Nova no es Cartas');
assert.equal(m.categoriaCadabra('boardgame', ['Card Game'], [], 1.5), 'Cartas');
assert.equal(m.categoriaCadabra('boardgame', ['Card Game'], [], null), 'Cartas');
assert.equal(m.categoriaCadabra('boardgameaccessory', [], [], null), null);

// búsqueda y decisión
const cands = m.candidatosDesdeBusqueda(lee('search-catan.xml'));
assert.equal(cands.length, 3); assert.equal(cands[1].nombre, 'Catan: Cities & Knights'); assert.equal(cands[2].tipo, 'boardgameexpansion');
assert.deepEqual(m.decidir('Catan', cands), { estado: 'ok', id: 13 });
assert.equal(m.decidir('Catan Juego', cands).estado, 'dudoso');
assert.equal(m.decidir('Catan: Cities and Knights', cands).estado, 'ok');
assert.deepEqual(m.decidir('x', m.candidatosDesdeBusqueda(lee('search-vacio.xml'))), { estado: 'sin_resultado' });
assert.equal(m.decidir('Catan', [{id:1,nombre:'Catan',anio:1995,tipo:'boardgame'},{id:2,nombre:'CATAN',anio:2015,tipo:'boardgame'}]).estado, 'dudoso', 'dos iguales no se adivinan');
assert.equal(m.decidir('Among Cultists', [{id:1,nombre:'Among Cultists',anio:2023,tipo:'boardgame'},{id:1,nombre:'Among Cultists',anio:2023,tipo:'boardgameexpansion'}]).estado, 'ok', 'mismo id como juego y expansión');
assert.equal(catan.datos.nombre, 'CATAN');
console.log('mapeo: todo correcto');
