import proxyaddr from 'proxy-addr';

export type TrustFn = (addr: string, hop: number) => boolean;

/**
 * Qué proxies son de confianza para leer la IP real (X-Forwarded-For).
 * Misma función para Fastify y Socket.IO, así ambos ven la misma IP.
 */
export function makeTrust(v: boolean | number | string): TrustFn {
  if (v === true) return () => true;
  if (v === false) return () => false;
  if (typeof v === 'number') return (_addr, hop) => hop < v;
  return proxyaddr.compile(v.split(',').map((s) => s.trim()));
}
