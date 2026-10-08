import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { cargarFuentes } from './elements-comun';
import { Catalogo } from './app/catalogo/catalogo';
import { TorneosPublico } from './app/torneos/torneos-publico';
import { OPCIONES_SUPABASE } from './app/core/supabase';
import { URL_BASE } from './app/core/recursos';
import { TEMA_POR_DEFECTO } from './app/core/tema';

cargarFuentes();

const app = await createApplication({
  providers: [
    provideBrowserGlobalErrorListeners(),
    // El script vive en <sitio>/elements/publico/: dos niveles arriba están las imágenes (img/…).
    { provide: URL_BASE, useValue: new URL('../../', import.meta.url).href },
    { provide: TEMA_POR_DEFECTO, useValue: 'claro' },
    { provide: OPCIONES_SUPABASE, useValue: { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } },
  ],
});

for (const [etiqueta, componente] of [['cadabra-catalogo', Catalogo], ['cadabra-torneos', TorneosPublico]] as const) {
  if (!customElements.get(etiqueta)) customElements.define(etiqueta, createCustomElement(componente, { injector: app.injector }));
}
