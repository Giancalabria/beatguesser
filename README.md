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
Una canción por dificultad cada día (zona horaria Argentina/Buenos Aires). Al ganar o perder, esa dificultad queda bloqueada hasta mañana. Podés jugar las otras dificultades pendientes.

**Dificultades:** Fácil, Medio, Difícil, Experto, Imposible.

### Infinito
Misma pantalla de juego con 3 vidas. Cada fallo resta una vida; cada acierto suma al puntaje. La dificultad queda fija durante la partida.

## Mecánica

- Escuchás fragmentos de 0.1s → 0.5s → 1s → 3s → 7s → 15s.
- El botón de play repite el fragmento actual.
- Saltar o errar avanza al siguiente fragmento.
- Autocompletado activo en Fácil y Medio; en dificultades altas solo coincidencia al enviar.

## Build

```bash
npm run build
npm run preview
```

## Variables de entorno (opcional)

Copiá `.env.example` a `.env` y completá las claves de Supabase si querés sincronización futura. Sin ellas, el catálogo local funciona igual.

## Lanzar a producción

Checklist de cuentas, seed y deploy: [docs/LANZAR.md](docs/LANZAR.md).
