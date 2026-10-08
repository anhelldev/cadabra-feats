-- Imagen promocional opcional por torneo (se guarda en el bucket público "portadas", carpeta torneos/).
alter table public.torneos add column imagen text check (imagen is null or imagen ~ '^https?://');

-- La página pública de un torneo muestra el juego que se va a jugar aunque ese juego esté oculto del catálogo.
create policy "juegos de torneos publicados" on public.juegos for select to anon, authenticated
  using (exists (select 1 from public.torneos t where t.juego_id = juegos.id and t.estado <> 'borrador'));
