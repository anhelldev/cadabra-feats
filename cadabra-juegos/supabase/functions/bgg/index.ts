// Función Edge "bgg": el token de BGG vive solo aquí (secreto BGG_TOKEN) y nunca llega al navegador.
// Solo la pueden usar los admins. Acciones: buscar, ficha, vincular, sincronizar.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buscar, ErrorBgg, fichas, miniaturas, SEPARACION_MS } from './bgg.ts';
import { Candidato, cambiosDesdeFicha, decidir, Ficha, JuegoBase, normalizar } from './mapeo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const TIPOS_VALIDOS = ['boardgame', 'boardgameexpansion', 'boardgameaccessory', 'videogame', 'rpgitem', 'rpgissue'];
/** Cada llamada de sincronizar corta antes de este tiempo para no acercarse al límite de la plataforma. */
const PRESUPUESTO_MS = 60_000;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fallo = (error: string, codigo: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, codigo, ...extra });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: esAdmin } = await db.rpc('es_admin');
  if (esAdmin !== true) return json({ ok: false, error: 'Solo para administradores.' }, 403);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo inválido' }, 400);
  }

  try {
    switch (cuerpo.accion) {
      case 'buscar':
        return json({ ok: true, ...(await accionBuscar(db, cuerpo)) });
      case 'ficha':
        return json({ ok: true, ficha: await accionFicha(Number(cuerpo.id)) });
      case 'miniaturas': {
        const ids = (Array.isArray(cuerpo.ids) ? cuerpo.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
        return json({ ok: true, miniaturas: Object.fromEntries(await miniaturas(ids)) });
      }
      case 'vincular':
        return json({ ok: true, juego: await accionVincular(db, Number(cuerpo.juego_id), Number(cuerpo.bgg_id)) });
      case 'sincronizar':
        return json({ ok: true, ...(await accionSincronizar(db, Number(cuerpo.limite) || 6)) });
      default:
        return json({ ok: false, error: 'Acción desconocida' }, 400);
    }
  } catch (e) {
    if (e instanceof ErrorBgg) return fallo(e.message, e.codigo, { espera_s: e.esperaSeg });
    console.error(e);
    return fallo((e as Error).message ?? 'Error inesperado', 'interno');
  }
});

async function accionBuscar(db: SupabaseClient, c: Record<string, unknown>) {
  const q = String(c.q ?? '').trim();
  if (q.length < 2) throw new ErrorBgg('Escribe al menos 2 letras.', 'respuesta');
  const tipos = (Array.isArray(c.tipos) ? c.tipos.map(String) : ['boardgame']).filter((t) => TIPOS_VALIDOS.includes(t));
  if (!tipos.length) throw new ErrorBgg('Elige al menos un tipo.', 'respuesta');

  const todos = await buscar(q, tipos);
  const nq = normalizar(q);
  const rango = (n: Candidato) => (normalizar(n.nombre) === nq ? 0 : normalizar(n.nombre).startsWith(nq) ? 1 : 2);
  const resultados = todos
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rango(a.r) - rango(b.r) || a.i - b.i)
    .map(({ r }) => r)
    .slice(0, 40);

  const { data } = await db.from('juegos').select('id, nombre, bgg_id').in('bgg_id', resultados.map((r) => r.id));
  const enCatalogo = new Map((data ?? []).map((j) => [j.bgg_id as number, { id: j.id as number, nombre: j.nombre as string }]));
  return {
    total: todos.length,
    resultados: resultados.map((r) => ({ ...r, en_catalogo: enCatalogo.get(r.id) ?? null })),
  };
}

async function accionFicha(id: number): Promise<Ficha> {
  if (!Number.isInteger(id) || id <= 0) throw new ErrorBgg('Id de BGG inválido.', 'respuesta');
  const f = (await fichas([id])).get(id);
  if (!f) throw new ErrorBgg('BGG no devolvió datos para ese id.', 'respuesta');
  return f;
}

const COLUMNAS = 'id, nombre, categoria, revisar, portada, jugadores_min, jugadores_max, duracion_min, duracion_max, dificultad, edad_min';

async function accionVincular(db: SupabaseClient, juegoId: number, bggId: number) {
  const f = await accionFicha(bggId);
  const { data: juego, error } = await db.from('juegos').select(COLUMNAS).eq('id', juegoId).single();
  if (error) throw error;
  const { data: otro } = await db.from('juegos').select('id, nombre').eq('bgg_id', bggId).neq('id', juegoId).maybeSingle();
  if (otro) throw new ErrorBgg(`Ese juego de BGG ya está vinculado a "${otro.nombre}".`, 'respuesta');
  const { data, error: e2 } = await db.from('juegos').update(cambiosDesdeFicha(juego as JuegoBase, f)).eq('id', juegoId).select().single();
  if (e2) throw e2;
  return data;
}

async function accionSincronizar(db: SupabaseClient, limite: number) {
  const inicio = Date.now();
  const n = Math.min(Math.max(limite, 1), 10);
  const { data: lote, error } = await db
    .from('juegos')
    .select(COLUMNAS)
    .eq('bgg_estado', 'pendiente')
    .is('bgg_id', null)
    .order('en_local', { ascending: false })
    .order('visible', { ascending: false })
    .order('id')
    .limit(n);
  if (error) throw error;

  const res = { procesados: 0, ok: 0, dudosos: 0, sin_resultado: 0, avisos: [] as string[], espera_s: 0 };
  const aceptados: { juego: JuegoBase & { id: number; nombre: string }; bggId: number }[] = [];
  let corte: ErrorBgg | null = null;

  for (const juego of lote ?? []) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break;
    try {
      const tipos = juego.categoria === 'Expansión' ? ['boardgameexpansion', 'boardgame'] : ['boardgame', 'boardgameexpansion'];
      const d = decidir(juego.nombre, await buscar(juego.nombre, tipos));
      if (d.estado === 'ok') aceptados.push({ juego, bggId: d.id });
      else if (d.estado === 'dudoso') {
        res.dudosos++;
        await db.from('juegos').update({ bgg_estado: 'dudoso', bgg_candidatos: d.candidatos, bgg_sync: new Date().toISOString() }).eq('id', juego.id);
      } else {
        res.sin_resultado++;
        await db.from('juegos').update({ bgg_estado: 'sin_resultado', bgg_candidatos: [], bgg_sync: new Date().toISOString() }).eq('id', juego.id);
      }
    } catch (e) {
      if (!(e instanceof ErrorBgg) || e.codigo === 'token') throw e;
      corte = e; // límite, cola o red: se guarda lo ya hecho y se avisa para esperar
      break;
    }
  }

  if (aceptados.length && !corte) {
    try {
      const datos = await fichas([...new Set(aceptados.map((a) => a.bggId))]);
      const usados = new Set<number>();
      for (const { juego, bggId } of aceptados) {
        const f = datos.get(bggId);
        const repetido = usados.has(bggId) || (await db.from('juegos').select('id').eq('bgg_id', bggId).maybeSingle()).data;
        if (!f || repetido) {
          // Dos juegos del catálogo apuntan al mismo juego de BGG, o BGG no devolvió la ficha: lo decide el admin.
          res.dudosos++;
          const motivo = repetido ? 'Ya vinculado a otro juego del catálogo' : 'BGG no devolvió la ficha';
          const cand: Candidato = { id: bggId, nombre: f?.nombre ?? juego.nombre, anio: f?.datos.anio ?? null, tipo: f?.tipo ?? 'boardgame', motivo };
          await db.from('juegos').update({ bgg_estado: 'dudoso', bgg_candidatos: [cand], bgg_sync: new Date().toISOString() }).eq('id', juego.id);
          continue;
        }
        usados.add(bggId);
        const { error: e } = await db.from('juegos').update(cambiosDesdeFicha(juego, f)).eq('id', juego.id);
        if (e) res.avisos.push(`${juego.nombre}: ${e.message}`);
        else res.ok++;
      }
    } catch (e) {
      if (!(e instanceof ErrorBgg) || e.codigo === 'token') throw e;
      corte = e;
      // Los que se aceptaron pero no se pudieron completar siguen pendientes y se reintentan en la próxima tanda.
    }
  }

  const { count } = await db.from('juegos').select('id', { count: 'exact', head: true }).eq('bgg_estado', 'pendiente').is('bgg_id', null);
  if (corte) {
    res.avisos.push(corte.message);
    res.espera_s = Math.max(corte.esperaSeg, 5);
  }
  res.procesados = res.ok + res.dudosos + res.sin_resultado;
  return { ...res, pendientes: count ?? 0, espera_ms: Math.max(SEPARACION_MS, res.espera_s * 1000) };
}
