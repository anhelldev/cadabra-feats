// Copia las portadas de los juegos a Supabase Storage (bucket "portadas"), achicadas a webp de ~600 px,
// y actualiza juegos.portada para que apunte a la copia. Se puede interrumpir y volver a correr: solo toca
// las portadas que todavía apuntan fuera del bucket.
//
// Entra con tu usuario admin (las mismas reglas de seguridad que el panel): no usa ninguna llave privilegiada.
// Uso (desde scripts/, después de `npm install`):
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node portadas-storage.mjs [opciones]
// Opciones:
//   --seco          no sube ni actualiza nada: descarga y achica unas pocas para mostrar el ahorro
//   --limite N      procesa como mucho N juegos (con --seco son 5 por defecto)
//   --visibles      solo juegos visibles en el catálogo
//   --concurrencia N  descargas en paralelo (3 por defecto)
//   --revertir      deshace la copia: devuelve cada portada a su URL original según el respaldo
//                   (solo las que siguen apuntando a la copia; los archivos del bucket no se borran)
// El respaldo de las URLs originales queda en scripts/portadas-respaldo.jsonl.
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(nombre);
  return i < 0 ? defecto : process.argv[i + 1] ?? true;
};
const SECO = process.argv.includes("--seco");
const SOLO_VISIBLES = process.argv.includes("--visibles");
const LIMITE = +arg("--limite", SECO ? 5 : Infinity);
const CONCURRENCIA = +arg("--concurrencia", 3);
const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Faltan SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL y ADMIN_PASSWORD en el entorno.");
  process.exit(1);
}

const BUCKET = "portadas";
const PREFIJO = `/storage/v1/object/public/${BUCKET}/`;
const MAX_BYTES = 480 * 1024; // el bucket rechaza archivos de más de 500 KB
const RESPALDO = new URL("./portadas-respaldo.jsonl", import.meta.url);
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) {
    console.error(`No se pudo entrar como ${ADMIN_EMAIL}: ${error.message}`);
    process.exit(1);
  }
  const { data: esAdmin } = await db.rpc("es_admin");
  if (esAdmin !== true) {
    console.error(`${ADMIN_EMAIL} no es administrador.`);
    process.exit(1);
  }
}

async function juegosPendientes() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from("juegos").select("id, slug, nombre, portada, visible").not("portada", "is", null).order("id");
    if (SOLO_VISIBLES) q = q.eq("visible", true);
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas.filter((j) => !j.portada.includes(PREFIJO));
}

async function descargar(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { "User-Agent": "Mozilla/5.0 (CadabraJuegos)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tipo = r.headers.get("content-type") ?? "";
  if (!tipo.startsWith("image/")) throw new Error(`no es una imagen (${tipo || "sin tipo"})`);
  return Buffer.from(await r.arrayBuffer());
}

/** Achica a 600 px como máximo y convierte a webp, bajando la calidad si hace falta para entrar en el límite del bucket. */
async function achicar(original) {
  for (const calidad of [80, 70, 60, 50]) {
    const salida = await sharp(original).rotate().resize({ width: 600, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: calidad }).toBuffer();
    if (salida.length <= MAX_BYTES) return salida;
  }
  throw new Error("no se pudo achicar por debajo de 480 KB");
}

async function procesar(j) {
  const original = await descargar(j.portada);
  const webp = await achicar(original);
  const resultado = { antes: original.length, despues: webp.length };
  if (SECO) return resultado;

  const ruta = `${j.slug}-${createHash("sha1").update(webp).digest("hex").slice(0, 8)}.webp`;
  // El nombre lleva el hash del contenido: si ya existe, es exactamente la misma imagen y se reutiliza.
  const { error } = await db.storage.from(BUCKET).upload(ruta, webp, { contentType: "image/webp", cacheControl: "31536000" });
  if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(`al subir: ${error.message}`);
  await appendFile(RESPALDO, JSON.stringify({ id: j.id, slug: j.slug, original: j.portada, nueva: ruta }) + "\n");
  const publica = db.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  // Solo si la portada sigue siendo la que leímos: si el admin la cambió mientras tanto, no se pisa.
  const { data, error: e2 } = await db.from("juegos").update({ portada: publica }).eq("id", j.id).eq("portada", j.portada).select("id");
  if (e2) throw new Error(`al actualizar: ${e2.message}`);
  if (!data.length) return { ...resultado, omitida: true };
  return resultado;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

if (process.argv.includes("--revertir")) {
  const lineas = (await readFile(RESPALDO, "utf8").catch(() => "")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let devueltas = 0, omitidas = 0;
  for (const l of lineas) {
    const publica = db.storage.from(BUCKET).getPublicUrl(l.nueva).data.publicUrl;
    const { data, error } = await db.from("juegos").update({ portada: l.original }).eq("id", l.id).eq("portada", publica).select("id");
    if (error) console.log(`  ✗ ${l.slug}: ${error.message}`);
    else if (data.length) devueltas++;
    else omitidas++;
  }
  console.log(`Revertido: ${devueltas} portadas devueltas a su URL original${omitidas ? `, ${omitidas} omitidas (ya habían cambiado)` : ""}. Del respaldo: ${lineas.length}.`);
  process.exit(0);
}

const todas = await juegosPendientes();
const pendientes = todas.slice(0, LIMITE);
const porOrigen = {};
for (const j of pendientes) {
  const host = new URL(j.portada).host;
  porOrigen[host] = (porOrigen[host] ?? 0) + 1;
}
console.log(`${SECO ? "[SECO] " : ""}Hay ${todas.length} portadas fuera del bucket; se procesan ${pendientes.length}. Origen:`, porOrigen);

let hechas = 0, omitidas = 0, antes = 0, despues = 0;
const fallos = [];
const cola = [...pendientes];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, async () => {
    while (cola.length) {
      const j = cola.shift();
      try {
        const r = await procesar(j);
        antes += r.antes;
        despues += r.despues;
        if (r.omitida) omitidas++;
        else hechas++;
        if (SECO) console.log(`  ${j.nombre}: ${kb(r.antes)} → ${kb(r.despues)}`);
        else if ((hechas + omitidas) % 25 === 0) console.log(`  ${hechas + omitidas}/${pendientes.length}…`);
      } catch (e) {
        fallos.push({ id: j.id, nombre: j.nombre, url: j.portada, motivo: e.message });
      }
    }
  }),
);

console.log(`\n${SECO ? "Simulación" : "Listo"}: ${hechas} copiadas${omitidas ? `, ${omitidas} omitidas (cambiaron mientras tanto)` : ""}, ${fallos.length} con error.`);
if (antes) console.log(`Peso: ${kb(antes)} → ${kb(despues)} (${Math.round((1 - despues / antes) * 100)} % menos).`);
for (const f of fallos) console.log(`  ✗ ${f.nombre} (id ${f.id}): ${f.motivo}\n    ${f.url}`);
