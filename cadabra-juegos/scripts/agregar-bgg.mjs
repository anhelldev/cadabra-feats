// Agrega a la base juegos que todavía no existen, buscándolos en BGG a través de la función `bgg` (la misma del panel).
// Dos pasos, con tu usuario admin (sin llaves privilegiadas):
//   1) sin opciones: busca cada juego en BGG y guarda los candidatos en scripts/agregar-candidatos.json (no cambia nada).
//   2) --crear: crea los juegos con los ids de BGG elegidos en scripts/agregar-ids.json ({ "Nombre": bgg_id, ... }).
// Los juegos nuevos quedan ocultos y con el nombre que escribió Cadabra; se muestran después, desde el panel o con para-llevar.
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const CREAR = process.argv.includes("--crear");
const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Faltan SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL y ADMIN_PASSWORD en el entorno.");
  process.exit(1);
}

// Nombre como lo escribió Cadabra -> cómo buscarlo en BGG.
const JUEGOS = {
  "Brass Lancashire": "Brass: Lancashire",
  "Nemesis Represalia": "Nemesis Retaliation",
  "Wingspan": "Wingspan",
  "Orloj": "Orloj",
  "Caverna": "Caverna: The Cave Farmers",
  "Fresco": "Fresco",
  "Celestia": "Celestia",
  "Trickerion": "Trickerion: Legends of Illusion",
  "Speakeasy": "Speakeasy",
  "Yokohama": "Yokohama",
  "Furnace": "Furnace",
  "Khora": "Khora: Rise of an Empire",
  "The White Castle": "The White Castle",
};

const CANDIDATOS = new URL("./agregar-candidatos.json", import.meta.url);
const IDS = new URL("./agregar-ids.json", import.meta.url);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const aSlug = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: errLogin } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (errLogin) {
  console.error("No pude entrar:", errLogin.message);
  process.exit(1);
}

async function bgg(cuerpo) {
  for (let intento = 0; ; intento++) {
    const { data, error } = await db.functions.invoke("bgg", { body: cuerpo });
    if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? error.message);
    if (data?.ok) return data;
    if (data?.espera_s && intento < 3) {
      await dormir(data.espera_s * 1000 + 500);
      continue;
    }
    throw new Error(data?.error ?? "Error desconocido");
  }
}

if (!CREAR) {
  const salida = {};
  for (const [nombre, consulta] of Object.entries(JUEGOS)) {
    try {
      const r = await bgg({ accion: "buscar", q: consulta, tipos: ["boardgame"] });
      salida[nombre] = r.resultados.slice(0, 5);
      console.log(`\n${nombre}  (busqué «${consulta}», ${r.total} resultados)`);
      for (const c of salida[nombre]) console.log(`   ${c.bgg_id ?? c.id}  ${c.nombre}  ${c.anio ?? ""}${c.en_catalogo ? `   ← YA EN CATÁLOGO: ${c.en_catalogo.nombre}` : ""}`);
    } catch (e) {
      console.log(`\n${nombre}: error ${e.message}`);
    }
    await dormir(2200);
  }
  await writeFile(CANDIDATOS, JSON.stringify(salida, null, 1));
  console.log("\nGuardado en scripts/agregar-candidatos.json. Nada se cambió en la base.");
  process.exit(0);
}

const ids = JSON.parse(await readFile(IDS, "utf8"));
const { data: existentes } = await db.from("juegos").select("slug,nombre,bgg_id");
const slugs = new Set(existentes.map((j) => j.slug));
const bggUsados = new Map(existentes.filter((j) => j.bgg_id).map((j) => [j.bgg_id, j.nombre]));
let creados = 0;
for (const [nombre, id] of Object.entries(ids)) {
  if (bggUsados.has(id)) {
    console.log(`SALTADO ${nombre}: el id ${id} de BGG ya está en «${bggUsados.get(id)}».`);
    continue;
  }
  try {
    const { ficha: f } = await bgg({ accion: "ficha", id });
    let slug = aSlug(nombre);
    for (let n = 2; slugs.has(slug); n++) slug = `${aSlug(nombre)}-${n}`;
    slugs.add(slug);
    const { data, error } = await db
      .from("juegos")
      .insert({
        nombre, slug, jugadores_min: f.jugadores_min, jugadores_max: f.jugadores_max, duracion_min: f.duracion_min,
        duracion_max: f.duracion_max, edad_min: f.edad_min, dificultad: f.dificultad, categoria: f.categoria,
        portada: f.imagen, portada_origen: f.imagen ? "bgg" : null, bgg_id: f.bgg_id, bgg_tipo: f.tipo, bgg_estado: "ok",
        bgg_datos: f.datos, videos: f.videos, origen: "bgg", visible: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    creados++;
    console.log(`OK ${nombre} -> id ${data.id} (BGG ${f.bgg_id}: ${f.nombre})${f.categoria ? "" : "  [sin categoría]"}`);
  } catch (e) {
    console.log(`FALLO ${nombre}: ${e.message}`);
  }
  await dormir(2200);
}
console.log(`\nCreados ${creados} de ${Object.keys(ids).length}.`);
