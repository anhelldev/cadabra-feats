const MAX_BYTES = 480 * 1024; // el bucket rechaza archivos de más de 500 KB

/** Achica una imagen en el navegador (ancho máximo y webp) para que quepa en el límite del almacenamiento. */
export async function reducirImagen(archivo: File, anchoMax = 1400): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) throw new Error('Elige un archivo de imagen (jpg, png o webp).');
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new Error('No pude leer esa imagen. Prueba con otra en jpg, png o webp.');
  }
  const escala = Math.min(1, anchoMax / imagen.width);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();

  const aBlob = (calidad: number) => new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/webp', calidad));
  for (let calidad = 0.85; calidad >= 0.4; calidad -= 0.1) {
    const blob = await aBlob(calidad);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('La imagen sigue pesando demasiado. Prueba con una más pequeña.');
}
