import { lazy, Suspense, useEffect } from 'react';
import { ApiError, api } from './api/http';
import { Entrada } from './screens/Entrada';
import { Pizarra } from './screens/Pizarra';
import { useStore } from './state/store';

// El panel de moderación se carga aparte: los asistentes no descargan su código.
const Moderador = lazy(() => import('./screens/Moderador').then((m) => ({ default: m.Moderador })));

export function App() {
  const isModRoute = window.location.pathname.replace(/\/+$/, '') === '/moderador';

  // Verifica el token guardado (la base de datos pudo reiniciarse) y detecta si hay un moderador.
  useEffect(() => {
    const st = useStore.getState();
    if (st.session) {
      api
        .verifySession(st.session.token)
        .then((r) => useStore.getState().setSilenced(r.silenced))
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'NO_SESSION')
            useStore.getState().setSession(null);
        });
    }
    // Las secciones definen la navegación: se piden al abrir, sin esperar al socket.
    api
      .secciones()
      .then((list) => useStore.getState().setSecciones(list))
      .catch(() => {});
    api.admin
      .me()
      .then((r) => useStore.getState().setModerator(r.name))
      .catch(() => {});
  }, []);

  if (isModRoute) {
    return (
      <Suspense fallback={<div className="loading">Cargando…</div>}>
        <Moderador />
      </Suspense>
    );
  }
  // La pizarra se ve siempre; el nombre se pide recién al querer participar.
  return (
    <>
      <Pizarra />
      <Entrada />
    </>
  );
}
