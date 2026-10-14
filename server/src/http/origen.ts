import type { IncomingMessage } from 'node:http';
import type { Config } from '../config';
import type { TrustFn } from '../trust';

/** SameSite no separa subdominios: HTTP administrativo y Socket.IO comparten este criterio. */
export function origenPermitido(
  solicitud: IncomingMessage,
  confia: TrustFn,
  entorno: Config['env'],
): boolean {
  const cabecera = solicitud.headers.origin;
  // Los clientes CLI omiten Origin; metadatos cruzados de navegador no conceden esa excepción.
  if (cabecera === undefined) {
    const sitio = solicitud.headers['sec-fetch-site'];
    return sitio === undefined || sitio === 'same-origin' || sitio === 'none';
  }
  try {
    const origen = new URL(cabecera);
    if (origen.origin !== cabecera || !['http:', 'https:'].includes(origen.protocol)) return false;
    let protocolo = (solicitud.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:';
    const reenviado = solicitud.headers['x-forwarded-proto'];
    const direccion = solicitud.socket.remoteAddress;
    if (direccion && confia(direccion, 0) && (reenviado === 'https' || reenviado === 'http')) {
      protocolo = `${reenviado}:`;
    }
    const anfitrion = solicitud.headers.host;
    if (!anfitrion) return false;
    const destino = new URL(`${protocolo}//${anfitrion}`);
    if (destino.username || destino.password) return false;
    if (origen.origin === destino.origin) return true;
    return (
      entorno === 'development' &&
      origen.protocol === protocolo &&
      origen.hostname === destino.hostname &&
      origen.port === '5173'
    );
  } catch {
    return false;
  }
}
