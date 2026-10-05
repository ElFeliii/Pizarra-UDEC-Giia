import { ESPACIO_MODERACION, invadeModeracion } from '@pizarra/shared';
import { OUTSIDE_CAMPUS_MESSAGE, PIN_COLORS, type PinColorId } from '@pizarra/shared';
import { useEffect, useMemo, useState } from 'react';
import { syncPins, useRealtime } from '../api/realtime';
import { camera } from '../board/camera';
import { Canvas } from '../board/Canvas';
import { Composer } from '../board/Composer';
import { Placement } from '../board/Placement';
import { canPlaceAt, worldOf } from '../board/world';
import { BuildingCard } from '../map/BuildingCard';
import { CampusLayer } from '../map/CampusLayer';
import { LeyendaMapa } from '../map/LeyendaMapa';
import { campus } from '../map/campus';
import { SearchBar } from '../search/SearchBar';
import { TopWords } from '../search/TopWords';
import { Carreras } from '../muro/Carreras';
import { PreguntasFrecuentes } from '../muro/PreguntasFrecuentes';
import { Muro } from '../muro/Muro';
import { ordenarSecciones, puedePublicar, useStore } from '../state/store';
import { AvisoDatos } from './Entrada';
import { ThreadPanel } from '../thread/ThreadPanel';
import {
  IconEye,
  IconEyeOff,
  IconFit,
  IconHash,
  IconLogOut,
  IconMinus,
  IconPlus,
  IconSearch,
  IconUsers,
  IconWifiOff,
  IconX,
} from '../ui/icons';
import { Toasts } from '../ui/Toasts';

type Panel = 'search' | 'words' | 'menu' | null;

function randomColor(): PinColorId {
  return PIN_COLORS[Math.floor(Math.random() * PIN_COLORS.length)]!.id;
}

function Popover({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`popover sheet ${className}`} role="dialog" aria-label={title}>
      <header className="popover__head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <IconX />
        </button>
      </header>
      {children}
    </div>
  );
}

export function Pizarra() {
  const session = useStore((s) => s.session);
  const online = useStore((s) => s.online);
  const connected = useStore((s) => s.connected);
  const loaded = useStore((s) => s.loaded);
  const pinCount = useStore((s) => s.pins.size);
  const placing = useStore((s) => s.placing);
  const startPlacing = useStore((s) => s.startPlacing);
  const setSearch = useStore((s) => s.setSearch);
  const setSession = useStore((s) => s.setSession);
  const moderator = useStore((s) => s.moderator);
  const surface = useStore((s) => s.surface);
  const seccion = useStore((s) => s.seccion);
  const mapaSecciones = useStore((s) => s.secciones);
  const secciones = useMemo(() => ordenarSecciones(mapaSecciones), [mapaSecciones]);
  const seccionesCargadas = useStore((s) => s.seccionesCargadas);
  const oculta =
    mapaSecciones.get(seccion)?.estado === 'oculta' ||
    (seccionesCargadas && !mapaSecciones.has(seccion));
  const esLienzo = useStore((s) => (s.secciones.get(s.seccion)?.tipo ?? 'lienzo') === 'lienzo');
  const abierta = useStore(puedePublicar);
  const pedirRegistro = useStore((s) => s.pedirRegistro);
  const setSeccion = useStore((s) => s.setSeccion);
  const showPins = useStore((s) => s.showPins);
  const togglePins = useStore((s) => s.togglePins);
  // El mundo depende de la superficie; memoizado para no reiniciar el lienzo en cada render.
  const world = useMemo(() => worldOf(surface), [surface]);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);

  useRealtime(session?.token);

  // Al cambiar de superficie hay que pedir sus pines (los del otro lado ya se descartaron).
  useEffect(() => {
    void syncPins();
  }, [seccion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        if (!draft) useStore.getState().cancelPlacing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <div className={`app${placing ? ' app--placing' : ''}`}>
      {oculta && (
        <main className="muro">
          <p className="empty">Las secciones se están preparando. Vuelve en un momento.</p>
        </main>
      )}
      {!oculta &&
        !esLienzo &&
        (seccion === 'carreras' ? (
          <Carreras />
        ) : seccion === 'faq' ? (
          <PreguntasFrecuentes />
        ) : (
          <Muro key={seccion} nombre={secciones.find((x) => x.id === seccion)?.nombre ?? ''} />
        ))}
      {!oculta && esLienzo && (
        <Canvas
          nombre={surface === 'map' ? 'Mapa del campus' : 'Pizarra'}
          world={world}
          background={surface === 'map' ? (k) => <CampusLayer k={k} /> : undefined}
          onBoardClick={
            placing
              ? (x, y) => {
                  // Fuera del contorno de la universidad no se puede: se avisa en vez de fallar.
                  if (!canPlaceAt(surface, x, y)) {
                    useStore.getState().toast(OUTSIDE_CAMPUS_MESSAGE, 'error');
                    return;
                  }
                  if (invadeModeracion({ surface, x, y }, useStore.getState().pins.values())) {
                    useStore.getState().toast(ESPACIO_MODERACION, 'error');
                    return;
                  }
                  setDraft({ x, y });
                }
              : () => {
                  useStore.getState().openPin(null);
                  useStore.getState().closeBuilding();
                }
          }
        />
      )}

      <header className="topbar">
        <div className="brand">
          <span className="brand__dot" aria-hidden="true" />
          <span className="brand__name">Pizarra UdeC</span>
        </div>

        <div className="surface-switch" role="tablist" aria-label="Secciones">
          {secciones.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={seccion === x.id}
              className="surface-switch__btn"
              onClick={() => setSeccion(x.id)}
            >
              {x.nombre}
            </button>
          ))}
        </div>
        <div className="topbar__search desktop-only">
          <SearchBar />
        </div>
        <div className="topbar__right">
          {!esLienzo && !oculta && (
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={() => toggle('search')}
              aria-label="Buscar notas"
            >
              <IconSearch />
            </button>
          )}
          <span className="pill" title="Personas conectadas ahora">
            <IconUsers size={16} />
            {online}
          </span>
          {surface === 'map' && (
            <button
              type="button"
              className={`icon-btn${showPins ? '' : ' icon-btn--active'}`}
              onClick={togglePins}
              title={showPins ? 'Ocultar los pines' : 'Mostrar los pines'}
              aria-label={showPins ? 'Ocultar los pines' : 'Mostrar los pines'}
              aria-pressed={!showPins}
            >
              {showPins ? <IconEyeOff /> : <IconEye />}
            </button>
          )}
          <button
            type="button"
            className={`icon-btn desktop-only${panel === 'words' ? ' icon-btn--active' : ''}`}
            onClick={() => toggle('words')}
            title="Palabras más repetidas"
            aria-label="Palabras más repetidas"
          >
            <IconHash />
          </button>
          {session ? (
            <button
              type="button"
              className="avatar"
              onClick={() => toggle('menu')}
              aria-label="Menú de usuario"
              title={`${session.user.name} · ${session.user.institutionName}`}
            >
              {session.user.name.trim().charAt(0).toUpperCase()}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => toggle('menu')}
              aria-label="Menú"
            >
              Entrar
            </button>
          )}
        </div>
      </header>

      {loaded && connected === false && (
        <div className="banner" role="status">
          <IconWifiOff size={16} /> Reconectando…
        </div>
      )}

      {esLienzo && loaded && pinCount === 0 && !placing && surface === 'board' && (
        <div className="empty-hint">
          <p>La pizarra está vacía.</p>
          <p>
            {abierta ? (
              <>
                Toca <strong>Nueva nota</strong> para dejar la primera pregunta.
              </>
            ) : (
              <>Por ahora solo se puede leer.</>
            )}
          </p>
        </div>
      )}

      {!oculta && esLienzo && surface === 'map' && (
        <>
          <LeyendaMapa />
          <p className="atribucion">{campus.attribution}</p>
        </>
      )}

      {panel === 'words' && (
        <Popover
          title="Palabras más repetidas"
          onClose={() => setPanel(null)}
          className="popover--words"
        >
          <TopWords
            onPick={(w) => {
              setSearch(w);
              setPanel(window.matchMedia('(max-width: 767px)').matches ? 'search' : null);
            }}
          />
        </Popover>
      )}

      {panel === 'search' && (
        <Popover
          title="Buscar"
          onClose={() => setPanel(null)}
          className="popover--search mobile-only"
        >
          <SearchBar autoFocus onPick={() => setPanel(null)} />
        </Popover>
      )}

      {panel === 'menu' && (
        <Popover
          title={session ? 'Tu sesión' : 'Entrar'}
          onClose={() => setPanel(null)}
          className="popover--menu"
        >
          <div className="menu">
            {session ? (
              <p className="menu__who">
                <strong>{session.user.name}</strong>
                <span>{session.user.institutionName}</span>
              </p>
            ) : (
              <p className="menu__who">
                <span>Puedes mirar todo sin entrar. Tu nombre se pide solo para participar.</span>
              </p>
            )}
            {moderator && (
              <p className="menu__mod">
                Moderando como {moderator} · <a href="/moderador">Panel</a>
              </p>
            )}
            {session ? (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Cambiar tu nombre o institución? Tus pines anteriores se mantienen.',
                    )
                  ) {
                    setSession(null);
                  }
                }}
              >
                <IconLogOut size={18} /> Cambiar nombre
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => {
                  setPanel(null);
                  pedirRegistro('Deja tu nombre y tu institución para participar.');
                }}
              >
                Entrar
              </button>
            )}
            <AvisoDatos />
          </div>
        </Popover>
      )}

      {esLienzo && (
        <div className="zoombar">
          {surface === 'map' && (
            <button
              type="button"
              className="icon-btn zoom-ciudad"
              onClick={() => camera.verEntorno()}
              aria-label="Ver Concepción"
              title="Ver Concepción"
            >
              Ciudad
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => camera.zoomBy(1.4)}
            aria-label="Acercar"
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => camera.zoomBy(1 / 1.4)}
            aria-label="Alejar"
          >
            <IconMinus />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => camera.fitAll()}
            aria-label="Ver todos los pines"
            title="Ver todos los pines"
          >
            <IconFit />
          </button>
        </div>
      )}

      {esLienzo && !placing && (
        <nav className="dock" aria-label="Acciones">
          <button
            type="button"
            className="dock__btn mobile-only"
            onClick={() => toggle('search')}
            aria-label="Buscar"
          >
            <IconSearch />
            <span>Buscar</span>
          </button>
          {abierta ? (
            <button
              type="button"
              className="fab"
              onClick={() => {
                setPanel(null);
                pedirRegistro(
                  surface === 'map'
                    ? 'Para poner un pin en el mapa necesitamos tu nombre.'
                    : 'Para dejar una nota necesitamos tu nombre.',
                  () => startPlacing(randomColor()),
                );
              }}
            >
              <IconPlus size={22} />
              <span>{surface === 'map' ? 'Nuevo pin' : 'Nueva nota'}</span>
            </button>
          ) : (
            <p className="dock__cerrada">Esta sección quedó solo para leer.</p>
          )}
          <button
            type="button"
            className="dock__btn mobile-only"
            onClick={() => toggle('words')}
            aria-label="Palabras más repetidas"
          >
            <IconHash />
            <span>Palabras</span>
          </button>
        </nav>
      )}

      <Placement onPlace={(x, y) => setDraft({ x, y })} />
      {draft && placing && (
        <Composer at={draft} color={placing.color} onClose={() => setDraft(null)} />
      )}
      <ThreadPanel />
      <BuildingCard />
      <Toasts />
    </div>
  );
}
