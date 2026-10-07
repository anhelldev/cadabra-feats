#!/bin/bash
# Busca y agrega juegos desde BGG en la nube pidiendo las credenciales del admin.
# La contraseña se escribe sin mostrarse y no se guarda en ningún archivo. Uso: ./agregar-bgg-nube.sh [--crear]
cd "$(dirname "$0")" || exit 1
export SUPABASE_URL="https://zvgyictvfrkgavtevobl.supabase.co"
# Llave publicable (anon): es pública por diseño, la seguridad está en las reglas de la base de datos.
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Z3lpY3R2ZnJrZ2F2dGV2b2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxODcyMjIsImV4cCI6MjA3NTc2MzIyMn0.HL_MpPBOEJUur3ElOQduv9LlwX-zgJBmiV4Q8nTe4pQ"
read -r -p "Correo del admin: " ADMIN_EMAIL
read -r -s -p "Contraseña del admin (no se ve al escribir): " ADMIN_PASSWORD
echo
export ADMIN_EMAIL ADMIN_PASSWORD
node agregar-bgg.mjs "$@"
