'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Retraso en milisegundos, para escalonar elementos hermanos. */
  retraso?: number;
}

/**
 * Revela su contenido al entrar en pantalla: aparece y sube unos píxeles.
 *
 * 🔴 REGLA DE SEGURIDAD, y es la parte importante: **el contenido arranca
 * VISIBLE**. La clase que lo oculta la pone JavaScript al montar, y solo a lo
 * que todavía está fuera de la pantalla. Si el JS falla, no carga o el
 * navegador es viejo, la página se ve completa — nunca en blanco. Una landing
 * que esconde su contenido con CSS y lo revela con JS es una landing que
 * algún día no muestra nada.
 *
 * Además:
 *  - Lo que ya está a la vista al cargar NO se anima. Así no hay parpadeo en
 *    el primer pliegue, que es lo que más se nota.
 *  - Respeta `prefers-reduced-motion`: si el sistema pide menos movimiento,
 *    ni siquiera se arma el observador.
 *  - Se desconecta al revelar. No queda nada escuchando el scroll.
 */
export default function Revelar({ children, retraso = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [animar, setAnimar] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (menosMovimiento || typeof IntersectionObserver === 'undefined') return;

    // Si ya está a la vista, se deja quieto: animarlo solo produciría parpadeo.
    const caja = el.getBoundingClientRect();
    if (caja.top < window.innerHeight * 0.92) return;

    setAnimar(true);

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            setVisible(true);
            observador.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const clase = animar ? (visible ? 'revelar revelar--visible' : 'revelar') : undefined;

  return (
    <div ref={ref} className={clase} style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}>
      {children}
    </div>
  );
}
