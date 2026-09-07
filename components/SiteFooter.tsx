import Image from 'next/image';
import { contacto, marca, navLinks, pie } from '@/content/sitio';

/**
 * 2026-09-04, revisión de simetría. El pie usaba el contenedor ANCHO (1120)
 * mientras todas las secciones de lectura usan 720 centrada, así que rompía
 * el eje vertical justo al final del recorrido — y encima venía inmediatamente
 * después del CTA, que sí está centrado. El salto era el más visible de la
 * página.
 *
 * Además eran cuatro párrafos sueltos a la izquierda, con dos medidas ad-hoc
 * (56ch y 72ch) que no coincidían entre sí ni con nada más.
 *
 * Ahora: mismo eje que el resto, centrado, y con estructura de verdad —
 * marca, qué somos, navegación que hace juego con la del encabezado, el
 * correo como acción visible, y el aviso legal separado por una línea.
 */
export default function SiteFooter() {
  return (
    <footer className="pie">
      <div className="contenedor--lectura">
        <div className="pie__marca">
          <Image
            src="/logo-openv.png"
            alt={marca.nombre}
            width={640}
            height={228}
            style={{ width: 116, height: 'auto' }}
          />
        </div>

        <p className="nota nota--cuerpo">{pie.descripcion}</p>

        <nav aria-label="Secciones del sitio">
          <ul className="pie__nav">
            {navLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <a className="pie__correo" href={`mailto:${contacto.correo}`}>
          {contacto.correo}
        </a>

        <hr className="pie__linea" />

        <p className="nota">{pie.aviso}</p>
      </div>
    </footer>
  );
}
