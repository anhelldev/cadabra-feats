import { Celda, COLUMNAS } from './masivo';

const ANCHOS: Record<string, number> = {
  id: 7, nombre: 32, categoria: 16, descripcion: 60, tips: 40, portada: 40, slug: 26, origen: 12, actualizado: 26, visible: 9, en_local: 11, para_llevar: 14, revisar: 9,
};

/** Descarga la hoja como archivo .xlsx. Las librerías de Excel se cargan solo al usarlas, para no pesar en el panel. */
export async function descargarHoja(filas: Celda[][], archivo: string): Promise<void> {
  const { default: escribir } = await import('write-excel-file/universal');
  const datos = filas.map((fila, i) =>
    fila.map((v) => {
      if (i === 0) return { value: String(v), fontWeight: 'bold' as const, backgroundColor: '#e3d3e6' };
      if (v == null) return null;
      return typeof v === 'string' && (v.includes('\n') || v.length > 50) ? { value: v, wrap: true, alignVertical: 'top' as const } : (v as string | number);
    }),
  );
  const blob = await escribir(datos as never, { columns: COLUMNAS.map((c) => ({ width: ANCHOS[c.clave] ?? 14 })) }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lee la primera hoja de un .xlsx. */
export async function leerArchivo(archivo: File): Promise<Celda[][]> {
  const { readSheet } = await import('read-excel-file/universal');
  return (await readSheet(archivo)) as Celda[][];
}
