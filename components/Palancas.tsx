import { Check, ShieldCheck } from 'lucide-react';
import { sinHuerfanas } from '@/lib/tipografia';
import { palancasComprar, palancasCredito } from '@/content/sitio';

/**
 * La sección donde se cumple la decisión de posicionamiento: al que ya tiene
 * crédito NO se le promete el 8%, se le muestran las cuatro palancas que sí
 * son exigibles, cada una con su fundamento citado.
 */
export default function Palancas() {
  return (
    <section id="palancas" className="seccion seccion--suave">
      <div className="contenedor">
        <div className="encabezado">
          <h2 className="titulo-seccion">Tu palanca depende de dónde estés</h2>
        </div>
        <div className="rejilla rejilla--2" style={{ alignItems: "start" }}>
          <div className="tarjeta">
            <h3 style={{ fontSize: 22 }}>{sinHuerfanas(palancasComprar.titulo)}</h3>
            <p style={{ color: 'var(--ink-soft)', marginTop: 10 }}>{palancasComprar.bajada}</p>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 18, display: 'grid', gap: 10 }}>
              {palancasComprar.puntos.map((p) => (
                <li key={p} style={{ display: 'flex', gap: 10 }}>
                  <Check
                    size={18}
                    color="var(--acento)"
                    style={{ flexShrink: 0, marginTop: 3 }}
                    aria-hidden
                  />
                  <span style={{ fontSize: 15 }}>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tarjeta">
            <h3 style={{ fontSize: 22 }}>{sinHuerfanas(palancasCredito.titulo)}</h3>
            <p style={{ color: 'var(--ink-soft)', marginTop: 10 }}>{palancasCredito.bajada}</p>
            <ol style={{ listStyle: 'none', padding: 0, marginTop: 18, display: 'grid', gap: 18 }}>
              {palancasCredito.items.map((p) => (
                <li key={p.numero} style={{ display: 'flex', gap: 12 }}>
                  <ShieldCheck
                    size={20}
                    color="var(--acento)"
                    style={{ flexShrink: 0, marginTop: 2 }}
                    aria-hidden
                  />
                  <div>
                    <p style={{ fontWeight: 700 }}>{p.titulo}</p>
                    <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginTop: 4 }}>
                      {p.descripcion}
                    </p>
                    <p style={{ color: 'var(--ink-faint)', fontSize: 13, marginTop: 6 }}>
                      {p.fundamento}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
