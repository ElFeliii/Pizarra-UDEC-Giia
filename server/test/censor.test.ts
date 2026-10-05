import { describe, expect, it } from 'vitest';
import { Censor } from '../src/moderation/censor';
import { incitesHate } from '../src/moderation/hate';
import { matchCandidates, sanitizeText } from '../src/moderation/normalize';
import { DEFAULT_WORDLIST } from '../src/moderation/wordlist.default';

const censor = new Censor(DEFAULT_WORDLIST);

describe('censura: evasiones', () => {
  it.each([
    'weon',
    'Weón',
    'WEÓN',
    'w3on',
    'weoooon',
    'weeeoooonnn',
    'w.e.o.n',
    'w e o n',
    'w-e-o-n',
    'we o n',
    'we*on',
    'aweonao',
    'weones',
    'ctm',
    'c.t.m',
    'CTM!',
    'c t m',
    'culiao',
    'culiaaaooo',
    'reculiao',
    'qliao',
    'pu ta',
    'p u t a',
    'put4',
    'm1erda',
    'we\u200Bon', // espacio de ancho cero
    'w\u00ADe\u00ADo\u00ADn', // guion suave
    'hola wn',
    // Un símbolo o un dígito ocupando el lugar de una letra
    'im{ecil',
    'i m b e c i l',
    'im8ecil',
    'we*n',
    'we^n',
    'pu+a',
    'mier|da',
    'c()nchetumare',
    'est*pido',
    // La palabra partida en dos trozos largos
    'imbe cil',
    'estu pido',
    'concha tumare',
    // …o en varios trozos cortos, con o sin palabras alrededor
    'im bec il',
    'imb ec il',
    'im be cil',
    'es tu pi do',
    'ma ri con',
    'con che tu ma re',
    'cu lia o',
    'eres un im bec il',
    'que es tu pido',
    'hi jo de pu ta',
    // La k chilena en lugar de la c
    'kuliao',
    'k u l i a o',
    'ktm',
  ])('%s', (text) => {
    expect(censor.isBlocked(text)).toBe(true);
  });
});

describe('censura: incitación al odio (frases sin palabra prohibida)', () => {
  it.each([
    'maten a los judios',
    'hay que matar a los negros',
    'mueran los latinos',
    'que se mueran todos los inmigrantes',
    'fuera los venezolanos de mi pais',
    'todos los mapuches deberian morir',
    'hay que quemar a los gays',
    'odio a los musulmanes',
    'deporten a los haitianos',
    'MATEN A LOS JUDÍOS',
    'm4ten a los judios',
  ])('%s', (text) => {
    expect(incitesHate(text)).toBe(true);
  });

  it.each([
    'los chinos inventaron el papel',
    'la clase de historia sobre los nazis fue interesante',
    'el gato negro se murió de viejo',
    'las mujeres del equipo ganaron el torneo',
    'los inmigrantes aportan mucho al país',
    'me interesa la carrera de trabajo social',
    'fuera de la sala hay una feria de carreras',
    'estudiar medicina es caro',
  ])('no bloquea: %s', (text) => {
    expect(incitesHate(text)).toBe(false);
  });
});

describe('censura: groserías y ofensas', () => {
  it.each([
    ['chilenas', ['conchetumare', 'chuchesumadre', 'saco de weas', 'ese chucha', 'puro pelotudo']],
    ['español', ['hijo de puta', 'mierda', 'gilipollas', 'que cabrón', 'bastardo', 'jodete']],
    ['insultos', ['eres un idiota', 'imbécil', 'estúpido', 'cretino', 'tarado', 'fracasado']],
    ['homofobia', ['maricón', 'marica', 'maraco', 'fleto', 'tortillera', 'machorra']],
    ['racismo', ['sudaca', 'veneco', 'negrata', 'cholo', 'peruca', 'fucking nigga']],
    ['supremacismo', ['heil hitler', 'sieg heil', 'white power', 'kkk', 'hitler', '14 88']],
    ['violencia', ['mátate', 'muérete', 'suicídate', 'ahórcate', 'violador', 'pedófilo']],
    ['inglés', ['fuck you', 'motherfucker', 'bitch', 'asshole', 'bullshit', 'retarded', 'slut']],
    ['portugués', ['caralho', 'merda', 'viado', 'buceta', 'vai tomar no cu']],
  ])('%s', (_categoria, frases) => {
    for (const frase of frases) {
      expect(censor.isBlocked(frase), `debería bloquear: ${frase}`).toBe(true);
    }
  });
});

describe('censura: NO bloquea lo legítimo', () => {
  it.each([
    // Palabras que contienen raíces prohibidas
    'computadora',
    'la computación es entretenida',
    'disputa',
    'reputación',
    'cono de helado',
    'peculiar',
    'peculiaridad',
    'culinaria',
    'escultura',
    'maricultura',
    'mariscos',
    'coliflor',
    'colirio',
    'bollería',
    'Mongolia',
    'el bus viene con retardo',
    'un vuelo retrasado',
    'idioma español',
    'aquí llegamos',
    'estupendo',
    'follaje del bosque',
    'una pera y un perro',
    'la concha del mar',
    'escoria metalúrgica',
    'a las 3 y pico',
    'jugamos con maracas',
    'la polla chilena de beneficencia',
    // Frases típicas del evento
    '¿Dónde queda el campanil?',
    '¿Qué carrera recomiendan para ingeniería?',
    'Me gustó mucho la charla de astronomía',
    '¿Cuál es el puntaje de corte para Medicina?',
    '¿Hay becas y gratuidad para estudiantes de regiones?',
    '¿Cómo es el mechoneo en la universidad?',
    'La biblioteca central es enorme',
    '¿Dónde almuerzan? ¿Hay casino en el campus?',
    'Estoy en 4to medio y quiero estudiar bioquímica',
    'El laboratorio de química se ve entretenido',
    'Colegio ejemplo 1',
    // Números y símbolos dentro de palabras legítimas
    '2 + 2 = 4',
    'estoy en 4to medio',
    'la promo es 2x1 en el casino',
    'sala A-201',
    'el horario es 8:30 a 18:00',
    'mi puntaje fue 745,5',
    // Palabras con k, que el filtro traduce a c
    'me gusta el kiosco de la entrada',
    'karate y kung fu',
    'el rock and roll',
    'okey, nos vemos',
    'el link de la charla',
    'un kilo de pan',
    // Cadenas con dígitos: el comodín por dígito no puede calzar con términos cortos
    'Pin de carga 3-1 fu1kt',
    'Pin de carga 11-0 q9ecz',
    'mi codigo de alumno es a2b4c',
    'sala 2b, edificio 3',
    // Siglas con puntos: no pueden volverse comodines que calcen con cualquier cosa
    'C.E.I.A San Luis de Potosi República de México',
    'C.E.I.A. Hualpencillo',
    'La U. de Chile y la U.C.',
    // Pares de palabras que al pegarse no deben formar nada
    'ver el mapa completo',
    'la sala es amplia',
    'con cha de mate',
    // Frases cargadas de palabras cortas: es lo que estresa el pegado de trozos
    'no se si me va a ir bien en la paes',
    'ya po, nos vemos a las dos en el foro',
    'mi pa me va a ir a dejar a las 8',
    'de a poco se me va el susto',
    'la u de con ce es la que mas me tinca',
    'un ca fe y un pan con pa lta',
    'a mi me gus ta la fi si ca',
    'no me ha lle ga do el co rreo',
  ])('%s', (text) => {
    expect(censor.isBlocked(text)).toBe(false);
  });
});

describe('normalización', () => {
  it('quita invisibles y ordena saltos de línea', () => {
    expect(sanitizeText('  hola\u200B \r\n\r\n\r\n\r\nmundo  ')).toBe('hola\n\nmundo');
  });

  it('conserva la ñ y quita tildes', () => {
    const c = matchCandidates('Ñandú Canción');
    expect(c.squeezed2.has('ñandu')).toBe(true);
    expect(c.squeezed2.has('cancion')).toBe(true);
  });

  it('une letras sueltas', () => {
    expect(matchCandidates('c.t.m').squeezed2.has('ctm')).toBe(true);
  });
});

describe('Censor', () => {
  it('se reconstruye en caliente', () => {
    const c = new Censor([]);
    expect(c.isBlocked('palabrota')).toBe(false);
    c.setTerms([{ term: 'palabrota', mode: 'exact' }]);
    expect(c.isBlocked('eso es una PALABROTA!')).toBe(true);
  });

  it('respeta los modos exact / prefix / contains', () => {
    const exact = Censor.single({ term: 'gato', mode: 'exact' });
    expect(exact.isBlocked('gato')).toBe(true);
    expect(exact.isBlocked('gatos')).toBe(false);

    const prefix = Censor.single({ term: 'gato', mode: 'prefix' });
    expect(prefix.isBlocked('gatos')).toBe(true);
    expect(prefix.isBlocked('agato')).toBe(false);

    const contains = Censor.single({ term: 'gato', mode: 'contains' });
    expect(contains.isBlocked('agatotes')).toBe(true);
  });

  it('entiende frases de varias palabras', () => {
    const c = Censor.single({ term: 'raza superior', mode: 'exact' });
    expect(c.isBlocked('hablaba de la raza superior en clases')).toBe(true);
    expect(c.isBlocked('RAZA   SUPERIOR')).toBe(true);
    // Las palabras tienen que ir seguidas y en ese orden.
    expect(c.isBlocked('la raza es superior')).toBe(false);
    expect(c.isBlocked('superior raza')).toBe(false);
    expect(c.isBlocked('raza')).toBe(false);
  });

  it('la lista semilla trae volumen y frases', () => {
    expect(DEFAULT_WORDLIST.length).toBeGreaterThan(300);
    expect(DEFAULT_WORDLIST.filter((t) => /\s/.test(t.term)).length).toBeGreaterThan(10);
  });
});
