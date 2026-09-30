# ¿Quién es quién? · Día del Niño

Versión portable para Next.js + Vercel + Supabase. El juego conserva el diseño animado y el flujo de la versión original, pero cambia el almacenamiento a un bucket privado de Supabase.

## Seguridad incluida

- Las fotos se guardan en el bucket privado `photos`.
- Las tablas no se exponen al navegador: RLS está activado y no hay políticas para `anon` ni `authenticated`.
- Solo las rutas de servidor de Next.js usan `SUPABASE_SECRET_KEY` (o la antigua `SUPABASE_SERVICE_ROLE_KEY` como respaldo).
- La cabina del organizador usa Supabase Auth y compara el correo autenticado con `ORGANIZER_EMAIL`.
- Cada sala nueva guarda el `owner_id` de la cuenta autenticada; otro usuario no puede editarla aunque conozca el código.
- El navegador recibe una URL del mismo sitio firmada por HMAC y válida durante un máximo de diez minutos.
- El endpoint de fotos valida la firma, descarga desde Supabase y responde con caché privada.
- El navegador solo usa la clave publishable de Supabase para iniciar sesión; nunca recibe la secret key.

La URL temporal sigue siendo un permiso de tipo “quien la tiene puede verla” hasta que expire; por eso no se deben publicar capturas de las URLs ni las claves de Vercel.

## 1. Crear Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com/).
2. En **Authentication > Users**, selecciona **Add user** y crea tu cuenta de organizador con tu correo y contraseña. Si aparece la opción **Auto Confirm User**, actívala. No necesitas crear una pantalla pública de registro.
   Opcionalmente, en **Authentication > Settings** desactiva los registros públicos para que nadie pueda crear cuentas nuevas.
3. Abre **SQL Editor** y ejecuta todo el contenido de `supabase/schema.sql`.
4. En **Project Settings > API Keys**, copia la URL del proyecto, la **Secret key** (`sb_secret_...`) y la clave publishable. Si tu proyecto todavía solo muestra las claves antiguas, puedes usar `service_role` como respaldo del lado del servidor.

## 2. Configurar localmente

```bash
cp .env.example .env.local
```

Edita `.env.local`:

```env
SUPABASE_URL=https://tu-project-ref.supabase.co
SUPABASE_SECRET_KEY=tu_secret_key
PHOTO_SIGNING_SECRET=una-cadena-aleatoria-de-32-o-mas-caracteres
NEXT_PUBLIC_SUPABASE_URL=https://tu-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
ORGANIZER_EMAIL=tu-correo@example.com
# Opcional: también puedes restringir por el UUID de tu usuario.
# ORGANIZER_USER_ID=uuid-de-tu-usuario
```

Para generar el secreto de fotos puedes ejecutar:

```bash
openssl rand -base64 32
```

Instala y prueba:

```bash
npm install
npm run dev
```

## 3. Subir a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Preparar juego del Dia del Nino con Supabase"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

No subas `.env.local`. El `.gitignore` ya lo excluye.

## 4. Publicar en Vercel

1. En Vercel selecciona **Add New > Project** y conecta el repositorio.
2. Framework: **Next.js**.
3. Agrega estas variables en **Settings > Environment Variables** para Production, Preview y Development:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (marcada como Secret)
   - `PHOTO_SIGNING_SECRET` (marcada como secret)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `ORGANIZER_EMAIL`
4. Haz deploy.

La secret key nunca debe aparecer en el navegador ni en un repositorio público. Si usas la clave antigua `service_role` y se filtra, rótala inmediatamente desde Supabase. Después de cambiar variables, haz un nuevo deploy.

### Salas creadas antes de activar Auth

Las salas creadas con una versión anterior no tienen `owner_id`. Para simplificar la migración, crea una sala nueva después de iniciar sesión. Si necesitas conservar una sala anterior, copia el UUID de tu usuario desde **Authentication > Users** y actualiza esa sala desde SQL Editor:

```sql
update public.games
set owner_id = 'UUID-DE-TU-USUARIO'
where code = 'ABC123';
```

## 5. Borrar fotos después del evento

El proyecto incluye un script de limpieza. Ejecútalo desde tu máquina, nunca desde el navegador:

```bash
SUPABASE_URL="https://tu-project-ref.supabase.co" \
SUPABASE_SECRET_KEY="tu_secret_key" \
GAME_CODE="ABC123" \
node scripts/purge-game.mjs
```

Esto elimina las fotos del bucket y la sala, incluyendo jugadores y votos por las relaciones `on delete cascade`.

## Estructura importante

- `app/api/game/route.ts`: salas, participantes, votos y controles del presentador.
- `app/api/photo/route.ts`: descarga protegida de fotos desde el bucket privado.
- `lib/photo-security.ts`: firma y expiración de URLs temporales.
- `lib/supabase-admin.ts`: cliente Supabase exclusivo del servidor.
- `supabase/schema.sql`: tablas, índices, RLS y bucket privado.
