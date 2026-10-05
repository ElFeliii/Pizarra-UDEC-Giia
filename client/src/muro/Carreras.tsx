import { useMemo, useState } from 'react';
import { buscarPorNombre } from '../map/buscar';
import { useStore } from '../state/store';
import { Muro } from './Muro';

export function Carreras() {
  const mapa = useStore((s) => s.temas);
  const cargados = useStore((s) => s.temasCargados);
  const temaId = useStore((s) => s.temaId);
  const elegirTema = useStore((s) => s.elegirTema);
  const [consulta, cambiarConsulta] = useState('');
  const [campus, cambiarCampus] = useState('');
  const [grupo, cambiarGrupo] = useState('');
  const carreras = useMemo(
    () =>
      [...mapa.values()]
        .filter((t) => t.seccion === 'carreras' && !t.oculto)
        .sort((a, b) => a.orden - b.orden),
    [mapa],
  );
  const grupos = useMemo(
    () =>
      [
        ...new Set(
          carreras
            .filter((t) => !campus || t.campus === campus)
            .map((t) => t.grupo)
            .filter((g): g is string => !!g),
        ),
      ].sort((a, b) => a.localeCompare(b, 'es')),
    [carreras, campus],
  );
  const resultados = useMemo(() => {
    const filtradas = carreras.filter(
      (t) => (!campus || t.campus === campus) && (!grupo || t.grupo === grupo),
    );
    return consulta.trim()
      ? buscarPorNombre(
          consulta,
          filtradas,
          (t) => t.nombre,
          (a, b) => a.orden - b.orden,
        )
      : filtradas;
  }, [carreras, campus, grupo, consulta]);
  const seleccionada = temaId ? mapa.get(temaId) : undefined;

  return (
    <main className="muro">
      {seleccionada ? (
        <>
          <div className="temas__cabecera">
            <button type="button" className="btn btn--ghost" onClick={() => elegirTema(null)}>
              ← Todas las carreras
            </button>
            <p className="muted">
              {seleccionada.grupo} · Campus {seleccionada.campus}
            </p>
          </div>
          <Muro
            key={seleccionada.id}
            nombre={seleccionada.nombre}
            temaId={seleccionada.id}
            integrado
          />
        </>
      ) : (
        <>
          <header className="muro__head">
            <h1 className="muro__titulo">Carreras</h1>
          </header>
          <div className="temas__filtros">
            <label>
              Busca una carrera
              <input
                type="search"
                className="input"
                value={consulta}
                onChange={(e) => cambiarConsulta(e.target.value)}
                placeholder="Por ejemplo: informática"
              />
            </label>
            <label>
              Campus
              <select
                className="input"
                value={campus}
                onChange={(e) => {
                  cambiarCampus(e.target.value);
                  cambiarGrupo('');
                }}
              >
                <option value="">Todos los campus</option>
                {['Concepción', 'Chillán', 'Los Ángeles'].map((nombre) => (
                  <option key={nombre}>{nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Facultad o escuela
              <select
                className="input"
                value={grupo}
                onChange={(e) => cambiarGrupo(e.target.value)}
              >
                <option value="">Todas las facultades y escuelas</option>
                {grupos.map((nombre) => (
                  <option key={nombre}>{nombre}</option>
                ))}
              </select>
            </label>
          </div>
          {!cargados ? (
            <p className="muro__aviso muted">Cargando carreras…</p>
          ) : (
            <>
              <p className="temas__cabecera muted" role="status">
                {resultados.length} {resultados.length === 1 ? 'carrera' : 'carreras'}
              </p>
              {resultados.length === 0 ? (
                <p className="empty muro__aviso">No hay carreras que coincidan con esos filtros.</p>
              ) : (
                <ul className="temas__lista">
                  {resultados.map((carrera) => (
                    <li key={carrera.id}>
                      <button
                        type="button"
                        className="temas__carrera"
                        onClick={() => elegirTema(carrera.id)}
                      >
                        <strong>{carrera.nombre}</strong>
                        <span>Campus {carrera.campus}</span>
                        <span className="muted">{carrera.grupo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
