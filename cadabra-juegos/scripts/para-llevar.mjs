// Aplica la lista de juegos "para llevar": los de la lista pasan a visibles + para_llevar (sin estar en el local) y se
// ocultan los demás juegos visibles que no están en el local. Los que ya están en el local no se tocan.
//
// Entra con tu usuario admin (mismas reglas de seguridad que el panel). Sin --aplicar solo muestra el plan.
// Uso (desde scripts/): ./para-llevar-nube.sh [--aplicar | --revertir]
//   --revertir  vuelve a mostrar los juegos que este script ocultó y quita "para llevar" a los que marcó
//               (según scripts/para-llevar-respaldo.json)
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");
const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Faltan SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL y ADMIN_PASSWORD en el entorno.");
  process.exit(1);
}
const RESPALDO = new URL("./para-llevar-respaldo.json", import.meta.url);

// Cada entrada: lo que escribió Cadabra -> nombres exactos con los que está en la base (puede haber varias ediciones).
const LISTA = {
  "Detective ciudad de ángeles": ["Detective Ciudad de Angeles"],
  "Scotland yard": ["Scotland Yard"],
  "Arnak": ["Las Ruinas Perdidas de Arnak"],
  "U-boot": ["U-Boot"],
  "Dead cells": ["Dead Cells"],
  "Planeta desconocido edición deluxe": ["Planeta Desconocido Deluxe"],
  "Pulsar 2849": ["Pulsar 2849"],
  "Wonderlands war": ["Wonderlands War"],
  "Brass lancashire": ["Brass Lancashire"],
  "Charterstone": ["Charterstone"],
  "Pest": ["Pest"],
  "The witcher viejo mundo edición deluxe": ["The Witcher el Viejo Mundo"],
  "Leyendas de Andor frío eterno": ["Las Leyendas de Andor el Frio Eterno"],
  "Kingdom builder": ["Kingdom Builder"],
  "El ansia": ["El Ansia"],
  "Revive": ["Revive"],
  "Inkognito": ["Inkognito Un Carnaval de Espias en Venecia"],
  "Tzolkin": ["Tzolk’In"],
  "Mineros del imperio": ["Mineros del Imperio"],
  "Comet": ["Comet"],
  "Creature conforts": ["Creature Comforts"],
  "Destinnies": ["Destinies"],
  "Archeos society": ["Archeos Society"],
  "Vida salvaje serengueti": ["Vida Salvaje: Serengueti"],
  "Tudor": ["Tudor"],
  "La era de Roma": ["La Era de Roma"],
  "Age of innovation": ["Age Of Innovation"],
  "Mare nostrum": ["Mare Nostrum"],
  "Piratas de Maracaibo": ["Piratas de Maracaibo"],
  "Terra mystica": ["Terra Mystica"],
  "Carnegie": ["Carnegie"],
  "Tapestry": ["Tapestry Un Juego de Civilizaciones"],
  "Mystic vale edición esencial": ["Mystic Vale Edicion Esencial"],
  "Obsession": ["Obsesion"],
  "La granja deluxe": ["La Granja Edicion Deluxe"],
  "Hallertau": ["Hallertau"],
  "Ponzi scheme": ["Ponzi Scheme"],
  "Libertalia": ["Libertalia"],
  "Nemesis represalia": ["Nemesis Represalia"],
  "Lancelot": ["Lancelot"],
  "Clank": ["Clank! Catacumbas", "Clank! In! Space!"],
  "El grande": ["El Grande"],
  "Wingspan": ["Wingspan"],
  "Wyrmspan": ["Wyrmspan Español"],
  "Barrage": ["Barrage"],
  "Orloj": ["Orloj"],
  "Art society": ["Art Society"],
  "Majesty": ["Majestya Corona del Reino"],
  "Caverna": ["Caverna"],
  "Fresco": ["Fresco"],
  "Bali": ["Bali"],
  "Celestia": ["Celestia"],
  "Trickerion": ["Trickerion"],
  "Ark nova": ["Ark Nova"],
  "Speakeasy": ["Speakeasy"],
  "Yokohama": ["Yokohama"],
  "Istambul big box": ["Istambul Big Box"],
  "Furnace": ["Furnace"],
  "Everdell": ["Everdell Edicion Coleccionista", "Everdell Edicion Esencial"],
  "Cyclades": ["Cyclades Edición Legendaria"],
  "They time you killed me": ["That Time You Killed Me"],
  "Cena en paris": ["Cena en Paris"],
  "Meepleland": ["Meeple Land"],
  "Raccoon tycoon": ["Raccoon Tycoon"],
  "Khora": ["Khora"],
  "Misterio de la abadía": ["El Misterio de la Abadia"],
  "Space base": ["Space Base"],
  "Architecs of the west kingdom": ["Architects Of The West Kingdom"],
  "The white castle": ["The White Castle"],
  "Crown of emana": ["Crown Of Emara"],
  "Bot factory": ["Bot Factory"],
  "Hansa teutónica": ["Hansa Teutonica Big Box"],
};

const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: errLogin } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (errLogin) {
  console.error("No pude entrar:", errLogin.message);
  process.exit(1);
}

const juegos = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from("juegos").select("id,nombre,visible,en_local,para_llevar,jugadores_min,jugadores_max,duracion_min,dificultad,edad_min,categoria").order("id").range(desde, desde + 999);
  if (error) throw error;
  juegos.push(...data);
  if (data.length < 1000) break;
}
const completo = (j) => ["jugadores_min", "jugadores_max", "duracion_min", "dificultad", "edad_min", "categoria"].every((k) => j[k] != null && j[k] !== "");

if (REVERTIR) {
  const r = JSON.parse(await readFile(RESPALDO, "utf8"));
  console.log(`Revertir: mostrar ${r.ocultados.length} juegos y quitar "para llevar" a ${r.marcados.length}.`);
  if (!APLICAR) {
    console.log("(Simulación: agrega --aplicar para hacerlo.)");
    process.exit(0);
  }
  for (const id of r.marcados) await db.from("juegos").update({ para_llevar: false, visible: r.eranVisibles.includes(id) }).eq("id", id);
  for (const id of r.ocultados) await db.from("juegos").update({ visible: true }).eq("id", id);
  console.log("Listo.");
  process.exit(0);
}

const porNombre = new Map();
for (const j of juegos) porNombre.set(norm(j.nombre), [...(porNombre.get(norm(j.nombre)) ?? []), j]);

const marcar = new Map(), yaEnLocal = [], noEncontrados = [];
for (const [pedido, nombres] of Object.entries(LISTA)) {
  const hallados = nombres.flatMap((n) => porNombre.get(norm(n)) ?? []);
  if (!hallados.length) noEncontrados.push(pedido);
  for (const j of hallados) {
    if (!j.en_local) marcar.set(j.id, j);
    else if (!yaEnLocal.includes(j)) yaEnLocal.push(j);
  }
}
const incompletos = [...marcar.values()].filter((j) => !completo(j));
const ocultar = juegos.filter((j) => j.visible && !j.en_local && !marcar.has(j.id));

console.log(`\nDe tu lista (${Object.keys(LISTA).length} entradas):`);
console.log(`  - ${marcar.size} juegos pasan a "para llevar" y visibles`);
console.log(`  - ${yaEnLocal.length} ya están en el local (no se tocan): ${yaEnLocal.map((j) => j.nombre).join(", ") || "ninguno"}`);
console.log(`  - ${incompletos.length} están incompletos y NO se pueden hacer visibles hasta completarlos: ${incompletos.map((j) => `${j.nombre} (id ${j.id})`).join(", ") || "ninguno"}`);
console.log(`  - ${noEncontrados.length} no están en la base: ${noEncontrados.join(", ") || "ninguno"}`);
console.log(`Se ocultan ${ocultar.length} juegos visibles que no están en el local ni en tu lista.`);

if (!APLICAR) {
  console.log("\n(Simulación: no se cambió nada. Agrega --aplicar para hacerlo.)");
  process.exit(0);
}

await writeFile(
  RESPALDO,
  JSON.stringify({ marcados: [...marcar.keys()], eranVisibles: [...marcar.values()].filter((j) => j.visible).map((j) => j.id), ocultados: ocultar.map((j) => j.id) }),
);
let fallos = 0;
for (const j of marcar.values()) {
  const { error } = await db.from("juegos").update({ para_llevar: true, en_local: false, visible: completo(j) }).eq("id", j.id);
  if (error) (fallos++, console.error(`Fallo en ${j.nombre}: ${error.message}`));
}
for (let i = 0; i < ocultar.length; i += 100) {
  const { error } = await db.from("juegos").update({ visible: false }).in("id", ocultar.slice(i, i + 100).map((j) => j.id));
  if (error) (fallos++, console.error(`Fallo al ocultar: ${error.message}`));
}
console.log(fallos ? `\nTerminó con ${fallos} fallos.` : "\nListo.");
