import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Censor } from '../src/moderation/censor';
import { checkContentRules } from '../src/moderation/contentRules';
import { incitesHate } from '../src/moderation/hate';
import { matchCandidates, sanitizeText } from '../src/moderation/normalize';
import { DEFAULT_WORDLIST } from '../src/moderation/wordlist.default';
import { MOD_PASSWORD, pinInput, startServer } from './helpers';

const filtro = new Censor(DEFAULT_WORDLIST);

describe('comparación Unicode sin transformar el texto presentado', () => {
  it.each([
    ['Teléfono ９１２３４５６７８', 'PERSONAL_DATA'],
    ['Teléfono ٩١٢٣٤٥٦٧٨', 'PERSONAL_DATA'],
    ['Teléfono +٥٦ ٩ ١٢٣٤ ٥٦٧٨', 'PERSONAL_DATA'],
    ['Teléfono +۵۶ ۹ ۱۲۳۴ ۵۶۷۸', 'PERSONAL_DATA'],
    ['Teléfono ９ ١۲３٤ ٥۶７٨', 'PERSONAL_DATA'],
    ['RUT ١.٢٣٤.٥٦٧-٨', 'PERSONAL_DATA'],
    ['RUTá١.٢٣٤.٥٦٧-kÑ', 'PERSONAL_DATA'],
    ['Teléfonoá٩ ١٢٣٤ ٥٦٧٨fin', 'PERSONAL_DATA'],
    ['RUT １２．３４５．６７８－Ｋ', 'PERSONAL_DATA'],
    ['Identificador ๑๒๓๔๕๖๗๘', 'PERSONAL_DATA'],
    ['Identificador 𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠', 'PERSONAL_DATA'],
    ['Correo ｐｒｕｅｂａ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ', 'PERSONAL_DATA'],
    ['Enlace ｈｔｔｐｓ：／／ｅｊｅｍｐｌｏ．ｃｏｍ', 'LINKS'],
    ['Enlace ｅｊｅｍｐｌｏ［．］ｃｏｍ', 'LINKS'],
    ['Enlace 𝕖𝕛𝕖𝕞𝕡𝕝𝕠.com', 'LINKS'],
  ])('detecta %s', (texto, esperado) => {
    expect(checkContentRules(texto)).toBe(esperado);
  });

  it('reconoce todos los juegos decimales de la versión Unicode del motor', () => {
    const decimal = /\p{Nd}/u;
    let juegos = 0;
    for (let codigo = 0; codigo <= 0x10ffff; codigo++) {
      if (!decimal.test(String.fromCodePoint(codigo))) continue;
      const digitos = Array.from({ length: 10 }, (_, valor) =>
        String.fromCodePoint(codigo + valor),
      );
      expect(digitos.every((digito) => decimal.test(digito))).toBe(true);
      const telefono = `${digitos[9]} ${digitos.slice(1, 5).join('')} ${digitos.slice(5, 9).join('')}`;
      expect(checkContentRules(telefono), `juego U+${codigo.toString(16)}`).toBe('PERSONAL_DATA');
      juegos++;
      codigo += 9;
    }
    expect(juegos).toBeGreaterThan(60);
  });

  it.each(['ｗｅóｎ', 'ｉｍｂéｃｉｌ', '𝔀𝓮𝓸𝓷', '𝕚𝕞𝕓𝕖𝕔𝕚𝕝', 'm١erda', 'im٨ecil'])(
    'no permite evadir la lista con %s',
    (texto) => expect(filtro.isBlocked(texto)).toBe(true),
  );

  it.each(['ｍａｔｅｎ ａ ｌｏｓ ｊｕｄíｏｓ', 'm٤ten a los judíos'])(
    'no permite evadir la incitación con %s',
    (texto) => expect(incitesHate(texto)).toBe(true),
  );

  it('normaliza también los términos agregados por moderación, manteniendo la ñ', () => {
    const personalizado = Censor.single({ term: 'ｐａｌａｂｒａ ñ', mode: 'exact' });
    expect(personalizado.isBlocked('PALABRA Ñ')).toBe(true);
    expect(personalizado.isBlocked('palabra n')).toBe(false);
    expect(matchCandidates('Ñandú Ｃanción').squeezed2).toContain('ñandu');
    expect(matchCandidates('Ñandú Ｃanción').squeezed2).toContain('cancion');
  });

  it.each([
    'Mañana a las ١٥:٣٠ en la sala ٤',
    'Año ２０２６, sala ３０１',
    'Puntaje ۷۴۵,۵',
    'La charla de física tiene ² ejemplos',
    'La biblioteca está en el edificio ①',
    'Nicolás Peña, ¿cómo llego al Campanil?',
  ])('permite el texto legítimo y conserva su representación: %s', (texto) => {
    expect(checkContentRules(texto)).toBeNull();
    expect(filtro.isBlocked(texto)).toBe(false);
    expect(incitesHate(texto)).toBe(false);
    expect(sanitizeText(texto)).toBe(texto.normalize('NFC'));
  });

  it('mantiene los nombres reales de instituciones, edificios y carreras, también en ancho completo', () => {
    const instituciones = JSON.parse(
      readFileSync(new URL('../data/instituciones.json', import.meta.url), 'utf8'),
    ) as { name: string }[];
    const campus = JSON.parse(
      readFileSync(new URL('../../client/src/map/campus.json', import.meta.url), 'utf8'),
    ) as { buildings: { name: string }[] };
    const carreras = JSON.parse(
      readFileSync(new URL('../data/carreras.json', import.meta.url), 'utf8'),
    ) as { temas: { nombre: string }[] };
    const nombres = [
      ...instituciones.map((institucion) => institucion.name),
      ...campus.buildings.map((edificio) => edificio.name),
      ...carreras.temas.map((carrera) => carrera.nombre),
    ];
    expect(nombres.length).toBeGreaterThanOrEqual(680);
    for (const nombre of nombres) {
      const anchoCompleto = nombre.replace(/[!-~]/g, (letra) =>
        String.fromCodePoint(letra.codePointAt(0)! + 0xfee0),
      );
      for (const texto of [nombre, anchoCompleto]) {
        expect(filtro.isBlocked(texto), texto).toBe(false);
        expect(incitesHate(texto), texto).toBe(false);
        expect(checkContentRules(texto), texto).toBeNull();
      }
    }
  });
});

describe('filtro Unicode en publicaciones y respuestas', () => {
  let servidor: Awaited<ReturnType<typeof startServer>> | undefined;
  afterEach(async () => {
    await servidor?.close();
  });

  it('rechaza datos personales y conserva el texto legítimo en la base y el hilo', async () => {
    servidor = await startServer({ MOD_USERS: `Mod Test:${MOD_PASSWORD}`, MOD_PASSWORD: '' });
    const socket = await servidor.connect(
      (await servidor.newUser()).token,
      await servidor.modLogin(),
    );
    const rechazado = await socket.emitWithAck('pin:create', pinInput('Teléfono ٩١٢٣٤٥٦٧٨'));
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.error.code).toBe('PERSONAL_DATA');

    const texto = 'Ｍañana a las ١٥:٣٠, sala ². Nicolás Peña';
    const nota = await socket.emitWithAck('pin:create', pinInput(texto, 500, 500));
    expect(nota.ok).toBe(true);
    if (!nota.ok) throw new Error(nota.error.message);
    const respuesta = await socket.emitWithAck('reply:create', {
      pinId: nota.data.id,
      text: 'RUT ١.٢٣٤.٥٦٧-٨',
    });
    expect(respuesta.ok).toBe(false);
    if (!respuesta.ok) expect(respuesta.error.code).toBe('PERSONAL_DATA');
    const hilo = (await servidor.app.inject(`/api/pins/${nota.data.id}/thread`)).json();
    expect(hilo.pin.text).toBe(texto);
    expect(servidor.ctx.repos.pins.get(nota.data.id)?.text).toBe(texto);
    expect(hilo.replies).toEqual([]);
  });
});
