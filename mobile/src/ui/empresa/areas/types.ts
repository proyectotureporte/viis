/** Props comunes de un área: como pestaña (con título y campana) o bajo la pila (encabezado nativo). */
export interface AreaProps {
  tab?: boolean;
  title?: string;
  /** Contenido previo (p. ej. el selector de colas de "Pendientes"). */
  header?: React.ReactNode;
}
