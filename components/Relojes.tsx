import { AlarmClock } from 'lucide-react';
import { relojes } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';
import type { Reloj } from '@/lib/types';
import LineaTiempoSeguro from './LineaTiempoSeguro';
import { SoloEnVentana } from './SegunFase';

/**
 * Era la sección más cargada de la página (1.487 caracteres de texto corrido)
 * y Santiago pidió que no se viera tan cargada **sin perder información**. La
 * salida no fue recortar sino escalonar: fecha, título y un resumen de una
 * línea, con el detalle completo a un clic en un `<details>` nativo. Sin
 * JavaScript, accesible con teclado, y no se borró una sola palabra.
 *
 * FASES: el reloj del seguro es el ÚNICO de los cuatro con fecha de
 * vencimiento — el RUD, la ventana del 8% y la Ley 2597 no tienen cierre
 * publicado. Pasado el 8-nov, el del seguro se cae solo y los otros tres se
 * quedan, así que la sección sigue teniendo sentido sin que nadie la edite.
 */
function TarjetaReloj({ reloj }: { reloj: Reloj }) {
  const urgente = reloj.urgente;
  return (
    <article
      className="tarjeta"
      style={
        urgente ? { borderColor: 'var(--alerta)', background: 'var(--alerta-soft)' } : undefined
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlarmClock size={18} color={urgente ? 'var(--alerta)' : 'var(--ink-faint)'} aria-hidden />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.01em',
            color: urgente ? 'var(--alerta)' : 'var(--ink-soft)',
          }}
        >
          {reloj.fecha}
        </span>
      </div>

      <h3 style={{ fontSize: 20, marginTop: 10 }}>{sinHuerfanas(reloj.titulo)}</h3>
      <p style={{ color: 'var(--ink-soft)', marginTop: 8, fontSize: 15.5 }}>{reloj.resumen}</p>

      <details className="desplegable">
        <summary>Ver el detalle</summary>
        <p className="desplegable__cuerpo">{reloj.detalle}</p>
      </details>
    </article>
  );
}

export default function Relojes() {
  return (
    <section id="relojes" className="seccion seccion--suave">
      <div className="contenedor">
        <div className="encabezado">
          <p className="eyebrow">{relojes.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(relojes.titulo)}</h2>
          <p className="bajada">{relojes.bajada}</p>
        </div>

        {/*
          La cuenta regresiva solo existe mientras el plazo viva. Dejar un
          contador vencido en pantalla sería la peor forma de envejecer.
        */}
        <SoloEnVentana>
          <LineaTiempoSeguro />
        </SoloEnVentana>

        <div className="rejilla rejilla--2">
          {relojes.items.map((reloj) =>
            reloj.urgente ? (
              <SoloEnVentana key={reloj.id}>
                <TarjetaReloj reloj={reloj} />
              </SoloEnVentana>
            ) : (
              <TarjetaReloj key={reloj.id} reloj={reloj} />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
