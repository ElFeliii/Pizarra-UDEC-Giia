import type { Reply, Thread } from '@pizarra/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/http';
import { getSocket } from '../api/realtime';

function insertReply(replies: Reply[], r: Reply): Reply[] {
  if (replies.some((x) => x.id === r.id)) return replies;
  return [...replies, r].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
}

/**
 * Carga el hilo de un pin y lo mantiene al día mientras está abierto (sala `pin:<id>`).
 */
export function useThread(pinId: number | null) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pinId === null) return;
    let alive = true;
    setThread(null);
    setError(null);

    const load = () =>
      api
        .thread(pinId)
        .then((t) => alive && setThread(t))
        .catch((e: unknown) => {
          if (alive) setError(e instanceof ApiError ? e.message : 'No se pudo cargar el hilo.');
        });

    const socket = getSocket();
    const join = () => socket?.emit('thread:join', { pinId });
    const onReply = (r: Reply) => {
      if (r.pinId === pinId)
        setThread((t) => (t ? { ...t, replies: insertReply(t.replies, r) } : t));
    };
    const onRemoved = ({ id, pinId: p }: { id: number; pinId: number }) => {
      if (p === pinId) {
        setThread((t) => (t ? { ...t, replies: t.replies.filter((x) => x.id !== id) } : t));
      }
    };
    // Tras una reconexión se vuelve a entrar a la sala y se recarga (pudo perderse algo).
    const onReconnect = () => {
      join();
      void load();
    };

    join();
    void load();
    socket?.on('reply:created', onReply);
    socket?.on('reply:restored', onReply);
    socket?.on('reply:removed', onRemoved);
    socket?.on('connect', onReconnect);

    return () => {
      alive = false;
      socket?.emit('thread:leave', { pinId });
      socket?.off('reply:created', onReply);
      socket?.off('reply:restored', onReply);
      socket?.off('reply:removed', onRemoved);
      socket?.off('connect', onReconnect);
    };
  }, [pinId]);

  /** Agrega la respuesta propia apenas llega el ack (sin esperar el evento). */
  const addReply = useCallback((r: Reply) => {
    setThread((t) =>
      t && t.pin.id === r.pinId ? { ...t, replies: insertReply(t.replies, r) } : t,
    );
  }, []);

  const removeReply = useCallback((id: number) => {
    setThread((t) => (t ? { ...t, replies: t.replies.filter((x) => x.id !== id) } : t));
  }, []);

  return { thread, error, addReply, removeReply };
}
