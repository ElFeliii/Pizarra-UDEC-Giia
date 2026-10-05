import type { Institution } from '@pizarra/shared';
import { useId, useMemo, useRef, useState } from 'react';
import { IconChevronDown } from '../ui/icons';

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '');

const GROUP_LABEL: Record<Institution['type'], string> = {
  colegio: 'Colegios',
  universidad: 'Universidades',
  otra: '',
};

/** Combobox accesible con búsqueda (la lista de colegios puede ser larga). */
export function InstitutionPicker({
  items,
  value,
  onChange,
  invalid,
}: {
  items: Institution[];
  value: Institution | null;
  onChange(i: Institution): void;
  invalid?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return items;
    // Se busca por nombre y por comuna: "coronel" lista los colegios de Coronel.
    return items.filter(
      (i) => i.type === 'otra' || fold(`${i.name} ${i.comuna ?? ''}`).includes(q),
    );
  }, [items, query]);

  function choose(i: Institution) {
    onChange(i);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  const listId = `${id}-list`;
  const activeItem = filtered[active];

  return (
    <div className="combo">
      <div className={`combo__field input${invalid ? ' input--invalid' : ''}`}>
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeItem ? `${id}-opt-${activeItem.id}` : undefined}
          aria-label="Institución"
          className="combo__input"
          placeholder={value ? value.name : 'Busca tu colegio o universidad'}
          value={open ? query : (value?.name ?? '')}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && activeItem) {
              e.preventDefault();
              choose(activeItem);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <IconChevronDown size={18} className="combo__chevron" />
      </div>
      {open && (
        <ul className="combo__list" id={listId} role="listbox" aria-label="Instituciones">
          {filtered.map((i, idx) => {
            const prev = filtered[idx - 1];
            const header =
              GROUP_LABEL[i.type] && prev?.type !== i.type ? GROUP_LABEL[i.type] : null;
            return (
              <li key={i.id} role="presentation">
                {header && <div className="combo__group">{header}</div>}
                <div
                  id={`${id}-opt-${i.id}`}
                  role="option"
                  aria-selected={value?.id === i.id}
                  className={`combo__option${idx === active ? ' combo__option--active' : ''}${i.type === 'otra' ? ' combo__option--other' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                  onMouseEnter={() => setActive(idx)}
                >
                  {i.type === 'otra' ? (
                    'Otra (escribir)…'
                  ) : (
                    <>
                      {i.name}
                      {i.comuna && <span className="combo__comuna">{i.comuna}</span>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
