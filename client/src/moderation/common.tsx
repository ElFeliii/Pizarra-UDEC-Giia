import type { HiddenReason, TargetType } from '@pizarra/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/http';
import { useStore } from '../state/store';

export const REASON_LABEL: Record<HiddenReason, string> = {
  mod: 'Oculto por moderador',
  reports: 'Oculto por reportes',
  word: 'Oculto por palabra prohibida',
  ia: 'Oculto por análisis automático (IA)',
};

export const TYPE_LABEL: Record<TargetType, string> = { pin: 'Pin', reply: 'Respuesta' };

/** Carga asíncrona con recarga manual; `deps` dispara la recarga automática. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    run()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Error al cargar.'));
  }, [run]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

/** Ejecuta una acción de moderación y muestra el resultado como toast. */
export async function runAction(fn: () => Promise<unknown>, success: string): Promise<boolean> {
  const toast = useStore.getState().toast;
  try {
    await fn();
    toast(success, 'success');
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'No se pudo completar la acción.', 'error');
    return false;
  }
}

export function ContentActions({
  type,
  id,
  authorId,
  hidden,
  reported,
  onDone,
}: {
  type: TargetType;
  id: number;
  authorId: number;
  hidden: boolean;
  reported?: boolean;
  onDone(): void;
}) {
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    if (await runAction(fn, msg)) onDone();
  };
  return (
    <div className="mod-actions">
      {hidden ? (
        <>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => act(() => api.admin.content(type, id, 'restore'), 'Restaurado.')}
          >
            Restaurar
          </button>
          {reported && (
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => act(() => api.admin.content(type, id, 'hide'), 'Se mantiene oculto.')}
            >
              Mantener oculto
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => act(() => api.admin.content(type, id, 'hide'), 'Ocultado.')}
          >
            Ocultar
          </button>
          {reported && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() =>
                act(() => api.admin.content(type, id, 'dismiss'), 'Reportes descartados.')
              }
            >
              Descartar reportes
            </button>
          )}
        </>
      )}
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        onClick={() => {
          if (window.confirm('¿Silenciar al autor? Podrá leer, pero no publicar.')) {
            void act(() => api.admin.silence(authorId, true), 'Autor silenciado.');
          }
        }}
      >
        Silenciar autor
      </button>
    </div>
  );
}
