# Supabase — BeatGuesser

Esquema de base de datos para BeatGuesser: canciones, picks diarios, resultados y partidas infinitas.

## Contenido

| Archivo | Descripción |
|---------|-------------|
| `migrations/20260823120000_init.sql` | Tablas, índices, RLS |
| `migrations/20260823214416_daily_picker.sql` | `pick_rules`, picker, cron 00:05 ART |

### Tablas

- **songs** — catálogo (`popularity` = Spotify 0–100)
- **pick_rules** — umbrales de popularidad y cooldown por pool
- **daily_picks** — canción ya elegida por fecha y `pool` (hoy se leyó ayer)
- **daily_results** / **infinite_runs** — scores autenticados (futuro)

### Niveles de dificultad (`pool`)

`easy` · `medium` · `hard` · `expert` · `impossible`

## Cómo aplicar el esquema

### Opción A — Supabase CLI (recomendado)

1. Instala la [Supabase CLI](https://supabase.com/docs/guides/cli).
2. En la raíz del proyecto, vincula tu proyecto remoto:

   ```bash
   supabase login
   supabase link --project-ref <TU_PROJECT_REF>
   ```

3. Aplica las migraciones:

   ```bash
   supabase db push
   ```

   Para desarrollo local con Docker:

   ```bash
   supabase start
   supabase db reset
   ```

### Opción B — Editor SQL del dashboard

1. Abre tu proyecto en [supabase.com](https://supabase.com/dashboard).
2. Ve a **SQL Editor** → **New query**.
3. Copia y pega **en orden** `migrations/20260823120000_init.sql` y `migrations/20260823214416_daily_picker.sql`.
4. Ejecuta la consulta (**Run**).

## Políticas RLS

| Tabla | `anon` | `authenticated` |
|-------|--------|-------------------|
| `songs` | SELECT | SELECT |
| `pick_rules` | SELECT | SELECT |
| `daily_picks` | SELECT | SELECT |
| `daily_results` | — | INSERT / SELECT (solo filas propias) |
| `infinite_runs` | — | INSERT / SELECT (solo filas propias) |

Las escrituras en `songs` y `daily_picks` quedan reservadas al rol `service_role` (panel o backend).

## Notas

- `popularity` en `songs` es el score de Spotify (0–100). El cron `beatguesser-rotate-daily` corre `private.rotate_daily_picks()` a las 00:05 ART.
- `daily_results` usa índices únicos parciales: uno por `(date, pool, user_id)` y otro por `(date, pool, device_id)`.
- No se incluyen funciones `SECURITY DEFINER` en el esquema `public`.
