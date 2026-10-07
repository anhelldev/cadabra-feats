-- "Para llevar": juegos que no están en el local pero se pueden llevar para jugarlos si alguien los pide.
-- Es distinto de "en el local" (ya está ahí) y de un juego solo visible (solo se puede solicitar).
alter table public.juegos add column para_llevar boolean not null default false;
alter table public.juegos add constraint llevar_no_en_local check (not (para_llevar and en_local));
