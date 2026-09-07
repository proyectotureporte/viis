import { porQueSabemos } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';

/**
 * El ancla de credibilidad de la página.
 *
 * Santiago pidió "genérale confianza a nuestros clientes". La respuesta no era
 * inventar sellos, testimonios ni años de experiencia: era MOSTRAR LA
 * PROFUNDIDAD QUE YA EXISTE. OpenV nació como el artefacto tecnológico de
 * una tesis doctoral sobre exactamente este problema, y detrás hay cifras
 * publicadas con fuente.
 *
 * 🔑 Regla de esta sección: CADA cifra lleva su fuente impresa al lado. Un
 * número sin fuente, en una página que está pidiendo confianza, resta en vez
 * de sumar — el lector no puede distinguirlo de una cifra inventada.
 */
export default function PorQueSabemos() {
  return (
    <section id="por-que-sabemos" className="seccion seccion--suave">
      <div className="contenedor--lectura">
        <div className="encabezado">
          <p className="eyebrow">{porQueSabemos.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(porQueSabemos.titulo)}</h2>
          <p className="bajada">{porQueSabemos.cuerpo}</p>
        </div>

        <div style={{ display: 'grid', gap: 20, marginTop: 36 }}>
          {porQueSabemos.cifras.map((c) => (
            <div
              key={c.dato}
              className="tarjeta"
              style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 30,
                  lineHeight: 1.05,
                  color: 'var(--acento-deep)',
                  minWidth: 132,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.dato}
              </p>
              <div style={{ flex: 1, minWidth: 240 }}>
                <p style={{ fontSize: 16 }}>{c.texto}</p>
                <span className="cifra-fuente">{c.fuente}</span>
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 30,
            fontFamily: 'var(--font-display)',
            fontSize: 21,
            lineHeight: 1.4,
            color: 'var(--ink)',
          }}
        >
          {porQueSabemos.cierre}
        </p>
      </div>
    </section>
  );
}
