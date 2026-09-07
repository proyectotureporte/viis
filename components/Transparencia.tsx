import { Info } from 'lucide-react';
import { sinHuerfanas } from '@/lib/tipografia';
import { transparencia } from '@/content/sitio';

/**
 * No es un disclaimer decorativo: es parte del producto. Es donde la página
 * dice en voz alta que NO promete el 8%.
 */
export default function Transparencia() {
  return (
    <section id="transparencia" className="seccion seccion--suave">
      <div className="contenedor--lectura">
        <div className="encabezado">
          <p className="eyebrow">{transparencia.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(transparencia.titulo)}</h2>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 26, display: 'grid', gap: 14 }}>
          {transparencia.puntos.map((p) => (
            <li key={p} className="tarjeta" style={{ display: 'flex', gap: 12 }}>
              <Info
                size={18}
                color="var(--acento)"
                style={{ flexShrink: 0, marginTop: 4 }}
                aria-hidden
              />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
