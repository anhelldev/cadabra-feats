// Los @font-face no funcionan dentro de un shadow root: las fuentes se cargan una vez en el documento.
const FUENTES = [
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap',
  'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap',
];

export function cargarFuentes(): void {
  for (const href of FUENTES) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const enlace = document.createElement('link');
    enlace.rel = 'stylesheet';
    enlace.href = href;
    document.head.append(enlace);
  }
}
