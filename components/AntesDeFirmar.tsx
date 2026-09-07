import { CircleCheck } from 'lucide-react';
import { sinHuerfanas } from '@/lib/tipografia';
import { antesDeFirmar } from '@/content/sitio';

/**
 * Reemplaza a la antigua matriz "banco por banco", que nombraba entidades con
 * su letra chica al lado. Santiago la mandó quitar —"no expongas a los
 * bancos"— y con razón de negocio: los bancos pagan la comisión de
 * intermediación de OpenV.
 *
 * El valor se conserva entero: la letra chica sigue siendo lo útil, pero se
 * entrega como una lista de qué revisar en CUALQUIER oferta, sin señalar a
 * nadie — y la comparación pasa a ser nuestro servicio.
 */
export default function AntesDeFirmar() {
  return (
    <section id="antes-de-firmar" className="seccion">
      <div className="contenedor--lectura">
        <div className="encabezado">
          <p className="eyebrow">{antesDeFirmar.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(antesDeFirmar.titulo)}</h2>
          <p className="bajada">{antesDeFirmar.bajada}</p>
        </div>

        <ul className="chequeos">
          {antesDeFirmar.items.map((item) => (
            <li key={item} className="chequeo">
              <CircleCheck
                size={19}
                color="var(--acento)"
                style={{ flexShrink: 0, marginTop: 2 }}
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p
          style={{
            marginTop: 28,
            padding: 20,
            background: 'var(--acento-soft)',
            borderRadius: 'var(--radio)',
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          {antesDeFirmar.cierre}
        </p>
      </div>
    </section>
  );
}
