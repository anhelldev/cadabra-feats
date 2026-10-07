-- en_local: el juego está físicamente en el local para jugar allí.
-- origen 'local': juegos dados de alta desde la página "Juegos Local" de la web.
alter table public.juegos
  add column en_local boolean not null default false,
  drop constraint juegos_origen_check,
  add constraint juegos_origen_check check (origen in ('catalogo', 'tienda', 'local'));
