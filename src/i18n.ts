import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export type AppLanguage = 'es' | 'en';

const resources = {
  es: {
    translation: {
      language: {
        label: 'Idioma',
        spanish: 'Español',
        english: 'English',
      },
      common: {
        home: 'Inicio',
        daily: 'Diario',
        infinite: 'Infinito',
        difficulty: 'Dificultad',
        play: 'Reproducir',
        pause: 'Pausar',
        retry: 'Reintentar',
      },
      pools: {
        easy: 'Fácil',
        medium: 'Medio',
        hard: 'Difícil',
        expert: 'Experto',
        impossible: 'Imposible',
      },
      status: {
        won: 'acertada',
        lost: 'fallada',
        pending: 'pendiente',
      },
      home: {
        tagline: '¿Cuánto necesitás escuchar?',
        dailyProgress: '{{count}}/5 completadas hoy',
        instructions:
          'Escuchá fragmentos cada vez más largos e intentá adivinar la canción antes de que se acabe el tiempo.',
      },
      game: {
        backHome: 'Volver al menú principal',
        livesRemaining_one: '{{count}} vida restante',
        livesRemaining_other: '{{count}} vidas restantes',
        pointsShort: '{{count}} pts',
        completed: '{{completed}}/5 completadas · {{won}} acertada',
        completed_other: '{{completed}}/5 completadas · {{won}} acertadas',
        songs_one: 'canción',
        songs_other: 'canciones',
        record: 'récord {{score}}',
        audioProgress: 'Progreso del fragmento de audio',
        guess: 'Adivinar',
        surrender: 'Rendirse',
        skip: 'Saltar',
        attempts_one: '{{count}} intento',
        attempts_other: '{{count}} intentos',
        was: 'Era',
        listenOnSpotify: 'Escuchar en Spotify',
        dailyWon: '✓ Diaria {{pool}} acertada',
        dailyLost: '✕ Diaria {{pool}} fallada',
        chooseAnother: 'Elegí otra dificultad para seguir jugando hoy.',
        gameOver: 'Fin del juego',
        songsGuessed_one: '{{count}} canción adivinada',
        songsGuessed_other: '{{count}} canciones adivinadas',
        newRecord: '¡Nuevo récord!',
        playAgain: 'Jugar de nuevo',
      },
      feedback: {
        correct: '¡Correcto!',
        wrongUnlimited:
          'No es esa. Tenés intentos ilimitados con el clip de {{seconds}} s.',
        wrong: 'No es esa.',
        wrongNext: 'No es esa. Ahora podés escuchar {{seconds}} s.',
      },
      audio: {
        loadFailed:
          'No se pudo cargar esta preview. Estamos probando una canción de respaldo.',
        unavailable: 'No encontramos una preview reproducible.',
        prepareFailed: 'Error al preparar la canción.',
        dailyFailed: 'No se pudo cargar la canción diaria. Probá de nuevo.',
        playFailed: 'No se pudo reproducir. Revisá el volumen o probá de nuevo.',
        loadAborted: 'Carga de audio abortada',
        networkError: 'Error de red al cargar el audio',
        decodeError: 'No se pudo decodificar el audio',
        unsupportedFormat: 'Formato de audio no soportado',
        loadError: 'Error al cargar el audio',
        loadTimeout: 'Tiempo de espera agotado al cargar el audio',
        notLoaded: 'Audio no cargado',
        notInitialized: 'Audio no inicializado',
      },
      combobox: {
        label: 'Nombre de la canción',
        placeholder: '¿Qué canción es?',
      },
      share: {
        copied: '¡Copiado!',
        copyResult: 'Copiar resultado',
        shareResult: 'Compartir resultado',
        shared: '¡Compartido!',
        copyError: 'No se pudo copiar. Revisá los permisos del navegador.',
        dailyChallenge: '¿Podés adivinarla con menos audio?',
        infiniteChallenge: '¿Cuántas canciones podés adivinar?',
        attempt_one: '{{count}} intento',
        attempt_other: '{{count}} intentos',
        infiniteTitle: 'BeatGuesser Infinito',
        songs_one: '{{count}} canción',
        songs_other: '{{count}} canciones',
      },
      dialogs: {
        surrenderTitle: '¿Rendirse en esta diaria?',
        surrenderDescription:
          'Se revelará la canción y esta dificultad quedará marcada como fallada hoy.',
        keepTrying: 'Seguir intentando',
        surrenderConfirm: 'Rendirme',
        songWon: '¡Canción acertada!',
        songLost: 'Canción fallada',
        victoryTitle: '¡Adivinaste!',
        guessedIn: 'Adivinada en {{seconds}} s',
        continue: 'Continuar',
        viewResult: 'Ver resultado',
      },
      errorBoundary: {
        title: 'Algo salió mal',
        description: 'Recargá la aplicación para volver a intentarlo.',
        reload: 'Recargar',
      },
    },
  },
  en: {
    translation: {
      language: {
        label: 'Language',
        spanish: 'Español',
        english: 'English',
      },
      common: {
        home: 'Home',
        daily: 'Daily',
        infinite: 'Infinite',
        difficulty: 'Difficulty',
        play: 'Play',
        pause: 'Pause',
        retry: 'Retry',
      },
      pools: {
        easy: 'Easy',
        medium: 'Medium',
        hard: 'Hard',
        expert: 'Expert',
        impossible: 'Impossible',
      },
      status: {
        won: 'guessed',
        lost: 'missed',
        pending: 'pending',
      },
      home: {
        tagline: 'How much do you need to hear?',
        dailyProgress: '{{count}}/5 completed today',
        instructions:
          'Listen to increasingly longer clips and try to guess the song before time runs out.',
      },
      game: {
        backHome: 'Back to the main menu',
        livesRemaining_one: '{{count}} life remaining',
        livesRemaining_other: '{{count}} lives remaining',
        pointsShort: '{{count}} pts',
        completed: '{{completed}}/5 completed · {{won}} guessed',
        completed_other: '{{completed}}/5 completed · {{won}} guessed',
        songs_one: 'song',
        songs_other: 'songs',
        record: 'best {{score}}',
        audioProgress: 'Audio clip progress',
        guess: 'Guess',
        surrender: 'Give up',
        skip: 'Skip',
        attempts_one: '{{count}} attempt',
        attempts_other: '{{count}} attempts',
        was: 'It was',
        listenOnSpotify: 'Listen on Spotify',
        dailyWon: '✓ {{pool}} daily guessed',
        dailyLost: '✕ {{pool}} daily missed',
        chooseAnother: 'Choose another difficulty to keep playing today.',
        gameOver: 'Game Over',
        songsGuessed_one: '{{count}} song guessed',
        songsGuessed_other: '{{count}} songs guessed',
        newRecord: 'New best!',
        playAgain: 'Play again',
      },
      feedback: {
        correct: 'Correct!',
        wrongUnlimited:
          'Not that one. You have unlimited guesses with the {{seconds}} s clip.',
        wrong: 'Not that one.',
        wrongNext: 'Not that one. You can now listen to {{seconds}} s.',
      },
      audio: {
        loadFailed:
          'This preview could not be loaded. We are trying a backup song.',
        unavailable: 'We could not find a playable preview.',
        prepareFailed: 'There was an error preparing the song.',
        dailyFailed: 'The daily song could not be loaded. Please try again.',
        playFailed: 'Playback failed. Check the volume or try again.',
        loadAborted: 'Audio loading was aborted',
        networkError: 'Network error while loading audio',
        decodeError: 'The audio could not be decoded',
        unsupportedFormat: 'Unsupported audio format',
        loadError: 'Error loading audio',
        loadTimeout: 'Audio loading timed out',
        notLoaded: 'Audio not loaded',
        notInitialized: 'Audio not initialized',
      },
      combobox: {
        label: 'Song name',
        placeholder: 'What song is it?',
      },
      share: {
        copied: 'Copied!',
        copyResult: 'Copy result',
        shareResult: 'Share result',
        shared: 'Shared!',
        copyError: 'Could not copy. Check your browser permissions.',
        dailyChallenge: 'Can you guess it with less audio?',
        infiniteChallenge: 'How many songs can you guess?',
        attempt_one: '{{count}} attempt',
        attempt_other: '{{count}} attempts',
        infiniteTitle: 'BeatGuesser Infinite',
        songs_one: '{{count}} song',
        songs_other: '{{count}} songs',
      },
      dialogs: {
        surrenderTitle: 'Give up this daily?',
        surrenderDescription:
          'The song will be revealed and this difficulty will be marked as missed today.',
        keepTrying: 'Keep trying',
        surrenderConfirm: 'Give up',
        songWon: 'Song guessed!',
        songLost: 'Song missed',
        victoryTitle: 'You got it!',
        guessedIn: 'Guessed in {{seconds}} s',
        continue: 'Continue',
        viewResult: 'View result',
      },
      errorBoundary: {
        title: 'Something went wrong',
        description: 'Reload the app to try again.',
        reload: 'Reload',
      },
    },
  },
} as const;

function initialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'es';
  const stored = window.localStorage.getItem('beatguesser-language');
  if (stored === 'es' || stored === 'en') return stored;
  return window.navigator.language.toLocaleLowerCase().startsWith('es') ? 'es' : 'en';
}

function syncDocumentLanguage(language: string): void {
  if (typeof document === 'undefined') return;
  const normalized = language.startsWith('en') ? 'en' : 'es';
  document.documentElement.lang = normalized;
  document.title = 'BeatGuesser';
  window.localStorage.setItem('beatguesser-language', normalized);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  interpolation: { escapeValue: false },
  initAsync: false,
});

i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);

export function setLanguage(language: AppLanguage): Promise<unknown> {
  return i18n.changeLanguage(language);
}

export default i18n;
