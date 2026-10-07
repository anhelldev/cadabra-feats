// Genera supabase/seed.sql con:
//  - los juegos de juegos.json (visibles), con portada y enlace si coinciden con seguridad con un producto;
//  - el resto de productos de la tienda como juegos ocultos (origen 'tienda') para completarlos en el panel.
//  - a esos productos se les aplican los datos estimados de scripts/estimaciones.csv (quedan con revisar = true).
//  - los juegos de la página "Juegos Local" que faltaban (scripts/juegos-nuevos.csv, origen 'local');
//  - en_local = true para esos y para los que cruzan con seguridad en scripts/juegos-local.csv. Los que están
//    en el local y tienen todos los datos quedan visibles.
// Requiere haber corrido antes scripts/tienda.mjs. Uso: node scripts/generar-seed.mjs
import { readFile, writeFile } from "node:fs/promises";

const leer = async ruta => JSON.parse(await readFile(new URL(ruta, import.meta.url), "utf8"));
const juegos = await leer("../juegos.json");
const tienda = new Map((await leer("./tienda.json")).map(p => [p.id, p]));
const filasCsv = async ruta => {
  const texto = await readFile(new URL(ruta, import.meta.url), "utf8");
  // Campos separados por comas; un campo entre comillas puede contener comas.
  return texto.trim().split("\n").slice(1).map(l => [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
    .slice(0, -1).map(m => m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]));
};
// Columnas: clave, jugadores_min, jugadores_max, duracion_min, duracion_max, dificultad, edad_min, categoria, nombre.
// La clave es tienda_id en estimaciones.csv y slug en juegos-nuevos.csv; un campo vacío queda como null.
const leerDatos = async ruta => (await filasCsv(ruta)).map(c => {
  const num = i => (c[i] ? +c[i] : null);
  return { clave: c[0], jmin: num(1), jmax: num(2), dmin: num(3), dmax: num(4), dif: num(5), edad: num(6), cat: c[7] || null, nombre: c[8] };
});
const estimaciones = new Map((await leerDatos("./estimaciones.csv")).map(e => [+e.clave, e]));
const nuevos = await leerDatos("./juegos-nuevos.csv");
// Columnas: local, estado, juego_db, slug, dudoso, nota. Los dudosos se deciden a mano en el panel.
const enLocal = (await filasCsv("./juegos-local.csv")).filter(c => c[3] && c[4] !== "si").map(c => c[3]);
const seguros = new Map((await leer("./coincidencias.json")).filter(c => c.estado === "seguro").map(c => [c.id, tienda.get(c.tiendaId)]));

const COLORES = {
  "Estrategia": "#1F4E79", "Familiar": "#2E7D5B", "Party": "#B83280", "Cartas": "#6B46C1", "Cooperativo": "#0E7490",
  "Deducción": "#374151", "Adultos": "#9B2C2C", "Infantil": "#B7791F", "Abstracto": "#4A5568", "Habilidad": "#C05621",
  "Clásico": "#5A4632", "Palabras y trivia": "#2B6CB0", "Aventura": "#276749", "Expansión": "#64748B",
};
const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "en", "a", "con", "por", "para", "vs"]);

const lit = v => v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = xs => xs.length ? `array[${xs.map(lit).join(", ")}]` : "'{}'::text[]";
const titulo = s => s.toLowerCase().replace(/\p{L}[\p{L}']*/gu, (w, i) => i && MINUSCULAS.has(w) ? w : w[0].toUpperCase() + w.slice(1));
// La tienda tiene nombres con "?" en lugar de "Ñ" o "°" (ESPA?OL, N?1).
const sinInterrogantes = s => s.replace(/(\p{L})\?(\p{L})/gu, "$1Ñ$2").replace(/\bN\?(\d)/g, "N°$1");
const aSlug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const sinColor = [...new Set([...juegos.map(j => j.categoria), ...[...estimaciones.values(), ...nuevos].map(e => e.cat)])].filter(c => c && !COLORES[c]);
if (sinColor.length) throw new Error(`Categorías sin color: ${sinColor.join(", ")}`);

// Dos juegos pueden apuntar al mismo producto; solo el primero se queda con tienda_id (es único).
const usados = new Set();
const filas = juegos.map(j => {
  let p = seguros.get(j.id);
  if (p && usados.has(p.id)) p = null;
  if (p) usados.add(p.id);
  return [j.id, lit(j.slug), lit(j.nombre), j.jugadoresMin, j.jugadoresMax, j.duracionMin, "null", j.dificultad, j.edadMin,
    lit(j.categoria), lit(j.descripcion), lit(p?.descripcion), arr(j.tips), lit(j.portada ?? p?.imagen), lit(p?.id), lit(p?.url),
    lit("catalogo"), j.revisar, true];
});

const slugs = new Set(juegos.map(j => j.slug));
let id = Math.max(...juegos.map(j => j.id));
for (const p of tienda.values()) {
  if (usados.has(p.id)) continue;
  let slug = aSlug(p.slug) || `producto-${p.id}`;
  if (slugs.has(slug)) slug += `-${p.id}`;
  slugs.add(slug);
  const e = estimaciones.get(p.id) ?? {};
  filas.push([++id, lit(slug), lit(titulo(sinInterrogantes(p.nombre))), lit(e.jmin), lit(e.jmax), lit(e.dmin), lit(e.dmax), lit(e.dif), lit(e.edad), lit(e.cat), "null",
    lit(p.descripcion), arr([]), lit(p.imagen), p.id, lit(p.url), lit("tienda"), true, false]);
}

for (const n of nuevos) {
  if (slugs.has(n.clave)) throw new Error(`Slug repetido en juegos-nuevos.csv: ${n.clave}`);
  slugs.add(n.clave);
  filas.push([++id, lit(n.clave), lit(n.nombre), lit(n.jmin), lit(n.jmax), lit(n.dmin), lit(n.dmax), lit(n.dif), lit(n.edad), lit(n.cat),
    "null", "null", arr([]), "null", "null", "null", lit("local"), true, false]);
}
const faltan = enLocal.filter(s => !slugs.has(s));
if (faltan.length) throw new Error(`Slugs de juegos-local.csv que no existen: ${faltan.join(", ")}`);
const marcar = [...enLocal, ...nuevos.map(n => n.clave)];

const sql = `-- Generado por scripts/generar-seed.mjs. No editar a mano.
insert into public.categorias (nombre, color) values
${Object.entries(COLORES).map(([n, c]) => `(${lit(n)}, ${lit(c)})`).join(",\n")};

insert into public.juegos (id, slug, nombre, jugadores_min, jugadores_max, duracion_min, duracion_max, dificultad, edad_min,
  categoria, descripcion, descripcion_tienda, tips, portada, tienda_id, url_tienda, origen, revisar, visible) values
${filas.map(f => `(${f.join(", ")})`).join(",\n")};

select setval(pg_get_serial_sequence('public.juegos', 'id'), (select max(id) from public.juegos));

update public.juegos set portada_origen = 'tienda' where portada is not null and portada_origen is null;

update public.juegos set en_local = true where slug in (
${marcar.map(lit).join(",\n")});

update public.juegos set visible = true
where en_local and not visible and jugadores_min is not null and jugadores_max is not null and duracion_min is not null
  and dificultad is not null and edad_min is not null and categoria is not null;
`;

await writeFile(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(`seed.sql: ${juegos.length} del catálogo (${usados.size} enlazados con la tienda), ${filas.length - juegos.length - nuevos.length} de la tienda, ${nuevos.length} nuevos del local; ${marcar.length} marcados en el local`);
