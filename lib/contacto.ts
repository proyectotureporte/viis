/** Un solo punto para construir el enlace al formulario de captación. */

export interface DatosContacto {
  /** Número en formato internacional sin signos, p. ej. '573151322640'. Vacío si aún no existe. */
  whatsapp: string;
  correo: string;
}

export function enlaceContacto(mensaje: string): string {
  return `/contacto?mensaje=${encodeURIComponent(mensaje)}`;
}
