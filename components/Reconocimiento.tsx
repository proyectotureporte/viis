import { reconocimiento, reconocimientoPermanente } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';
import { SoloEnVentana, SoloPermanente, TextoFase } from './SegunFase';

/**
 * El único momento cálido de la página, y va antes de pedir nada.
 *
 * Reglas de diseño de esta sección, que la diferencian del resto a propósito:
 *  - NO es una rejilla de tarjetas. El resto del sitio sí, y eso se lee como
 *    planilla. Acá tiene que leerse como alguien hablando.
 *  - Tipografía grande, medida corta (44ch) y mucho aire: se lee despacio.
 *  - Fondo cálido, el único del sitio.
 *  - Termina entregando algo ("hay cosas que ya son tuyas"), no pidiendo.
 *    Empatía que da, no empatía que extrae: el dolor nunca es palanca de venta.
 */
export default function Reconocimiento() {
  return (
    <section className="seccion--calida">
      <div className="contenedor--lectura">
        <div className="encabezado">
          <p className="eyebrow" style={{ color: 'var(--acento-deep)' }}>
            {reconocimiento.eyebrow}
          </p>
          <h2 className="titulo-seccion">{sinHuerfanas(reconocimiento.titulo)}</h2>
        </div>

        <SoloEnVentana>
          <ul className="reconocimiento-lista">
            {reconocimiento.puntos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </SoloEnVentana>
        <SoloPermanente>
          <ul className="reconocimiento-lista">
            {reconocimientoPermanente.puntos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </SoloPermanente>

        <p
          style={{
            marginTop: 36,
            fontSize: 18,
            lineHeight: 1.6,
            color: 'var(--ink-soft)',
          }}
          className="nota nota--cuerpo"
        >
          <TextoFase ventana={reconocimiento.cierre} permanente={reconocimientoPermanente.cierre} />
        </p>
      </div>
    </section>
  );
}
