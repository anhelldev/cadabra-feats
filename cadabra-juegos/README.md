# Catálogo de juegos de Cadabra

Sitio estático: no tiene build ni dependencias.

- `index.html`: la web (filtros, lista y ficha de cada juego).
- `juegos.json`: los datos de los 455 juegos.
- `portadas/`: imágenes de portada.

## Portadas

Copia la imagen en `portadas/` con el `slug` del juego como nombre:

    portadas/catan.jpg
    portadas/7-wonders-duel.webp

Se aceptan `.webp`, `.jpg` y `.png` (se buscan en ese orden). El nombre exacto
de cada juego está en `portadas/nombres.txt`. Si un juego no tiene imagen, la
ficha muestra una caja genérica.

También puedes poner una URL o ruta en el campo `portada` del juego en
`juegos.json`; ese campo tiene prioridad sobre la carpeta.

Tamaño recomendado: unos 600 px de ancho y menos de 150 KB.

## Probar en local

    npx serve .

Hay que usar un servidor: abriendo `index.html` con doble clic el navegador
bloquea la carga de `juegos.json`.

## Subir a Vercel

Con Git (recomendado, cada push vuelve a desplegar):

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel: Add New > Project, importa el repositorio.
3. Framework Preset: Other. Sin build command ni output directory.

Con la CLI:

    npx vercel          # vista previa
    npx vercel --prod   # producción

## Editar datos

Campos de cada juego en `juegos.json`: `nombre`, `jugadoresMin`, `jugadoresMax`,
`duracionMin`, `dificultad` (1 a 5), `edadMin`, `categoria`, `descripcion`,
`tips` (lista), `portada`, `slug` y `revisar` (`true` si los datos son estimados).

## Base de datos (Supabase)

Esquema en `supabase/migrations/`, datos iniciales en `supabase/seed.sql`.

- `juegos`: catálogo. `visible` decide si sale en la lista pública; la base no deja
  marcar visible un juego al que le falten jugadores, duración, dificultad, edad o
  categoría. `origen` es `catalogo` (de `juegos.json`) o `tienda` (importado de la web,
  entra oculto y sin esos datos).
- `categorias`: nombre y color.
- `admins`: usuarios de Supabase Auth que pueden ver y editar todo.
- Bucket `portadas` (público) para subir imágenes desde el panel.

`scripts/estimaciones.csv` tiene datos estimados (jugadores, duración mín./máx.,
dificultad, edad, categoría) para los productos importados de la tienda; entran con
`revisar = true` y ocultos. Una fila con los campos vacíos deja el juego sin datos.

`en_local` indica si el juego está en el local; se marca con `scripts/juegos-local.csv`
(cruce con la página "Juegos Local" de la web, por slug; los marcados como dudosos se
deciden a mano en el panel). `scripts/juegos-nuevos.csv` tiene los juegos de esa página
que no existían (origen `local`). Los juegos del local con todos los datos entran visibles.

Regenerar el seed (descarga la tienda y la cruza con `juegos.json`):

    node scripts/tienda.mjs
    node scripts/generar-seed.mjs

Local (Docker): `supabase start`, `supabase db reset`. Los puertos son 553xx
para no chocar con otros proyectos.

Subir a un proyecto de Supabase (migraciones y datos iniciales; `seed.sql` no incluye usuarios):

    supabase login
    supabase link --project-ref <ref>
    supabase db push --include-seed

Dar permisos de admin a un usuario (después de crearlo en Authentication):

    insert into admins select id from auth.users where email = 'tu@correo.com';

## App Angular (`web/`)

Catálogo público en `/` y panel de administración en `/admin` (buscador, filtros,
interruptor de visible y editor con subida de portadas). Requiere Node 24 (`nvm use`).

    supabase start            # base local (puertos 553xx)
    cd web && npm install && npm start   # http://localhost:4200

En local, después de `supabase db reset`, crea el usuario admin de prueba (solo local, nunca en la nube):

    docker exec -i supabase_db_cadabra-juegos psql -U postgres < supabase/admin-local.sql

Para producción, rellena `web/src/environments/environment.prod.ts` con la URL y la
clave publicable del proyecto de Supabase y ejecuta `npm run build` (salida en `web/dist/web/browser`).

## Publicación

- Base de datos: Supabase, proyecto "cadabra test" (`zvgyictvfrkgavtevobl`).
- App: Vercel, proyecto `cadabra-juegos` → https://cadabra-juegos.vercel.app
  (catálogo en `/`, panel en `/admin`). Configuración en `web/vercel.json`.

Publicar una nueva versión (desde `web/`):

    npx vercel deploy --prod

## BoardGameGeek (BGG)

La función Edge `supabase/functions/bgg` habla con la API XML de BGG. El token vive solo en el servidor
(secreto `BGG_TOKEN`), nunca en el navegador, y solo los admins pueden llamarla.

- **Agregar juego** (panel): elige tipos de "thing" (juego, expansión, accesorio, videojuego, rol), busca por nombre
  y elige un resultado; se abre el formulario con los datos de BGG. La búsqueda se hace al pulsar Buscar, no al teclear.
- **Sincronizar BGG** (panel): recorre los juegos pendientes en tandas de 6 (~15 s cada una, sin riesgo de timeout),
  con pausa de 2 s entre peticiones a BGG y espera automática si BGG pide ir más despacio. Se puede pausar y continuar.
  Solo reemplaza datos vacíos o estimados (`revisar`); lo revisado a mano no se toca. Vincula solo si hay un único
  resultado con el mismo nombre; si no, queda "por decidir" y se elige en el editor.
- Guarda jugadores, duración (rango), edad, dificultad (peso 1–5), categoría, portada (si no tenía) y hasta 12 videos
  (español primero), más año, nota, diseñadores y mecánicas en `bgg_datos`.
- `bggPublico` en `web/src/environments/*.ts` controla si la ficha pública muestra videos y el crédito de BGG.

Configurar:

    # supabase/functions/.env  (no se sube a git)
    BGG_TOKEN=tu-token

    supabase secrets set --env-file supabase/functions/.env
    supabase functions deploy bgg

Probar en local sin gastar peticiones reales: `node scripts/bgg-mock.mjs` y servir con
`BGG_BASE=http://host.docker.internal:8787/xmlapi2` en un env-file. El mapeo de datos tiene prueba
(`supabase/functions/bgg/mapeo.test.mjs`).

## Portadas en tu propio almacenamiento

`scripts/portadas-storage.mjs` copia las portadas que apuntan a la tienda o a BGG al bucket `portadas` de Supabase,
achicadas a webp de ~600 px (de ~1-3 MB a ~50 KB), y actualiza `juegos.portada`. Entra con tu usuario admin (las mismas
reglas del panel, sin llaves privilegiadas). Es seguro repetirlo: solo toca las que aún apuntan fuera del bucket, no pisa
una portada que el admin haya cambiado mientras tanto, y guarda las URLs originales en `scripts/portadas-respaldo.jsonl`.

    cd scripts && npm install
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
      node portadas-storage.mjs --seco          # simulación: no escribe nada
    ... node portadas-storage.mjs               # copia real (opciones: --limite N, --visibles, --concurrencia N)
    ... node portadas-storage.mjs --revertir    # deshace la copia usando el respaldo de URLs originales

## Recuperar la contraseña del admin

En la pantalla de entrada, "¿Olvidaste tu contraseña?" envía un correo con un enlace a `/admin/restablecer`, donde se elige la
nueva contraseña (mínimo 8 caracteres). Para que el enlace del correo vuelva a la web y no a `localhost`, en Supabase
(Authentication → URL Configuration) hay que poner:

- **Site URL:** `https://cadabra-juegos.vercel.app`
- **Redirect URLs:** `https://cadabra-juegos.vercel.app/**` y, para desarrollo, `http://localhost:4200/**`

El correo lo envía el servicio incluido de Supabase, que tiene un límite bajo de envíos por hora; si se necesitan más,
se configura un SMTP propio en Authentication → SMTP Settings.

## Pie de página y crédito de BGG

`web/src/app/shared/pie.ts` muestra "Developed by anhelldev" (enlace a https://anhelldev.github.io/) y el logo
"Powered by BGG" (enlace a https://boardgamegeek.com), en el catálogo público y en el panel. El logo es una copia local
en `web/public/img/powered-by-bgg.png` (7 KB). En el catálogo público el logo solo aparece si
`bggPublico` está en `true` en `web/src/environments/*.ts`, junto con los videos y el crédito de las fichas.

## Íconos de la web

El ícono de la pestaña sale del logo de Cadabra (`web/public/img/logo-cadabra.png`, tomado de juegoscadabra.com). El sitio
de la tienda no tiene un `.ico`, solo PNG, así que `scripts/generar-iconos.mjs` genera `favicon.ico` (16, 32 y 48 px),
`img/icon-192.png` e `img/apple-touch-icon.png`. Para regenerarlos: `cd scripts && node generar-iconos.mjs`.

## Solicitudes para jugar

En la ficha de un juego que **no está en el local** (`en_local` en falso) aparece "Solicitar para jugar": el visitante deja su
nombre, teléfono (se guarda en formato internacional, ej. `+584121234567`), correo y nota opcionales, y marca el consentimiento.
Cualquiera puede enviar una solicitud, pero **solo los admins pueden leerlas** (tabla `solicitudes`, con RLS).

- **Panel → pestaña Solicitudes (`/admin/solicitudes`):** tabla con contadores y filtros (pendientes, listas para avisar, contactadas), fecha de
  solicitud, contacto y nota. "WhatsApp"
  abre WhatsApp con un mensaje ya escrito (editable allí): *"Hola {nombre}, somos Cadabra… el juego «{juego}» que solicitaste para
  jugar en el local estará disponible. Un encargado se pondrá en contacto contigo para coordinar qué día podrás jugarlo."*
  El texto está en `mensajeWhatsapp()` de `web/src/app/core/solicitudes.ts`.
- Los juegos que ya están en el local con solicitudes pendientes salen primero, resaltados. Al marcar un juego como "en el local",
  el panel avisa cuántas personas lo pidieron.
- Límites contra abuso (en la base de datos): 5 solicitudes por teléfono por hora, 10 pendientes por teléfono, 300 por hora en total,
  y no se repite el mismo juego pendiente de la misma persona. El formulario trae además un campo trampa para bots.
- Al fusionar duplicados las solicitudes pasan al juego que se conserva; si se borra un juego, sus solicitudes se conservan con el
  nombre guardado ("juego eliminado").
- `solicitudes.prefijo` en `web/src/environments/*.ts` (ej. `'+58'`) permite que el visitante escriba el número sin código de país;
  `solicitudes.privacidadUrl` agrega un enlace a tu política de privacidad junto al consentimiento.
