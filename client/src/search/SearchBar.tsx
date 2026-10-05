import { LIMITS, type SearchHit } from '@pizarra/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/http';
import { camera } from '../board/camera';
import { buscarEdificios } from '../map/buscar';
import { BUILDING_INFO, type Building } from '../map/campus';
import { useStore } from '../state/store';
import { IconSearch, IconX } from '../ui/icons';

const HL_START = '\uE000';
const HL_END = '\uE001';
const DEBOUNCE_MS = 300;

/** Pinta el snippet con las coincidencias resaltadas (sin HTML: solo texto y <mark>). */
function Snippet({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const s = rest.indexOf(HL_START);
    if (s === -1) {
      parts.push(rest);
      break;
    }
    const e = rest.indexOf(HL_END, s);
    if (s > 0) parts.push(rest.slice(0, s));
    parts.push(<mark key={key++}>{rest.slice(s + 1, e === -1 ? undefined : e)}</mark>);
    rest = e === -1 ? '' : rest.slice(e + 1);
  }
  return <>{parts}</>;
}

export function SearchBar({ autoFocus, onPick }: { autoFocus?: boolean; onPick?(): void }) {
  const query = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const setHighlight = useStore((s) => s.setHighlight);
  const openPin = useStore((s) => s.openPin);
  const openBuilding = useStore((s) => s.openBuilding);
  const surface = useStore((s) => s.surface);
  const seccion = useStore((s) => s.seccion);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Los edificios se buscan aquí mismo: son 85 nombres, no hace falta ir al servidor ni esperar.
  const edificios = useMemo(
    () => (surface === 'map' ? buscarEdificios(query) : []),
    [query, surface],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < LIMITS.search.min) {
      setHits(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api
        .search(q, seccion)
        .then((res) => {
          if (!alive) return;
          setHits(res);
          setOpen(true);
          setHighlight(new Set(res.map((h) => h.pinId)));
        })
        .catch(() => alive && setHits([]));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, seccion, setHighlight]);

  function pick(hit: SearchHit) {
    const pin = useStore.getState().pins.get(hit.pinId);
    if (pin?.temaId) useStore.getState().elegirTema(pin.temaId);
    if (pin && (seccion === 'mapa' || seccion === 'pizarra')) camera.flyTo(pin.x, pin.y, 1.6);
    openPin(hit.pinId);
    setOpen(false);
    onPick?.();
  }

  function pickBuilding(b: Building) {
    camera.flyTo(b.cx, b.cy, 2.2);
    // La ficha solo se abre si hay algo que mostrar, igual que al tocar el edificio en el mapa.
    if (b.id in BUILDING_INFO) openBuilding(b.id);
    setOpen(false);
    onPick?.();
  }

  return (
    <div className="search" role="search">
      <div className="search__field">
        <IconSearch size={18} className="search__icon" />
        <input
          ref={inputRef}
          className="search__input"
          type="search"
          placeholder={surface === 'map' ? 'Buscar lugares y mensajes' : 'Buscar en la pizarra'}
          aria-label={surface === 'map' ? 'Buscar lugares y mensajes' : 'Buscar en la pizarra'}
          maxLength={LIMITS.search.max}
          value={query}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => hits && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && hits?.[0]) pick(hits[0]);
          }}
        />
        {query && (
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Limpiar búsqueda"
            onClick={() => {
              setSearch('');
              setHits(null);
              inputRef.current?.focus();
            }}
          >
            <IconX size={16} />
          </button>
        )}
      </div>
      {open && (hits || edificios.length > 0) && (
        <div className="search__results" role="listbox" aria-label="Resultados">
          {edificios.length > 0 && (
            <>
              <p className="search__count">Lugares del campus</p>
              <ul>
                {edificios.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="search__hit"
                      onClick={() => pickBuilding(b)}
                    >
                      <span className="search__snippet">{b.name}</span>
                      <span className="search__meta">
                        {b.id in BUILDING_INFO ? 'Ver ficha del edificio' : 'Ir al edificio'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {hits && hits.length === 0 ? (
            edificios.length === 0 && (
              <p className="search__empty">Sin resultados para “{query.trim()}”.</p>
            )
          ) : (
            <>
              <p className="search__count">
                {hits && hits.length === 40 ? 'Más de 40' : (hits?.length ?? 0)}{' '}
                {hits?.length === 1 ? 'mensaje' : 'mensajes'}
              </p>
              <ul>
                {hits?.map((h) => (
                  <li key={`${h.kind}-${h.refId}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="search__hit"
                      onClick={() => pick(h)}
                    >
                      <span className="search__snippet">
                        <Snippet text={h.snippet} />
                      </span>
                      <span className="search__meta">
                        {h.kind === 'reply' ? 'Respuesta · ' : ''}
                        {h.authorName} · {h.institutionName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
