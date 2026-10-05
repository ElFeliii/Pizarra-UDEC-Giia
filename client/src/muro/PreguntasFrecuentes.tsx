import { useMemo } from 'react';
import { useStore } from '../state/store';
import { Muro } from './Muro';

export function PreguntasFrecuentes() {
  const mapa = useStore((s) => s.temas);
  const cargados = useStore((s) => s.temasCargados);
  const temaId = useStore((s) => s.temaId);
  const elegirTema = useStore((s) => s.elegirTema);
  const pins = useStore((s) => s.pins);
  const preguntas = useMemo(
    () =>
      [...mapa.values()]
        .filter((t) => t.seccion === 'faq' && !t.oculto)
        .sort((a, b) => a.orden - b.orden),
    [mapa],
  );
  const cantidades = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const nota of pins.values())
      if (nota.temaId) conteo.set(nota.temaId, (conteo.get(nota.temaId) ?? 0) + 1);
    return conteo;
  }, [pins]);
  return (
    <main className="muro">
      <header className="muro__head">
        <h1 className="muro__titulo">Preguntas frecuentes</h1>
      </header>
      {!cargados ? (
        <p className="muted muro__aviso">Cargando preguntas…</p>
      ) : preguntas.length === 0 ? (
        <p className="empty muro__aviso">El equipo todavía no ha agregado preguntas frecuentes.</p>
      ) : (
        <div className="faq__lista">
          {preguntas.map((pregunta) => {
            const abierta = pregunta.id === temaId;
            const cantidad = cantidades.get(pregunta.id) ?? 0;
            return (
              <section className="faq__pregunta" key={pregunta.id}>
                <h2>
                  <button
                    type="button"
                    className="faq__titulo"
                    id={`titulo-${pregunta.id}`}
                    aria-expanded={abierta}
                    aria-controls={`respuestas-${pregunta.id}`}
                    onClick={() => elegirTema(abierta ? null : pregunta.id)}
                  >
                    <span>{pregunta.nombre}</span>
                    <span className="muted">
                      {cantidad} {cantidad === 1 ? 'nota' : 'notas'} · {abierta ? '−' : '+'}
                    </span>
                  </button>
                </h2>
                <div
                  id={`respuestas-${pregunta.id}`}
                  role="region"
                  aria-labelledby={`titulo-${pregunta.id}`}
                  hidden={!abierta}
                >
                  {abierta && (
                    <Muro nombre="Respuestas de universitarios" temaId={pregunta.id} integrado />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
