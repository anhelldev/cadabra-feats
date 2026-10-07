// Proyecto en la nube "cadabra test". La clave anon es pública por diseño: la seguridad está en RLS.
export const environment = {
  supabaseUrl: 'https://zvgyictvfrkgavtevobl.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Z3lpY3R2ZnJrZ2F2dGV2b2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxODcyMjIsImV4cCI6MjA3NTc2MzIyMn0.HL_MpPBOEJUur3ElOQduv9LlwX-zgJBmiV4Q8nTe4pQ',
  // Muestra en la ficha pública los videos y el crédito de BGG. Poner en false si la licencia de BGG no lo permite.
  bggPublico: true,
  // Solicitudes para jugar: prefijo de país que se antepone a los teléfonos escritos sin "+" (ej. '+58'; vacío = el
  // visitante debe escribir el código de país) y enlace opcional a la política de privacidad.
  solicitudes: { prefijo: '+58', privacidadUrl: '' },
};
