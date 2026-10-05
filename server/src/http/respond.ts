import type { Ack, ErrorCode } from '@pizarra/shared';
import type { FastifyReply } from 'fastify';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  CENSORED: 422,
  LINKS: 422,
  PERSONAL_DATA: 422,
  DUPLICATE: 409,
  RATE_LIMITED: 429,
  SILENCED: 403,
  SECCION_CERRADA: 403,
  NO_SESSION: 401,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/** Traduce un Ack de los servicios a una respuesta HTTP. */
export function sendAck<T>(reply: FastifyReply, res: Ack<T>, okStatus = 200) {
  if (res.ok) return reply.code(okStatus).send(res.data);
  return reply.code(STATUS[res.error.code]).send({ error: res.error });
}

export function sendError(reply: FastifyReply, code: ErrorCode, message: string) {
  return reply.code(STATUS[code]).send({ error: { code, message } });
}
