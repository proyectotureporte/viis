import { queHacemos } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';

/**
 * La sección que faltaba y que era la causa real del problema de confianza:
 * la página nunca decía QUÉ HACE la empresa. Lo vago es lo que un público con
 * miedo a la estafa lee como humo.
 *
 * 2026-09-04: pasó de ser una lista numerada a un proceso visual. Los cinco
 * pasos van unidos por un hilo que **va de rojo a azul** — el mismo gesto del
 * isotipo, donde la casa es media roja y media azul. Es la forma más natural
 * de meter el rojo de marca sin que lea como alarma, porque acá el degradado
 * es identidad, no advertencia.
 */
export default function QueHacemos() {
  return (
    <section id="que-hacemos" className="seccion">
      <div className="contenedor--lectura">
        <div className="encabezado">
          <p className="eyebrow">{queHacemos.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(queHacemos.titulo)}</h2>
          <p className="bajada">{queHacemos.bajada}</p>
        </div>

        <ol className="pasos">
          {queHacemos.items.map((p) => (
            <li key={p.numero} className="paso">
              <span className="paso__numero" aria-hidden>
                {p.numero}
              </span>
              <div>
                <h3 style={{ fontSize: 20, marginTop: 12 }}>{sinHuerfanas(p.titulo)}</h3>
                <p style={{ color: 'var(--ink-soft)', marginTop: 8, fontSize: 15.5 }}>
                  {p.descripcion}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
