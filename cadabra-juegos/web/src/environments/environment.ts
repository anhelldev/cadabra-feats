// Supabase local (supabase start). La clave publicable es pública por diseño: la seguridad está en RLS.
export const environment = {
  supabaseUrl: 'http://127.0.0.1:55321',
  supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  // Muestra en la ficha pública los videos y el crédito de BGG. Poner en false si la licencia de BGG no lo permite.
  bggPublico: true,
  // Solicitudes para jugar: prefijo de país que se antepone a los teléfonos escritos sin "+" (ej. '+58'; vacío = el
  // visitante debe escribir el código de país) y enlace opcional a la política de privacidad.
  solicitudes: { prefijo: '+58', privacidadUrl: '' },
};
