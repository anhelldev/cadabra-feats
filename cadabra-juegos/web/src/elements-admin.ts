import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { AdminElement } from './app/admin/admin-element';
import { FRAGMENTO_INICIAL, NAVEGACION, NavegacionElemento, URL_RECUPERACION } from './app/core/navegacion';
import { URL_BASE } from './app/core/recursos';
import { TEMA_POR_DEFECTO } from './app/core/tema';
import { cargarFuentes } from './elements-comun';

cargarFuentes();

// Se lee ahora, antes de que el cliente de Supabase procese (y borre) el fragmento del enlace de recuperación.
const fragmento = location.hash;

const app = await createApplication({
  providers: [
    provideBrowserGlobalErrorListeners(),
    // El script vive en <sitio>/elements/admin/: dos niveles arriba están las imágenes (img/…).
    { provide: URL_BASE, useValue: new URL('../../', import.meta.url).href },
    { provide: TEMA_POR_DEFECTO, useValue: 'claro' },
    { provide: NAVEGACION, useValue: new NavegacionElemento(null) },
    { provide: FRAGMENTO_INICIAL, useValue: fragmento },
    // El correo de recuperar contraseña vuelve a la misma página de WordPress (debe estar en las Redirect URLs de Supabase).
    { provide: URL_RECUPERACION, useValue: location.origin + location.pathname },
  ],
});

if (!customElements.get('cadabra-admin')) {
  customElements.define('cadabra-admin', createCustomElement(AdminElement, { injector: app.injector }));
}
