/**
 * Un momento del visitante. Ramifica y califica ANTES de que escriba —
 * es lo que Fredy exigió en la reunión del 3-sep: "la campaña tiene que
 * tener un estatus... esto es para el que casi está listo".
 */
export interface Momento {
  id: string;
  titulo: string;
  resumen: string;
  mensaje: string;
  icono: 'sismo' | 'comprar' | 'credito' | 'cuota' | 'cobros';
}

/** Un plazo real que corre contra el visitante. */
export interface Reloj {
  id: string;
  titulo: string;
  fecha: string;
  /** Una línea, para leer de un vistazo. El detalle va plegado debajo. */
  resumen: string;
  detalle: string;
  /** true solo para el que tiene fecha dura; se pinta en el color de urgencia. */
  urgente: boolean;
}

/** Una palanca exigible, con su fundamento citado. */
export interface Palanca {
  numero: number;
  titulo: string;
  descripcion: string;
  fundamento: string;
}
