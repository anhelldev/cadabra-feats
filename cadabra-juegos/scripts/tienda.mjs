// Descarga los productos de la tienda (WooCommerce Store API, pública) y los cruza con juegos.json.
// Escribe scripts/tienda.json (productos) y scripts/coincidencias.json (mejor producto para cada juego).
// Uso: node scripts/tienda.mjs
import { readFile, writeFile } from "node:fs/promises";

const API = "https://juegoscadabra.com/wp-json/wc/store/v1/products";
const aqui = ruta => new URL(ruta, import.meta.url);

const RUIDO = /\b(juego de mesa|juego de cartas|edicion|espanol|nueva|version|el juego|board game)\b/g;
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&[a-z#0-9]+;/g, " ").replace(RUIDO, " ").replace(/[^a-z0-9]+/g, " ").trim();
const palabras = s => new Set(norm(s).split(" ").filter(Boolean));
const textoPlano = html => (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function puntuar(juego, producto) {
  const a = norm(juego), b = norm(producto);
  if (a === b) return 1;
  const pa = palabras(juego), pb = palabras(producto);
  const comunes = [...pa].filter(w => pb.has(w)).length;
  if (!comunes) return 0;
  // Todas las palabras del juego están en el producto: penaliza productos con muchas palabras extra (expansiones).
  const cubre = comunes / pa.size, extra = comunes / pb.size;
  return cubre * 0.7 + extra * 0.3 - (cubre < 1 ? 0.2 : 0);
}

async function descargar() {
  const todos = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${API}?per_page=100&page=${page}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} en la página ${page}`);
    todos.push(...await r.json());
    if (page >= +r.headers.get("x-wp-totalpages")) return todos;
  }
}

const juegos = JSON.parse(await readFile(aqui("../juegos.json"), "utf8"));
const tienda = (await descargar()).map(p => ({
  id: p.id, nombre: textoPlano(p.name), slug: p.slug, url: p.permalink, imagen: p.images?.[0]?.src ?? null,
  descripcion: textoPlano(p.short_description || p.description).slice(0, 400) || null, enStock: p.is_in_stock,
}));
console.log(`${tienda.length} productos en la tienda`);

const informe = juegos.map(j => {
  let mejor = null, nota = 0;
  for (const p of tienda) {
    const n = puntuar(j.nombre, p.nombre);
    if (n > nota) { nota = n; mejor = p; }
  }
  const estado = nota >= 0.95 ? "seguro" : nota >= 0.75 ? "probable" : "sin";
  return { id: j.id, juego: j.nombre, tiendaId: mejor?.id ?? null, producto: mejor?.nombre ?? null, nota: +nota.toFixed(2), estado };
});

const cuenta = e => informe.filter(x => x.estado === e).length;
console.log(`seguro: ${cuenta("seguro")}  probable: ${cuenta("probable")}  sin coincidencia: ${cuenta("sin")}`);
await writeFile(aqui("tienda.json"), JSON.stringify(tienda, null, 1));
await writeFile(aqui("coincidencias.json"), JSON.stringify(informe, null, 1));
