import type { CensorTerm } from './censor';

/**
 * Lista semilla de palabras prohibidas. Se carga a la base de datos solo en la primera
 * ejecución; después el moderador la administra desde el panel (agregar, quitar y aplicar
 * a lo ya publicado).
 *
 * Criterios de los modos:
 *  - `contains`: solo raíces que NO aparecen dentro de palabras inocentes ("weon", "fuck").
 *  - `prefix`:   palabras que se conjugan o pluralizan ("puta" → "putas", pero no "disputa").
 *  - `exact`:    abreviaciones, palabras cortas y términos con riesgo de falso positivo.
 *
 * Palabras deliberadamente FUERA por ser ambiguas en Chile: pico, paja, raja, concha, maraca,
 * polla, hueco, pendejo, cola, indio, negro, chino, mapuche, nazi, retrasado, flaite, sexo,
 * violar, marihuana. Se cubren con reportes y con el moderador, no con el filtro.
 */
const contains = (...terms: string[]): CensorTerm[] =>
  terms.map((term) => ({ term, mode: 'contains' }));
const prefix = (...terms: string[]): CensorTerm[] =>
  terms.map((term) => ({ term, mode: 'prefix' }));
const exact = (...terms: string[]): CensorTerm[] => terms.map((term) => ({ term, mode: 'exact' }));

/**
 * Versión de la semilla. Al subirla, el servidor agrega los términos nuevos a bases que ya
 * existen (sin tocar los que el moderador haya agregado).
 */
export const WORDLIST_VERSION = 3;

export const DEFAULT_WORDLIST: CensorTerm[] = [
  // ---------------------------------------------------------------- Chile: groserías
  ...contains('weon', 'hueon', 'huevon', 'guevon', 'wevon', 'webon', 'guebon', 'ahuevon'),
  ...contains('conchetu', 'conchesu', 'conchatu', 'conchasu', 'conchadesu', 'conchedesu'),
  ...contains('chuchetu', 'chuchesu', 'chuchadesu', 'sacowea', 'sacahuea'),
  ...contains('hijueput', 'hijoeput', 'hijodeput', 'hijadeput', 'andatealaconch'),
  ...prefix('culia', 'reculia', 'culea', 'culiando', 'ql', 'pichula', 'pajer', 'pelotud'),
  ...prefix('chuchada', 'chuchete', 'aweona', 'aweonada', 'maraco', 'colipato', 'maricueca'),
  ...exact('wn', 'wns', 'wea', 'weas', 'huea', 'hueas', 'weas', 'ctm', 'csm', 'ctmr', 'ctmre'),
  ...exact('hdp', 'chucha', 'chuchas', 'culo', 'culos', 'poto', 'potos', 'ojete', 'tula'),
  ...exact('fleto', 'fletos', 'fleta', 'coliza', 'colisa', 'colizas'),
  ...exact('zorra', 'zorras', 'zorron', 'zorrona', 'perra', 'perras', 'lacra', 'lacras'),

  // ---------------------------------------------------------------- Español: groserías
  ...prefix('puta', 'puto', 'putear', 'puteada', 'mierda', 'cabron', 'gilipoll', 'malparid'),
  ...prefix('malnacid', 'bastard', 'cornud', 'prostitut', 'zorrupia', 'chingad', 'chingar'),
  ...prefix('mamona', 'pajero', 'pajera', 'culero', 'culera', 'porno', 'pornogra'),
  ...exact('coño', 'coños', 'carajo', 'joder', 'jodete', 'jodanse', 'verga', 'vergas'),
  ...exact('follar', 'follando', 'follame', 'follate', 'mamada', 'mamadas', 'orgia', 'orgias'),
  ...exact('chupala', 'chupalo', 'chupamela', 'chupenla', 'tetas', 'poronga', 'boludo', 'boluda'),
  ...contains('chupapico', 'chupaverga', 'comepico', 'lamepico'),

  // ---------------------------------------------------------------- Insultos y desprecio
  ...prefix('imbecil', 'idiot', 'estupid', 'cretin', 'subnormal', 'mongolic', 'mogolic'),
  ...prefix('tarado', 'tarada', 'sidoso', 'sidosa'),
  // "fracasado" va exacto y no como prefijo: igual puede aparecer como adjetivo legítimo.
  ...exact('fracasado', 'fracasada', 'fracasados', 'fracasadas'),

  // ---------------------------------------------------------------- Homofobia y transfobia
  ...prefix('maricon', 'marimacho', 'tortiller', 'bollera', 'sodomit', 'travuco'),
  ...exact('marica', 'maricas', 'trolo', 'trola', 'trolos', 'machorra', 'machorras'),

  // ---------------------------------------------------------------- Racismo y xenofobia
  ...prefix('sudaca', 'veneco', 'negrata', 'peruca'),
  ...exact('cholo', 'cholos', 'chola', 'cholas', 'negroide'),
  ...contains('nigg', 'wetback', 'beaner', 'chinaman'),
  ...exact('spic', 'chink', 'chinks', 'gook', 'gooks', 'paki', 'pakis', 'zipperhead'),

  // ---------------------------------------------------------------- Supremacismo y odio
  // Escrito junto (evasión) y como frase; el filtro entiende las dos formas.
  ...contains('heilhitler', 'siegheil', 'whitepower', 'whitepride', 'poderblanco', 'neonazi'),
  ...contains('supremaciablanca', 'razasuperior', 'razainferior', 'limpiezaetnica'),
  ...exact('hitler', 'kkk', '1488', 'holocuento'),
  ...exact('sieg heil', 'heil hitler', 'white power', 'white pride', 'poder blanco'),
  ...exact('supremacia blanca', 'raza superior', 'raza inferior', 'limpieza etnica'),
  ...exact('muerte a los', 'fuera de mi pais', 'vuelvete a tu pais', 'vayanse a su pais'),

  // ---------------------------------------------------------------- Violencia y autolesión
  ...prefix('violador', 'violadora', 'pedofil', 'pederast', 'zoofil', 'degollar'),
  ...exact('matate', 'matense', 'muerete', 'mueranse', 'suicidate', 'suicidense', 'ahorcate'),
  ...contains('cortatelasvenas', 'tirateaunpuente', 'ojalatemueras', 'tevoyamatar'),
  ...exact('te voy a matar', 'ojala te mueras', 'ojala te maten', 'cortate las venas'),
  ...exact('tirate a un puente', 'matense todos', 'deberias morirte', 'nadie te quiere'),

  // ---------------------------------------------------------------- Inglés
  ...contains('fuck', 'asshole', 'dumbass', 'jackass', 'bullshit', 'shithead', 'motherf'),
  ...prefix('bitch', 'cunt', 'whore', 'slut', 'wanker', 'fagg', 'stupid'),
  ...exact(
    'shit',
    'shits',
    'fag',
    'fags',
    'twat',
    'prick',
    'pussy',
    'retard',
    'retards',
    'retarded',
  ),

  // ---------------------------------------------------------------- Portugués
  ...exact('caralho', 'merda', 'buceta', 'viado', 'viados', 'porra', 'foda', 'fodase'),
  ...contains('filhadaputa', 'vaitomarnocu'),
  ...exact('vai tomar no cu', 'filha da puta', 'filho da puta'),

  // ---------------------------------------------------------------- Agregados (versión 3)
  // Faltaban formas derivadas y desprecios que el filtro dejaba pasar.
  ...prefix('putit', 'zorrit', 'mierder', 'cagon', 'cagona', 'mamahuevo', 'mamaverga'),
  ...prefix('feminazi', 'sidoso', 'leproso', 'apestoso'),
  ...contains('comemierda', 'hijodeperra', 'hijadeperra', 'caraeraja', 'caradepico'),
  ...exact('anormal', 'anormales', 'mongolo', 'mongola', 'mongolos', 'mongolas'),
  ...exact('come mierda', 'hijo de perra', 'hija de perra', 'saco de mierda'),
  ...exact('deficiente mental', 'retrasado mental', 'retrasada mental', 'enfermo mental'),
  ...exact('muerto de hambre', 'muertos de hambre', 'eres una basura', 'eres basura'),
  ...exact('anda a cagar', 'andate a la cresta', 'me cago en ti', 'que te jodan'),
  // Inglés de internet
  ...exact('kys', 'stfu', 'gtfo', 'kill yourself', 'go die'),
  ...contains('killyourself', 'killurself'),
  // Sitios pornográficos: en un evento escolar no tienen para qué aparecer.
  ...exact('onlyfans', 'pornhub', 'xvideos', 'xnxx', 'redtube', 'chaturbate'),
];
