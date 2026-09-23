/** Identificación del responsable. Se configura por entorno para no publicar datos sin validar. */
export function responsable() {
  return {
    nombre: process.env.LEGAL_NAME?.trim() || 'OpenV',
    nit: process.env.LEGAL_NIT?.trim(),
    domicilio: process.env.LEGAL_ADDRESS?.trim(),
    correo: process.env.LEGAL_EMAIL?.trim() || 'contacto@viis.app',
  };
}
