import { ArrowRight, Building2, FileSearch, HandCoins, Home, Landmark, ShieldCheck } from 'lucide-react';
import {
  avisoPermanente,
  avisoSeguro,
  hero,
  heroPermanente,
  momentos,
} from '@/content/sitio';
import { enlaceContacto } from '@/lib/contacto';
import { sinHuerfanas } from '@/lib/tipografia';
import type { Momento } from '@/lib/types';
import DiagramaCasaCuota from './DiagramaCasaCuota';
import { TextoFase } from './SegunFase';

const ICONOS: Record<Momento['icono'], typeof Home> = {
  sismo: Home,
  comprar: Building2,
  credito: Landmark,
  cuota: HandCoins,
  cobros: FileSearch,
};

/**
 * El selector califica al visitante ANTES de que escriba.
 *
 * 2026-09-04: antes eran 5 tarjetas en una rejilla de 3 — o sea 3 arriba y 2
 * huérfanas abajo con un hueco a la derecha, que era la asimetría más visible
 * del sitio. Ahora la tarjeta de campaña (el damnificado, que es el público
 * que llega de la pauta) va DESTACADA a lo ancho, y las otras cuatro caen en
 * una fila exacta de 4. Queda simétrico en escritorio, en tableta (2×2) y en
 * celular (1 columna), y de paso gana jerarquía.
 */
export default function Hero() {
  const [destacado, ...resto] = momentos;

  return (
    <section
      id="inicio"
      className="seccion"
      style={{
        paddingTop: 56,
        background: 'linear-gradient(180deg, var(--acento-soft) 0%, rgba(229,238,252,0) 62%)',
      }}
    >
      <div className="contenedor">
        <div className="hero-split">
          <div>
            <p className="eyebrow">
              <TextoFase ventana={hero.eyebrow} permanente={heroPermanente.eyebrow} />
            </p>
            {/*
              El titular es lo único que cambia de fase en el primer pliegue.
              Por defecto se pinta el PERMANENTE; si la fecha confirma que la
              ventana sigue abierta, el cliente lo cambia por el del sismo.
            */}
            <h1 style={{ fontSize: 'clamp(36px, 5.8vw, 66px)' }}>
              <TextoFase
                ventana={sinHuerfanas(hero.titularParte1)}
                permanente={sinHuerfanas(heroPermanente.titularParte1)}
              />{' '}
              <span style={{ color: 'var(--acento)' }}>
                <TextoFase
                  ventana={sinHuerfanas(hero.titularParte2)}
                  permanente={sinHuerfanas(heroPermanente.titularParte2)}
                />
              </span>
            </h1>
            <p className="bajada" style={{ marginTop: 20 }}>
              <TextoFase ventana={hero.bajada} permanente={heroPermanente.bajada} />
            </p>
          </div>
          <DiagramaCasaCuota />
        </div>

        {/*
          El plazo del seguro, arriba y en tono de noticia buena. Azul sereno
          a propósito: si esto fuera rojo, la página abriría presionando.
        */}
        <a
          href="#relojes"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 40,
            padding: '18px 22px',
            borderRadius: 'var(--radio)',
            background: 'var(--acento-soft)',
            border: '1px solid var(--acento-bright)',
            textDecoration: 'none',
            flexWrap: 'wrap',
          }}
        >
          <ShieldCheck size={24} color="var(--acento-deep)" style={{ flexShrink: 0 }} aria-hidden />
          <span style={{ flex: 1, minWidth: 240, fontSize: 16 }}>
            <TextoFase ventana={avisoSeguro.texto} permanente={avisoPermanente.texto} />
          </span>
          <span
            style={{
              color: 'var(--acento-deep)',
              fontWeight: 700,
              fontSize: 15,
              whiteSpace: 'nowrap',
            }}
          >
            <TextoFase ventana={avisoSeguro.enlaceTexto} permanente={avisoPermanente.enlaceTexto} /> →
          </span>
        </a>

        <h2 style={{ fontSize: 22, marginTop: 48, marginBottom: 18 }}>
          {hero.preguntaSelector}
        </h2>

        {/* La tarjeta de campaña, destacada a lo ancho. */}
        <a
          className="tarjeta tarjeta--destacada"
          href={enlaceContacto(destacado.mensaje)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Home size={26} color="var(--alerta)" style={{ flexShrink: 0 }} aria-hidden />
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                  fontSize: 21,
                }}
              >
                {destacado.titulo}
              </p>
              <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginTop: 4 }}>
                {destacado.resumen}
              </p>
            </div>
            <ArrowRight size={22} color="var(--alerta)" style={{ flexShrink: 0 }} aria-hidden />
          </div>
        </a>

        {/* Las otras cuatro: fila exacta, sin huérfanas. */}
        <div className="rejilla rejilla--4" style={{ marginTop: 18 }}>
          {resto.map((m) => {
            const Icono = ICONOS[m.icono];
            return (
              <a
                key={m.id}
                className="tarjeta"
                href={enlaceContacto(m.mensaje)}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <Icono size={22} color="var(--acento)" aria-hidden />
                <p
                  style={{
                    fontWeight: 700,
                    marginTop: 12,
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                  }}
                >
                  {m.titulo}
                </p>
                <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 6 }}>{m.resumen}</p>
              </a>
            );
          })}
        </div>

        <p style={{ color: 'var(--ink-faint)', fontSize: 14, marginTop: 18 }}>{hero.nota}</p>
      </div>
    </section>
  );
}
