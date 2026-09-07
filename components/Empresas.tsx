import { empresas } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';
import BotonContacto from './BotonContacto';

/** La charla de 15-20 min en colegios y empresas que Fredy planteó en la reunión. */
export default function Empresas() {
  return (
    <section className="seccion">
      <div className="contenedor--lectura">
        <div className="tarjeta" style={{ padding: 32, textAlign: 'center' }}>
          <p className="eyebrow">{empresas.eyebrow}</p>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)' }}>{sinHuerfanas(empresas.titulo)}</h2>
          <p className="bajada">{empresas.cuerpo}</p>
          <div style={{ marginTop: 20 }}>
            <BotonContacto
              mensaje={empresas.mensaje}
              etiqueta={empresas.cta}
              variante="secundario"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
