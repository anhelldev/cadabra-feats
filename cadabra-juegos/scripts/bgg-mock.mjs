// Servidor que imita la API XML de BGG para probar la función "bgg" sin gastar peticiones reales.
// Uso: node scripts/bgg-mock.mjs [puerto]   (por defecto 8787)
// Nombres especiales al buscar: "sinresultado" → vacío, "ambiguo" → dos resultados distintos,
// "limite" → responde 429 una vez, "gemelo" → siempre devuelve el mismo juego (para probar ids repetidos).
import { createServer } from "node:http";

const puerto = +process.argv[2] || 8787;
const porNombre = new Map();
const porId = new Map();
let siguiente = 1000;
let limiteEmitido = false;

const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const registrar = nombre => {
  if (!porNombre.has(nombre)) { const id = siguiente++; porNombre.set(nombre, id); porId.set(id, nombre); }
  return porNombre.get(nombre);
};
const item = (id, nombre, tipo = "boardgame") =>
  `<item type="${tipo}" id="${id}"><name type="primary" value="${esc(nombre)}"/><yearpublished value="${2000 + (id % 25)}"/></item>`;

function ficha(id) {
  const nombre = porId.get(id) ?? `Juego ${id}`;
  const exp = /expansion/i.test(nombre);
  return `<item type="${exp ? "boardgameexpansion" : "boardgame"}" id="${id}">
  <thumbnail>https://example.test/thumb/${id}.jpg</thumbnail><image>https://example.test/img/${id}.jpg</image>
  <name type="primary" sortindex="1" value="${esc(nombre)}"/><name type="alternate" sortindex="1" value="${esc(nombre)} (alt)"/>
  <description>Descripci&amp;oacute;n de ${esc(nombre)}.&amp;#10;Segunda l&amp;iacute;nea &amp;mdash; fin.</description>
  <yearpublished value="${2000 + (id % 25)}"/><minplayers value="2"/><maxplayers value="${3 + (id % 3)}"/>
  <playingtime value="60"/><minplaytime value="30"/><maxplaytime value="60"/><minage value="${8 + (id % 5)}"/>
  <link type="boardgamecategory" id="1" value="Card Game"/><link type="boardgamemechanic" id="2" value="Dice Rolling"/>
  <link type="boardgamedesigner" id="3" value="Diseñador ${id}"/><link type="boardgamepublisher" id="4" value="Editorial"/>
  <statistics page="1"><ratings><usersrated value="500"/><average value="7.25"/><averageweight value="${(1 + (id % 40) / 10).toFixed(2)}"/>
  <ranks><rank type="subtype" id="1" name="boardgame" value="${id}"/></ranks></ratings></statistics>
  <videos total="2"><video id="${id}1" title="Cómo se juega ${esc(nombre)}" category="instructional" language="Spanish" link="https://www.youtube.com/watch?v=v${id}" username="u" postdate="2021-01-01"/>
  <video id="${id}2" title="Reseña" category="review" language="English" link="https://www.youtube.com/watch?v=r${id}" username="u" postdate="2021-01-02"/></videos>
</item>`;
}

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const enviar = (codigo, cuerpo = "", cabeceras = {}) => { res.writeHead(codigo, { "Content-Type": "application/xml", ...cabeceras }); res.end(cuerpo); };
  if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) return enviar(401, "unauthorized");

  console.log(new Date().toISOString().slice(11, 19), url.pathname, url.searchParams.get("query") ?? url.searchParams.get("id"));
  if (url.pathname.endsWith("/search")) {
    const q = (url.searchParams.get("query") ?? "").trim();
    const tipos = (url.searchParams.get("type") ?? "boardgame").split(",");
    if (q.toLowerCase() === "limite" && !limiteEmitido) { limiteEmitido = true; return enviar(429, "slow down", { "Retry-After": "2" }); }
    let items = [];
    if (q.toLowerCase() === "sinresultado") items = [];
    else if (q.toLowerCase() === "ambiguo") items = [item(registrar("Ambiguo Uno"), "Ambiguo Uno"), item(registrar("Ambiguo Dos"), "Ambiguo Dos")];
    else if (q.toLowerCase() === "gemelo") items = [item(registrar("Gemelo"), "Gemelo")];
    else {
      const exp = /expansion|expansión/i.test(q);
      items = [item(registrar(q), q, exp ? "boardgameexpansion" : "boardgame")];
      // Un resultado relacionado para que las búsquedas del usuario muestren varios.
      items.push(item(registrar(`${q}: Duel`), `${q}: Duel`, tipos.includes("boardgame") ? "boardgame" : tipos[0]));
    }
    return enviar(200, `<?xml version="1.0" encoding="utf-8"?><items total="${items.length}">${items.join("")}</items>`);
  }
  if (url.pathname.endsWith("/thing")) {
    const ids = (url.searchParams.get("id") ?? "").split(",").map(Number).filter(Boolean);
    if (ids.length > 20) return enviar(400, "too many ids");
    return enviar(200, `<?xml version="1.0" encoding="utf-8"?><items termsofuse="x">${ids.map(ficha).join("")}</items>`);
  }
  enviar(404, "no");
}).listen(puerto, () => console.log(`BGG mock en http://localhost:${puerto}/xmlapi2`));
