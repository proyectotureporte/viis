'use client';

import { useSyncExternalStore } from 'react';
import { estadoDelPlazo } from '@/lib/plazo';


/**
 * Línea de tiempo del plazo para avisar el siniestro del seguro.
 *
 * 🔴 El "hoy" se calcula EN EL CLIENTE, después de montar, a propósito. Este
 * sitio es un export estático: si la fecha se horneara en el build, la página
 * seguiría diciendo los días que faltaban el día que se compiló, y en un mes
 * estaría mintiendo sobre el plazo más importante que tiene la persona.
 * Calcularlo en el render del servidor además provocaría desajuste de
 * hidratación. Antes de montar se pinta la línea sin el marcador de hoy.
 *
 * Y cuando el plazo vence, no se esconde: se dice, y se ofrece la salida real.
 */
export default function LineaTiempoSeguro() {
  const hoy = useSyncExternalStore(
    () => () => undefined,
    () => {
      const fecha = new Date();
      return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
    },
    () => '',
  );
  const plazo = hoy ? estadoDelPlazo(new Date()) : null;

  const diasRestantes = plazo?.diasRestantes ?? null;
  const transcurrido = plazo?.avance ?? 0;
  const vencido = plazo?.vencido ?? false;

  return (
    /*
      2026-09-04: esta tarjeta era un lavado rojo completo (borde y fondo de
      urgencia). Venía inmediatamente después de la sección cálida de
      reconocimiento, y ese salto se leía como que la empatía había sido la
      antesala de la presión — justo lo que dijimos que no íbamos a hacer.
      Ahora es una tarjeta blanca normal con el acento SOLO en la barra y en
      el número de días. La información urgente sigue siendo legible; el
      grito desapareció.
    */
    <div
      className="tarjeta"
      style={{
        borderLeft: '4px solid var(--alerta)',
        padding: '24px 24px 20px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 17 }}>
          Aviso del siniestro al seguro de terremoto
        </p>
        {diasRestantes !== null && (
          <p style={{ fontWeight: 700, color: 'var(--alerta)', fontSize: 17 }}>
            {vencido
              ? 'Plazo cumplido'
              : `${diasRestantes === 1 ? 'Queda' : 'Quedan'} ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`}
          </p>
        )}
      </div>

      {/* La barra de tiempo: recesiva, con los dos extremos rotulados. */}
      <div
        style={{
          height: 10,
          borderRadius: 4,
          background: 'var(--line)',
          overflow: 'hidden',
          marginTop: 14,
        }}
      >
        <div
          style={{
            width: `${transcurrido}%`,
            height: '100%',
            background: 'var(--alerta)',
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          color: 'var(--ink-soft)',
          marginTop: 8,
        }}
      >
        <span>10 de agosto · el sismo</span>
        <span>~8 de noviembre · último día</span>
      </div>

      {vencido && (
        <p style={{ fontSize: 14, marginTop: 12, color: 'var(--ink-soft)' }}>
          Aunque el plazo de aviso ya pasó, escríbenos igual: hay casos en los que todavía se puede
          reclamar, y las otras tres rutas siguen abiertas.
        </p>
      )}
    </div>
  );
}
