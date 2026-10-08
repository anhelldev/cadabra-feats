// Prueba de extremo a extremo de las reglas de seguridad y funciones de torneos contra la base LOCAL
// (supabase start + db reset + admin-local.sql). No toca la nube.
// Uso (desde scripts/, Node 24):  node --experimental-strip-types --no-warnings probar-torneos.mjs
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const L = await import(new URL('../web/src/app/core/torneos-logica.ts', import.meta.url).pathname);

const URL_ = 'http://127.0.0.1:55321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const nuevo = () => createClient(URL_, ANON, { auth: { persistSession: false } });
const anon = nuevo();
const admin = nuevo();
const { error: eLogin } = await admin.auth.signInWithPassword({ email: 'admin@cadabra.test', password: 'cadabra-local-123' });
assert.ifError(eLogin);
const ok = (r, msg) => { assert.ifError(r.error); return r.data; };
const slug = 'prueba-' + Date.now();

// Un visitante no puede crear torneos
let r = await anon.from('torneos').insert({ slug, nombre: 'Intruso', formato: 'eliminacion', fecha: new Date().toISOString(), cupos: 4 });
assert.ok(r.error, 'anon no crea torneos');

// El admin crea uno en borrador: el público no lo ve y no se puede inscribir
// Un juego oculto del catálogo, para comprobar que el torneo publicado deja ver su juego
const oculto = ok(await admin.from('juegos').select('id,nombre').eq('visible', false).limit(1))[0];
assert.ok(oculto, 'hay un juego oculto para la prueba');
const t = ok(await admin.from('torneos').insert({ slug, nombre: 'Torneo de prueba', formato: 'eliminacion', fecha: new Date(Date.now() + 864e5).toISOString(), cupos: 4, juego_id: oculto.id }).select().single());
assert.equal((await anon.from('juegos').select('id').eq('id', oculto.id)).data.length, 0, 'juego oculto no se ve con el torneo en borrador');
assert.ok((await admin.from('torneos').update({ imagen: 'javascript:alert(1)' }).eq('id', t.id)).error, 'imagen solo http(s)');
assert.equal((await anon.from('torneos').select('id').eq('id', t.id)).data.length, 0, 'borrador oculto');
const insc = (n, tel, extra = {}) => anon.from('inscripciones').insert({ torneo_id: t.id, nombre: n, telefono: tel, acepta: true, ...extra });
assert.ok((await insc('Ana', '+584120000001')).error, 'no se inscribe en borrador');

// Inscripción abierta: ahora sí, con cupos (4) y lista de espera
ok(await admin.from('torneos').update({ estado: 'inscripcion', imagen: URL_ + '/storage/v1/object/public/portadas/torneos/prueba.webp' }).eq('id', t.id));
const embed = ok(await anon.from('torneos').select('nombre,imagen,juego:juegos(id,nombre)').eq('id', t.id).single());
assert.equal(embed.juego?.id, oculto.id, 'torneo publicado deja ver su juego aunque esté oculto');
assert.ok(embed.imagen.startsWith('http'));
// Almacenamiento: solo el admin sube a portadas/torneos/
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0]);
assert.ok((await anon.storage.from('portadas').upload('torneos/anon.webp', webp, { contentType: 'image/webp' })).error, 'anon no sube al bucket');
ok(await admin.storage.from('portadas').upload('torneos/' + slug + '.webp', webp, { contentType: 'image/webp'}));
ok(await admin.storage.from('portadas').remove(['torneos/' + slug + '.webp']));
assert.equal((await anon.from('torneos').select('id').eq('id', t.id)).data.length, 1, 'publicado visible');
for (let i = 1; i <= 5; i++) ok(await insc('Jugador ' + i, '+58412000000' + i));
assert.ok((await insc('Repetido', '+584120000001')).error?.code === '23505', 'mismo teléfono dos veces');
assert.ok((await insc('Sin consentimiento', '+584129999999', { acepta: false })).error, 'sin consentimiento');
assert.ok((await insc('Mal teléfono', '0412')).error, 'teléfono inválido');
const insAdmin = ok(await admin.from('inscripciones').select('id,nombre,estado').eq('torneo_id', t.id).order('id'));
assert.deepEqual(insAdmin.map((i) => i.estado), ['inscrito', 'inscrito', 'inscrito', 'inscrito', 'espera']);

// Privacidad: el público no lee inscripciones; la vista solo trae nombres
assert.equal((await anon.from('inscripciones').select('*')).data?.length ?? 0, 0, 'anon no lee inscripciones');
const pub = ok(await anon.from('torneo_participantes').select('*').eq('torneo_id', t.id));
assert.equal(pub.length, 5);
assert.deepEqual(Object.keys(pub[0]).sort(), ['estado', 'id', 'nombre', 'torneo_id']);
await anon.from('inscripciones').update({ estado: 'retirado' }).eq('torneo_id', t.id);
assert.equal(ok(await admin.from('inscripciones').select('id').eq('torneo_id', t.id).eq('estado', 'retirado')).length, 0, 'anon no modifica inscripciones');

// Iniciar: solo admin, con la llave sorteada de los inscritos
const inscritos = insAdmin.filter((i) => i.estado === 'inscrito').map((i) => i.id);
const llave = L.generarLlave(inscritos);
assert.ok((await anon.rpc('iniciar_torneo', { p_torneo: t.id, p_partidas: llave })).error, 'anon no inicia');
assert.ok((await admin.rpc('iniciar_torneo', { p_torneo: t.id, p_partidas: [{ ronda: 1, numero: 1, jugadores: [{ inscripcion_id: insAdmin[4].id }] }] })).error, 'no acepta jugadores en espera');
ok(await admin.rpc('iniciar_torneo', { p_torneo: t.id, p_partidas: llave }));
assert.equal(ok(await admin.from('torneos').select('estado,ronda_actual').eq('id', t.id).single()).estado, 'en_curso');
assert.ok((await admin.rpc('iniciar_torneo', { p_torneo: t.id, p_partidas: llave })).error, 'no se inicia dos veces');
assert.ok((await insc('Tarde', '+584128888888')).error, 'cerradas las inscripciones');

// El público ve la llave (nombres, sin teléfonos) pero no puede tocarla
const verLlave = ok(await anon.from('torneo_partidas_publicas').select('*').eq('torneo_id', t.id));
assert.equal(verLlave.length, 5, '4 jugadores en primera ronda + la final aún vacía');
assert.ok(verLlave.every((f) => !('telefono' in f)));
assert.equal((await anon.from('partidas').select('*').eq('torneo_id', t.id)).data?.length ?? 0, 0, 'anon no lee partidas directo');
await anon.from('partida_jugadores').update({ puntos: 99 }).neq('partida_id', 0);
assert.equal(ok(await admin.from('partida_jugadores').select('puntos').eq('puntos', 99)).length, 0, 'anon no modifica partidas');

// El admin conduce la llave hasta el campeón y finaliza
let partidas = ok(await admin.from('partidas').select('id,ronda,numero,estado,partida_jugadores(inscripcion_id,gano)').eq('torneo_id', t.id));
const aLlave = () => partidas.map((p) => ({ ronda: p.ronda, numero: p.numero, estado: p.estado, jugadores: p.partida_jugadores }));
const total = Math.max(...partidas.map((p) => p.ronda));
for (let ronda = 1; ronda <= total; ronda++) {
  for (const p of partidas.filter((x) => x.ronda === ronda && x.estado === 'pendiente')) {
    const av = L.avanzarGanador(aLlave(), ronda, p.numero, p.partida_jugadores[0].inscripcion_id);
    for (const m of av.marcar) ok(await admin.from('partida_jugadores').update({ gano: m.gano }).eq('partida_id', p.id).eq('inscripcion_id', m.inscripcion_id));
    ok(await admin.from('partidas').update({ estado: 'jugada' }).eq('id', p.id));
    if (av.siguiente) {
      const sig = partidas.find((x) => x.ronda === av.siguiente.ronda && x.numero === av.siguiente.numero);
      ok(await admin.from('partida_jugadores').insert({ partida_id: sig.id, inscripcion_id: av.siguiente.inscripcion_id }));
    }
    partidas = ok(await admin.from('partidas').select('id,ronda,numero,estado,partida_jugadores(inscripcion_id,gano)').eq('torneo_id', t.id));
  }
}
const podio = L.podioLlave(aLlave());
assert.equal(podio.filter((x) => x.posicion === 1).length, 1);
ok(await admin.from('torneos').update({ estado: 'finalizado' }).eq('id', t.id));
assert.equal((await anon.from('torneos').select('estado').eq('id', t.id).single()).data.estado, 'finalizado');

// Limpieza
ok(await admin.from('torneos').delete().eq('id', t.id));
console.log('probar-torneos: todo bien');
