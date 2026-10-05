import { useEffect } from 'react';
import { useStore } from '../state/store';
import { IconX } from '../ui/icons';
import { BUILDINGS, buildingInfo, type Foto } from './campus';

/** Crédito de la foto: obligatorio en las licencias Creative Commons. */
function Credito({ foto }: { foto: Foto }) {
  if (!foto.autor && !foto.licencia) return null;
  const texto = [foto.autor, foto.licencia].filter(Boolean).join(' · ');
  return (
    <figcaption className="ficha__credito">
      Foto:{' '}
      {foto.fuente ? (
        <a href={foto.fuente} target="_blank" rel="noreferrer noopener">
          {texto}
        </a>
      ) : (
        texto
      )}
    </figcaption>
  );
}

function FotoConCredito({ foto, nombre }: { foto: Foto; nombre: string }) {
  return (
    <figure className="ficha__figura">
      <img className="ficha__foto" src={`/edificios/${foto.archivo}`} alt={nombre} loading="lazy" />
      <Credito foto={foto} />
    </figure>
  );
}

/** Ventana con la información de un edificio: nombre, fotos y descripción. */
export function BuildingCard() {
  const id = useStore((s) => s.openBuildingId);
  const close = useStore((s) => s.closeBuilding);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, close]);

  if (!id) return null;
  const building = BUILDINGS.get(id);
  const info = buildingInfo(id);
  if (!building) return null;

  const fotos = info?.fotos ?? [];
  // La descripción va entre la primera foto y las demás: es lo que la gente viene a leer, y
  // con dos fotos arriba quedaba fuera de la pantalla.
  const [principal, ...otras] = fotos;

  return (
    <aside className="ficha sheet" role="dialog" aria-label={`Información de ${building.name}`}>
      <header className="ficha__head">
        <h2 className="ficha__titulo">{building.name}</h2>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
          <IconX />
        </button>
      </header>

      <div className="ficha__cuerpo">
        {principal ? (
          <FotoConCredito foto={principal} nombre={building.name} />
        ) : (
          <div className="ficha__foto ficha__foto--vacia">Foto pendiente</div>
        )}

        {info?.descripcion ? (
          <p className="ficha__texto">{info.descripcion}</p>
        ) : (
          <p className="ficha__texto ficha__texto--vacio">Descripción pendiente.</p>
        )}

        {otras.map((foto) => (
          <FotoConCredito key={foto.archivo} foto={foto} nombre={building.name} />
        ))}
      </div>
    </aside>
  );
}
