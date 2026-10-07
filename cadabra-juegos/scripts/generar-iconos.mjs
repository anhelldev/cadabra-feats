// Genera los íconos de la web a partir del logo de Cadabra (web/public/img/logo-cadabra.png):
//   favicon.ico (16, 32 y 48 px), img/icon-192.png y img/apple-touch-icon.png (180 px, con fondo crema).
// Uso (desde scripts/, con Node 24):  node generar-iconos.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publico = new URL("../web/public/", import.meta.url);
const logo = new URL("img/logo-cadabra.png", publico);
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };
const CREMA = { r: 250, g: 240, b: 225, alpha: 1 }; // #FAF0E1, el fondo de la web de Cadabra

/** Logo centrado en un lienzo cuadrado de `lado` px, con `margen` (0 a 0.5) de aire alrededor. */
const cuadrado = (lado, fondo = TRANSPARENTE, margen = 0.04) => {
  const interior = Math.round(lado * (1 - margen * 2));
  return sharp(fileURLToPath(logo))
    .resize({ width: interior, height: interior, fit: "contain", background: TRANSPARENTE })
    .extend({
      top: Math.floor((lado - interior) / 2),
      bottom: Math.ceil((lado - interior) / 2),
      left: Math.floor((lado - interior) / 2),
      right: Math.ceil((lado - interior) / 2),
      background: fondo,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
};

/** .ico con una imagen PNG por tamaño (lo aceptan todos los navegadores actuales y Windows). */
function armarIco(imagenes) {
  const cabecera = Buffer.alloc(6 + imagenes.length * 16);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: ícono
  cabecera.writeUInt16LE(imagenes.length, 4);
  let desplazamiento = cabecera.length;
  imagenes.forEach(({ lado, datos }, i) => {
    const e = 6 + i * 16;
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, e);
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, e + 1);
    cabecera.writeUInt8(0, e + 2); // sin paleta
    cabecera.writeUInt8(0, e + 3);
    cabecera.writeUInt16LE(1, e + 4); // planos
    cabecera.writeUInt16LE(32, e + 6); // bits por píxel
    cabecera.writeUInt32LE(datos.length, e + 8);
    cabecera.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += datos.length;
  });
  return Buffer.concat([cabecera, ...imagenes.map((i) => i.datos)]);
}

await mkdir(new URL("img/", publico), { recursive: true });
const tamanos = [16, 32, 48];
const imagenes = await Promise.all(tamanos.map(async (lado) => ({ lado, datos: await cuadrado(lado, TRANSPARENTE, 0.02) })));
await writeFile(new URL("favicon.ico", publico), armarIco(imagenes));
await writeFile(new URL("img/icon-192.png", publico), await cuadrado(192, TRANSPARENTE, 0.04));
await writeFile(new URL("img/apple-touch-icon.png", publico), await cuadrado(180, CREMA, 0.12));
console.log(`favicon.ico (${tamanos.join(", ")} px), img/icon-192.png e img/apple-touch-icon.png generados en web/public/`);
