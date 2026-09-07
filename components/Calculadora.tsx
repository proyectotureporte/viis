'use client';

import { useState } from 'react';
import { sinHuerfanas } from '@/lib/tipografia';
import { calculadora, cargaHabitacional, TASA_MERCADO, TASA_OFERTA } from '@/content/sitio';
import { compararTasas, mesesConCuota } from '@/lib/credito';
import { milesTexto, pesos, porcentaje, soloDigitos } from '@/lib/formato';
import BarrasCuota from './BarrasCuota';
import BotonContacto from './BotonContacto';

/**
 * Único componente cliente de la página. La matemática NO vive acá: vive en
 * lib/credito.ts, que está testeado contra las cifras publicadas. Este
 * componente solo pinta.
 */
export default function Calculadora() {
  const [capital, setCapital] = useState(200_000_000);
  const [anios, setAnios] = useState(20);
  const [tasaActual, setTasaActual] = useState(TASA_MERCADO * 100);
  const [mostrarAyudaTasa, setMostrarAyudaTasa] = useState(false);
  const [ingreso, setIngreso] = useState(0);

  const r = compararTasas(capital, tasaActual / 100, TASA_OFERTA, anios);
  const hayAhorro = r.ahorroMensual > 0;

  /*
   * Carga habitacional según el estándar 30/50: por encima del 30% del ingreso
   * del hogar hay sobrecarga, por encima del 50% es severa. El color va SIEMPRE
   * acompañado de la etiqueta de texto — nunca se comunica un estado solo con
   * color.
   */
  const carga = ingreso > 0 ? (r.cuotaOferta / ingreso) * 100 : 0;
  const nivelCarga =
    carga >= 50
      ? { etiqueta: 'Sobrecarga severa', color: 'var(--acento-deep)' }
      : carga >= 30
        ? { etiqueta: 'Sobrecarga', color: 'var(--acento)' }
        : { etiqueta: 'Dentro de lo sostenible', color: 'var(--bueno)' };

  /*
   * Si consigue el 8% y NO baja la cuota —sigue pagando lo mismo— el plazo se
   * acorta. Se muestra en años y meses porque "9,7 años" no se entiende, y
   * solo cuando de verdad termina antes.
   */
  const mesesNuevos = mesesConCuota(capital, TASA_OFERTA, r.cuotaActual);
  const terminaAntes = Number.isFinite(mesesNuevos) && mesesNuevos < anios * 12 - 6;
  const aniosNuevos = Math.floor(mesesNuevos / 12);
  const restoMeses = Math.round(mesesNuevos % 12);
  const textoPlazoNuevo =
    restoMeses === 0
      ? `${aniosNuevos} años`
      : `${aniosNuevos} años y ${restoMeses} ${restoMeses === 1 ? 'mes' : 'meses'}`;

  const mensaje =
    `Hola, corrí la calculadora de viis.app: crédito de ${pesos(capital)} a ${anios} años al ` +
    `${porcentaje(tasaActual, 2)}% E.A. Mi cuota bajaría ${porcentaje(r.reduccionPorcentaje, 1)}% ` +
    `(${pesos(r.ahorroMensual)} menos al mes). Quiero que revisen mi caso.`;

  return (
    <section id="calculadora" className="seccion">
      <div className="contenedor">
        <div className="encabezado">
          <p className="eyebrow">{calculadora.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(calculadora.titulo)}</h2>
          <p className="bajada">{calculadora.bajada}</p>
        </div>

        <div className="rejilla rejilla--2" style={{ marginTop: 32, alignItems: 'start' }}>
          <div className="tarjeta">
            {/*
              Campo de PESOS, no `type="number"`. Tres razones, y las tres se
              vieron en pantalla:
                1. `type="number"` con estado inicial 0 mostraba "0", y al
                   escribir encima quedaba "04200000".
                2. No admite separador de miles, así que nadie distingue
                   4.200.000 de 42.000.000 mientras teclea.
                3. Las flechitas de incremento no sirven para nada con cifras
                   de ocho dígitos.
              `inputMode="numeric"` conserva el teclado numérico en celular,
              que es de donde llega el tráfico de campaña.
            */}
            <label className="campo">
              <span>Valor del crédito</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="200.000.000"
                value={milesTexto(capital)}
                onChange={(e) => setCapital(soloDigitos(e.target.value))}
              />
            </label>
            <label className="campo">
              <span>Plazo: {anios} años</span>
              <input
                type="range"
                min={5}
                max={30}
                step={1}
                value={anios}
                onChange={(e) => setAnios(Number(e.target.value))}
              />
            </label>
            <label className="campo" style={{ marginBottom: 0 }}>
              <span>Tu tasa actual (% E.A.)</span>
              <input
                type="number"
                min={0}
                max={40}
                step={0.01}
                value={tasaActual}
                onChange={(e) => setTasaActual(Number(e.target.value))}
              />
            </label>

            {/*
              La revisión como cliente encontró que la calculadora exigía un
              dato que un damnificado normalmente no tiene a la mano. Sin esta
              salida, quien no se sepa la tasa simplemente abandona.
            */}
            <button
              type="button"
              onClick={() => {
                setTasaActual(TASA_MERCADO * 100);
                setMostrarAyudaTasa(true);
              }}
              style={{
                marginTop: 10,
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--acento)',
                fontSize: 14,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              No sé mi tasa
            </button>

            {mostrarAyudaTasa && (
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 10 }}>
                Te dejamos el promedio del mercado ({porcentaje(TASA_MERCADO * 100, 2)}%). La tuya
                aparece en tu extracto como <strong>tasa efectiva anual</strong>. Si no la
                encuentras, escríbenos y la buscamos contigo.
              </p>
            )}
          </div>

          <div
            className="tarjeta"
            style={{ borderColor: 'var(--acento-bright)', borderWidth: 2 }}
          >
            <BarrasCuota
              cuotaActual={r.cuotaActual}
              cuotaOferta={r.cuotaOferta}
              reduccionPorcentaje={r.reduccionPorcentaje}
            />
            {hayAhorro ? (
              <>
                {/* El ahorro mensual como cifra ancla: es el número que la gente recuerda. */}
                <p style={{ fontSize: 15, color: 'var(--ink-soft)' }}>Te quedan cada mes</p>
                <p className="cifra-ancla">{pesos(r.ahorroMensual)}</p>
                <hr
                  style={{ border: 0, borderTop: '1px solid var(--line-strong)', margin: '18px 0' }}
                />
                <p>
                  En total, hasta terminar de pagar: <strong>{pesos(r.ahorroTotal)}</strong>.
                </p>

                {/*
                  2026-09-04: acá decía "la misma cuota compra X% más casa".
                  Santiago lo señaló y tenía razón por dos motivos. Uno, quien
                  mira esta tarjeta YA TIENE crédito: ya compró su casa, no le
                  sirve saber que podría comprar más. Y dos, más grave: la
                  propia página advierte dos secciones abajo que pasar del 30%
                  del ingreso es sobrecarga — invitar a endeudarse un 53% más
                  la contradecía de frente.

                  Con los mismos datos hay una cifra que va en la dirección
                  correcta y que además es la pregunta real de quien ya está
                  pagando: si consigo el 8% y sigo pagando lo mismo, ¿cuándo
                  termino? Terminar antes, no deber más.
                */}
                {terminaAntes && (
                  <p style={{ marginTop: 6 }}>
                    Y si sigues pagando la misma cuota de hoy, terminarías en{' '}
                    <strong>{textoPlazoNuevo}</strong> en vez de {anios} años.
                  </p>
                )}
              </>
            ) : (
              <p>
                Tu tasa ya está en el 8% o por debajo. Aun así hay palancas que revisar: el seguro,
                el plazo y los cobros de tu crédito.
              </p>
            )}
            <div style={{ marginTop: 20 }}>
              <BotonContacto mensaje={mensaje} etiqueta={calculadora.cta} />
            </div>
          </div>
        </div>

        {/*
          La pregunta que el banco NO hace. No es un criterio inventado por
          nosotros: es el estándar de carga habitacional 30/50, y por eso se
          cita la fuente al lado. Es opcional — si no pone ingreso, no molesta.
        */}
        <div className="tarjeta" style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 21 }}>{sinHuerfanas(cargaHabitacional.titulo)}</h3>
          <p style={{ color: 'var(--ink-soft)', marginTop: 10, fontSize: 16 }}>
            {cargaHabitacional.cuerpo}
          </p>

          <div className="rejilla rejilla--2" style={{ marginTop: 18, alignItems: 'end' }}>
            <label className="campo" style={{ marginBottom: 0 }}>
              <span>{cargaHabitacional.etiquetaIngreso}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 4.200.000"
                value={milesTexto(ingreso)}
                onChange={(e) => setIngreso(soloDigitos(e.target.value))}
              />
            </label>

            {ingreso > 0 && (
              <div>
                <p style={{ fontSize: 15, color: 'var(--ink-soft)' }}>
                  La cuota al 8% se llevaría
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 34,
                    lineHeight: 1.1,
                    color: nivelCarga.color,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {porcentaje(carga, 0)}% de tu ingreso
                </p>
                <p style={{ fontSize: 15, marginTop: 4, color: nivelCarga.color, fontWeight: 600 }}>
                  {nivelCarga.etiqueta}
                </p>
              </div>
            )}
          </div>

          <span className="cifra-fuente">{cargaHabitacional.fuente}</span>
        </div>

        <p className="nota" style={{ marginTop: 24 }}>
          {calculadora.supuestos}
        </p>
        <p className="nota nota--cuerpo" style={{ marginTop: 12 }}>
          {calculadora.notaPrensa}
        </p>
      </div>
    </section>
  );
}
