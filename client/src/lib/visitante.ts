import { storage } from './storage';

const KEY = 'pizarra.visitante.v1';

/**
 * Identificador anónimo de este navegador. No es una cuenta ni identifica a nadie: sirve para
 * contar una sola vez a quien abre una nota, incluso si todavía no dio su nombre.
 *
 * Si el navegador tiene el almacenamiento bloqueado (modo privado), `storage` devuelve null y
 * se usa uno nuevo en cada carga: esa persona cuenta de más, que es preferible a no contar.
 */
export function idVisitante(): string {
  const guardado = storage.get<string>(KEY);
  if (typeof guardado === 'string' && guardado.length >= 8) return guardado;
  const nuevo = crypto.randomUUID();
  storage.set(KEY, nuevo);
  return nuevo;
}
