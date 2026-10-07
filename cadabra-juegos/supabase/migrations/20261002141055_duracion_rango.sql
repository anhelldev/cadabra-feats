-- duracion_min pasa a ser el mínimo de un rango; duracion_max es opcional (null = duración única).
alter table public.juegos
  add column duracion_max smallint,
  add constraint duracion_rango check (duracion_max >= duracion_min);
