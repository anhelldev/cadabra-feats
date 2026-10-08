import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { Catalogo } from './app/catalogo/catalogo';
import { OPCIONES_SUPABASE } from './app/core/supabase';
import { TEMA_POR_DEFECTO } from './app/core/tema';

// Los @font-face no funcionan dentro de un shadow root: las fuentes se cargan una vez en el documento.
const FUENTES = [
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap',
  'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap',
];
for (const href of FUENTES) {
  if (document.querySelector(`link[href="${href}"]`)) continue;
  const enlace = document.createElement('link');
  enlace.rel = 'stylesheet';
  enlace.href = href;
  document.head.append(enlace);
}

const app = await createApplication({
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: TEMA_POR_DEFECTO, useValue: 'claro' },
    { provide: OPCIONES_SUPABASE, useValue: { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } },
  ],
});

if (!customElements.get('cadabra-catalogo')) {
  customElements.define('cadabra-catalogo', createCustomElement(Catalogo, { injector: app.injector }));
}
