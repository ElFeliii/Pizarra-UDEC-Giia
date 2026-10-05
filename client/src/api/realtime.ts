import { useEffect } from 'react';
import { useStore } from '../state/store';
import { api } from './http';
import { createSocket, type AppSocket } from './socket';

let current: AppSocket | null = null;
let revisionTemas = 0;

/** Socket activo (null si aún no hay conexión). */
export function getSocket(): AppSocket | null {
  return current;
}

/** El registro se retoma antes del efecto de React: hay que esperar el socket de esa sesión. */
export async function socketConSesion(): Promise<AppSocket> {
  const token = useStore.getState().session?.token;
  if (!token) throw new Error('Necesitas entrar para participar.');
  return new Promise((resolver, rechazar) => {
    let cancelar = () => {};
    const terminar = (error?: Error, socket?: AppSocket) => {
      clearTimeout(temporizador);
      cancelar();
      if (error) rechazar(error);
      else resolver(socket!);
    };
    const verificar = () => {
      if (useStore.getState().session?.token !== token) {
        terminar(new Error('La sesión cambió. Inténtalo de nuevo.'));
      } else if (current?.connected && (current.auth as { token?: string }).token === token) {
        terminar(undefined, current);
      }
    };
    const temporizador = setTimeout(
      () => terminar(new Error('No se pudo conectar. Inténtalo de nuevo.')),
      8000,
    );
    cancelar = useStore.subscribe(verificar);
    verificar();
  });
}

async function syncTemas(): Promise<void> {
  const revision = revisionTemas;
  try {
    const temas = await api.temas();
    if (revision !== revisionTemas) {
      void syncTemas();
      return;
    }
    useStore.getState().setTemas(temas);
  } catch {
    useStore
      .getState()
      .toast('No se pudieron cargar las carreras y preguntas. Revisa tu conexión.', 'error');
  }
}

/** Sincroniza los pines de la superficie activa: completo la primera vez, incremental al reconectar. */
export async function syncPins(): Promise<void> {
  const st = useStore.getState();
  const seccion = st.seccion;
  const revision = revisionTemas;
  try {
    const snap = await api.pins(seccion, st.loaded ? st.lastSync : undefined);
    // Si el usuario cambió de superficie mientras se descargaba, esta respuesta ya no sirve.
    if (useStore.getState().seccion !== seccion || revision !== revisionTemas) return;
    // Mezcla (no reemplaza): así no se pierden pines que llegaron por socket mientras
    // se descargaba el snapshot.
    useStore.getState().applySnapshot(snap, false);
  } catch {
    useStore.getState().toast('No se pudieron cargar los pines. Reintentando…', 'error');
  }
}

/**
 * Conecta la pizarra al servidor en tiempo real mientras el componente esté montado.
 * `token` puede ser undefined (solo lectura, p. ej. moderador sin sesión de asistente).
 */
export function useRealtime(token: string | undefined): void {
  const moderador = useStore((s) => s.moderator);
  useEffect(() => {
    const s = createSocket(token);
    current = s;
    const st = useStore.getState;

    s.on('connect', () => {
      st().setConnected(true);
      void syncTemas().then(() => syncPins());
      api
        .topWords()
        .then(st().setTopWords)
        .catch(() => {});
      api
        .secciones()
        .then(st().setSecciones)
        .catch(() => {});
    });
    s.on('disconnect', () => st().setConnected(false));
    s.on('connect_error', () => st().setConnected(false));

    // Los eventos llegan de todas las superficies: solo interesa la que se está viendo.
    s.on('pin:created', (pin) => {
      if (pin.seccion !== st().seccion) return;
      const mine = st().session?.user.id === pin.authorId;
      st().upsertPin(pin, !mine);
    });
    s.on('pins:updated', (updates) => st().updateCounts(updates));
    s.on('pin:removed', ({ id }) => st().removePin(id));
    s.on('pin:restored', (pin) => {
      if (pin.seccion === st().seccion) st().upsertPin(pin);
    });
    s.on('seccion:estado', (seccion) => {
      const antes = st().secciones.get(seccion.id)?.estado;
      revisionTemas++;
      st().applySeccion(seccion);
      void syncTemas().then(() => {
        if (seccion.id === st().seccion) return syncPins();
      });
      if (antes === 'abierta' && seccion.estado !== 'abierta') {
        st().toast(`"${seccion.nombre}" quedó solo para leer.`, 'info');
      }
    });
    s.on('tema:actualizado', (tema) => {
      revisionTemas++;
      st().aplicarTema(tema);
      if (tema.seccion === st().seccion) void syncPins();
    });
    s.on('presence:count', (n) => st().setOnline(n));
    s.on('words:top', (w) => st().setTopWords(w));
    s.on('session:silenced', () => {
      st().setSilenced(true);
      st().toast('Un moderador desactivó tu participación. Aún puedes leer la pizarra.', 'error');
    });
    s.on('session:unsilenced', () => {
      st().setSilenced(false);
      st().toast('Ya puedes volver a participar.', 'success');
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
      if (current === s) current = null;
    };
  }, [token, moderador]);
}
