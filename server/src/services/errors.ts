import type { ApiError, ErrorCode } from '@pizarra/shared';

const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: 'Revisa los datos ingresados.',
  CENSORED: 'Tu mensaje contiene palabras no permitidas.',
  IA_RECHAZADO: 'Tu mensaje no cumple las normas de convivencia de la pizarra.',
  EN_REVISION: 'Recibimos tu mensaje. Aparecerá cuando un moderador lo revise.',
  LINKS: 'No se permiten links.',
  PERSONAL_DATA: 'Por tu seguridad, no compartas correos, teléfonos ni RUT.',
  DUPLICATE: 'Ya publicaste ese mismo mensaje hace poco.',
  RATE_LIMITED: 'Vas muy rápido. Espera un momento e inténtalo de nuevo.',
  SILENCED: 'Un moderador desactivó tu participación. Aún puedes leer la pizarra.',
  SECCION_CERRADA: 'Esta sección está cerrada: ya no se puede publicar, pero sí leer.',
  NO_SESSION: 'Tu sesión no es válida. Vuelve a ingresar tu nombre.',
  NOT_FOUND: 'Ese contenido ya no está disponible.',
  UNAUTHORIZED: 'No autorizado.',
  INTERNAL: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
};

export type Fail = { ok: false; error: ApiError };

export function fail(code: ErrorCode, message?: string): Fail {
  return { ok: false, error: { code, message: message ?? MESSAGES[code] } };
}

export function rateLimited(retryAfterMs: number): Fail {
  const s = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return fail('RATE_LIMITED', `Vas muy rápido. Espera ${s} s e inténtalo de nuevo.`);
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
