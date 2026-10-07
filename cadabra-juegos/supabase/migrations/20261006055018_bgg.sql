-- Datos de BoardGameGeek (BGG). La función Edge "bgg" rellena estas columnas.
-- bgg_estado: pendiente (sin intentar) | ok (vinculado) | dudoso (hay candidatos, decide el admin)
--             | sin_resultado (BGG no encontró nada) | omitido (el admin no quiere vincularlo)
alter table public.juegos
  add column bgg_id bigint unique,
  add column bgg_tipo text,
  add column bgg_estado text not null default 'pendiente'
    check (bgg_estado in ('pendiente', 'ok', 'dudoso', 'sin_resultado', 'omitido')),
  add column bgg_candidatos jsonb not null default '[]',
  add column bgg_datos jsonb,
  add column videos jsonb not null default '[]',
  add column portada_origen text check (portada_origen in ('tienda', 'bgg', 'manual')),
  add column bgg_sync timestamptz;

-- Los juegos que ya tienen portada vienen de la tienda o del catálogo original.
update public.juegos set portada_origen = 'tienda' where portada is not null;
-- Un juego ya vinculado no se vuelve a buscar.
update public.juegos set bgg_estado = 'ok' where bgg_id is not null;

-- origen 'bgg': juegos agregados desde el buscador de BGG en el panel.
alter table public.juegos
  drop constraint juegos_origen_check,
  add constraint juegos_origen_check check (origen in ('catalogo', 'tienda', 'local', 'bgg'));

create index juegos_bgg_estado_idx on public.juegos (bgg_estado);
