import Image from 'next/image';
import Link from 'next/link';
import { marca, MENSAJE_GENERICO, navLinks } from '@/content/sitio';
import BotonContacto from './BotonContacto';

export default function SiteHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        className="contenedor"
        style={{ display: 'flex', alignItems: 'center', gap: 24, height: 68 }}
      >
        {/*
          Logo real de la marca, recortado del archivo que pasó Santiago y con
          el fondo blanco vuelto transparente, para que se pose sobre el papel
          crema sin dejar un recuadro. 640×228 px reales mostrados a 128 px de
          ancho — o sea 5× de densidad, nítido en cualquier pantalla.
          `priority` porque está sobre el pliegue y es lo primero que da
          identidad.
        */}
        <Link href="/#inicio" style={{ display: 'flex', alignItems: 'center', lineHeight: 0 }}>
          <Image
            src="/logo-openv.png"
            alt={marca.nombre}
            width={640}
            height={228}
            priority
            className="logo-entrada"
            style={{ width: 128, height: 'auto' }}
          />
        </Link>

        {/* Un solo marginLeft:auto, en el bloque de la derecha: nav y CTA viajan juntos. */}
        <div
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 24 }}
        >
          <nav className="nav-escritorio" style={{ display: 'flex', gap: 20 }}>
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{ textDecoration: 'none', fontSize: 15, color: 'var(--ink-soft)' }}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <BotonContacto mensaje={MENSAJE_GENERICO} etiqueta="Escríbenos" />
        </div>
      </div>
    </header>
  );
}
