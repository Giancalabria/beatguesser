# BeatGuesser

Juego de adivinar canciones con previews de iTunes. Interfaz en español, estilo oscuro neón.

## Instalación

```bash
npm install
npm run dev
```

Abrí [http://localhost:5173](http://localhost:5173) en el navegador.

## Modos

### Diario
Una canción por dificultad cada día (zona horaria Argentina/Buenos Aires). Los intentos son ilimitados: al llegar al fragmento de 15 segundos podés seguir respondiendo o rendirte. Al acertar o rendirte, esa dificultad queda marcada hasta mañana.

**Dificultades:** Fácil, Medio, Difícil, Experto, Imposible.

### Infinito
Misma pantalla de juego con 3 vidas. Cada fallo resta una vida; cada acierto suma al puntaje. La dificultad queda fija durante la partida.

## Mecánica

- Escuchás fragmentos de 0.5s → 1s → 3s → 7s → 15s.
- El botón de play repite el fragmento actual.
- Saltar o errar avanza al siguiente fragmento.
- En el modo diario, el autocompletado está activo en todas las dificultades.
- En el modo infinito, el autocompletado está activo en Fácil y Medio.
- Las sugerencias consultan el catálogo completo de Spotify después de escribir 2 caracteres; si la API no está disponible, se usa el catálogo local.

## Build

```bash
npm run build
npm run preview
```

## Daily pick (Spotify)

La CLI de Supabase ya no tiene `functions invoke`. Desde la raíz del repo:

```bash
npm run pick          # hoy + mañana
npm run pick:force    # re-elige hoy + mañana
npm run pick:today    # re-elige solo hoy
```

Hace falta `VITE_SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env` (esta última **sin** prefijo `VITE_`; es la secret `sb_secret_...`, no la publishable).

Las Edge Functions `pick-daily` y `search-songs` comparten los secrets
`SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`. Para desplegar ambas:

```bash
npm run fn:deploy
```

## Variables de entorno (opcional)

Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Sin ellas, el catálogo local funciona igual.
