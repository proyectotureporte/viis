import { describe, expect, it } from 'vitest';
import { enlaceContacto } from '@/lib/contacto';

const MENSAJE = 'Hola, mi vivienda se afectó con el sismo';

describe('enlaceContacto', () => {
  it('abre el formulario conservando el mensaje contextual', () => {
    const url = enlaceContacto(MENSAJE);
    expect(url).toBe(`/contacto?mensaje=${encodeURIComponent(MENSAJE)}`);
  });

  it('nunca devuelve cadena vacía ni "#"', () => {
    const url = enlaceContacto(MENSAJE);
    expect(url).not.toBe('');
    expect(url).not.toBe('#');
  });
});
