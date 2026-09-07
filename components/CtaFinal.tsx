import { ctaFinal } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';
import BotonContacto from './BotonContacto';

export default function CtaFinal() {
  return (
    <section className="seccion" style={{ background: 'var(--acento-deep)', color: '#fff' }}>
      <div className="contenedor--lectura" style={{ textAlign: 'center' }}>
        <h2 className="titulo-seccion">{sinHuerfanas(ctaFinal.titulo)}</h2>
        <p style={{ marginTop: 14, fontSize: 18, opacity: 0.9 }}>{ctaFinal.bajada}</p>
        <div style={{ marginTop: 24 }}>
          <BotonContacto
            mensaje={ctaFinal.mensaje}
            etiqueta={ctaFinal.cta}
            variante="secundario"
          />
        </div>
      </div>
    </section>
  );
}
