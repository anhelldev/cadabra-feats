-- Solo para desarrollo local (supabase db reset). No ejecutar en la nube.
-- Usuario de prueba: admin@cadabra.test / cadabra-local-123
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated',
  'authenticated', 'admin@cadabra.test', crypt('cadabra-local-123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@cadabra.test","email_verified":true}',
  'email', now(), now(), now());

insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');
