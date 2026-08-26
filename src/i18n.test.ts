import { afterEach, describe, expect, it } from 'vitest';
import i18n, { setLanguage } from './i18n';

describe('i18n', () => {
  afterEach(async () => {
    await setLanguage('es');
  });

  it('renders the main game copy in Spanish and English', async () => {
    await setLanguage('es');
    expect(i18n.t('home.tagline')).toBe('¿Cuánto necesitás escuchar?');
    expect(i18n.t('pools.hard')).toBe('Difícil');
    expect(i18n.t('boards.global')).toBe('Mundial');

    await setLanguage('en');
    expect(i18n.t('home.tagline')).toBe('How much do you need to hear?');
    expect(i18n.t('pools.hard')).toBe('Hard');
    expect(i18n.t('boards.es')).toBe('Spanish');
  });

  it('applies pluralization and interpolation in both languages', async () => {
    await setLanguage('es');
    expect(i18n.t('game.livesRemaining', { count: 1 })).toBe('1 vida restante');
    expect(i18n.t('game.livesRemaining', { count: 3 })).toBe('3 vidas restantes');

    await setLanguage('en');
    expect(i18n.t('game.livesRemaining', { count: 1 })).toBe('1 life remaining');
    expect(i18n.t('game.livesRemaining', { count: 3 })).toBe('3 lives remaining');
  });

  it('keeps the document language synchronized', async () => {
    await setLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    await setLanguage('es');
    expect(document.documentElement.lang).toBe('es');
  });
});
