import type { SVGProps } from 'react';

export function Corona(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3 6 7 10 12 3 17 10 21 6 19 18H5Z" />
      <path d="M5 21H19" fill="none" />
    </svg>
  );
}

export function MarcaModeracion({ nombre }: { nombre: string }) {
  return (
    <span
      className="insignia-moderacion"
      title={`Publicado por ${nombre}, del equipo de moderación`}
    >
      <Corona /> Moderación
    </span>
  );
}
