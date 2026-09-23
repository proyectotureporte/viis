'use client';

import { useFormStatus } from 'react-dom';

/** Botón de envío con nombre/valor (para formularios con varias operaciones). */
export function OpButton({ name = 'op', value, children, className = 'ov-btn ov-btn--secondary ov-btn--small', confirm, title }: { name?: string; value: string; children: React.ReactNode; className?: string; confirm?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      title={title}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Casilla que marca/desmarca todas las casillas `name` del mismo formulario. */
export function CheckAll({ name = 'ids', label = 'Seleccionar todos' }: { name?: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`).forEach((box) => {
          box.checked = event.currentTarget.checked;
        });
      }}
    />
  );
}
