import { describe, expect, it } from 'vitest';
import { PESO, POSTIT, escalaNota, pinRadius, postitSize } from '@pizarra/shared';
import { checkContentRules } from '../src/moderation/contentRules';
import { RateLimiter } from '../src/moderation/rateLimit';

describe('reglas de contenido', () => {
  it.each([
    ['mira https://ejemplo.com', 'LINKS'],
    ['entra a www.algo.cl', 'LINKS'],
    ['sitio ejemplo.com', 'LINKS'],
    ['sigueme en t.me/algo', 'LINKS'],
    ['ejemplo . com', 'LINKS'],
    ['escríbeme a prueba@example.invalid', 'PERSONAL_DATA'],
    ['mi número +56 9 1234 5678', 'PERSONAL_DATA'],
    ['llámame 912345678', 'PERSONAL_DATA'],
    ['mi rut 12.345.678-9', 'PERSONAL_DATA'],
  ])('%s → %s', (text, expected) => {
    expect(checkContentRules(text)).toBe(expected);
  });

  it.each([
    'Hola a todos. ¿Cómo están?',
    'La charla es a las 15.30 en el aula 2',
    'Año 2026, sala 301',
    'Cuesta $1.000.000',
    'Me gustó... mucho',
    '@juanito ¿vienes?',
  ])('permite: %s', (text) => {
    expect(checkContentRules(text)).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('permite la ráfaga y luego recarga', () => {
    let t = 0;
    const rl = new RateLimiter({ capacity: 2, refillMs: 1000 }, () => t);
    expect(rl.take('a').ok).toBe(true);
    expect(rl.take('a').ok).toBe(true);
    const blocked = rl.take('a');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    t = 999;
    expect(rl.take('a').ok).toBe(false);
    t = 2000;
    expect(rl.take('a').ok).toBe(true);
    expect(rl.take('b').ok).toBe(true); // claves independientes
  });

  it('sweep elimina buckets inactivos', () => {
    let t = 0;
    const rl = new RateLimiter({ capacity: 1, refillMs: 1000 }, () => t);
    rl.take('a');
    t = 5000;
    rl.sweep();
    expect(rl.size).toBe(0);
  });
});

describe('tamaño de la nota', () => {
  it('una nota recién puesta mide la base', () => {
    expect(postitSize(0, 0)).toBe(POSTIT.base);
    expect(escalaNota(0, 0)).toBe(1);
  });

  it('crece tanto con las respuestas como con las visitas', () => {
    expect(escalaNota(0, 10)).toBeGreaterThan(escalaNota(0, 0));
    expect(escalaNota(3, 0)).toBeGreaterThan(escalaNota(0, 0));
    // Una respuesta pesa más que una visita: contestar dice más que mirar.
    expect(escalaNota(1, 0)).toBeGreaterThan(escalaNota(0, 1));
    expect(escalaNota(1, 0)).toBeCloseTo(escalaNota(0, PESO.porRespuesta), 10);
  });

  it('nunca pasa de cinco veces la base, por popular que sea', () => {
    expect(escalaNota(10_000, 10_000)).toBe(POSTIT.escalaMaxima);
    expect(postitSize(10_000, 10_000)).toBe(POSTIT.base * POSTIT.escalaMaxima);
  });

  it('no se achica con datos raros', () => {
    expect(escalaNota(-5, -5)).toBe(1);
    expect(escalaNota()).toBe(1);
  });

  it('sube de a poco: hay que ganarse el tamaño', () => {
    // Con unas pocas visitas apenas se nota; recién con interés real se agranda.
    expect(escalaNota(0, 5)).toBeLessThan(1.3);
    expect(escalaNota(0, 50)).toBeGreaterThan(1.5);
  });
});

describe('pinRadius', () => {
  it('crece con la raíz y tiene tope', () => {
    expect(pinRadius(0)).toBe(12);
    expect(pinRadius(1)).toBe(17);
    expect(pinRadius(4)).toBe(22);
    expect(pinRadius(9)).toBe(27);
    expect(pinRadius(25)).toBe(37);
    expect(pinRadius(36)).toBe(42);
    expect(pinRadius(1000)).toBe(48);
    expect(pinRadius(-3)).toBe(12);
  });
});
