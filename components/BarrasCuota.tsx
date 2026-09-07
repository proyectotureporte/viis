import { pesos, porcentaje } from '@/lib/formato';

interface Props {
  cuotaActual: number;
  cuotaOferta: number;
  reduccionPorcentaje: number;
}

/**
 * Comparación de la cuota de hoy contra la cuota al 8%. Esto SÍ es un gráfico
 * de datos: los dos valores salen de lib/credito.ts, que está testeado.
 *
 * Decisión de color, corregida el 4-sep con el validador de la skill de
 * dataviz: la primera versión usaba dos pasos del mismo azul (claro→oscuro),
 * pero eso es una escala SECUENCIAL, donde oscuro significa MÁS — y acá el
 * azul oscuro estaba en el valor MENOR. Estaba invertido.
 *
 * Lo correcto es un encoding de ANTES/DESPUÉS: el estado actual en gris
 * recesivo (es contexto) y la alternativa en color (es el punto). Además se
 * lee mejor: hoy apagado, lo posible vivo.
 *
 * Marcas: extremos redondeados de 4px anclados a la línea de base izquierda,
 * rótulo directo sobre cada barra (son solo dos, así que no hace falta leyenda
 * ni tooltip: todos los valores ya están escritos).
 */
export default function BarrasCuota({ cuotaActual, cuotaOferta, reduccionPorcentaje }: Props) {
  // La barra más larga define la escala; nunca se recorta el eje.
  const maximo = Math.max(cuotaActual, cuotaOferta, 1);
  const anchoActual = (cuotaActual / maximo) * 100;
  const anchoOferta = (cuotaOferta / maximo) * 100;

  const filas = [
    { etiqueta: 'Tu cuota hoy', valor: cuotaActual, ancho: anchoActual, tono: 'var(--line-strong)' },
    { etiqueta: 'Al 8% E.A.', valor: cuotaOferta, ancho: anchoOferta, tono: 'var(--acento)' },
  ];

  return (
    <figure style={{ margin: '0 0 20px' }} aria-label="Comparación de la cuota mensual">
      {filas.map((f) => (
        <div key={f.etiqueta} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 6,
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{f.etiqueta}</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 19,
                color: 'var(--ink)',
              }}
            >
              {pesos(f.valor)}
            </span>
          </div>
          <div
            style={{
              height: 14,
              borderRadius: 4,
              background: 'var(--line)',
              overflow: 'hidden',
            }}
          >
            <div
              className="barra-fill"
            style={{
                width: `${f.ancho}%`,
                height: '100%',
                borderRadius: 4,
                background: f.tono,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      ))}

      <figcaption
        style={{
          fontSize: 15,
          color: 'var(--ink-soft)',
          marginTop: 4,
        }}
      >
        Tu cuota baja{' '}
        <strong style={{ color: 'var(--acento-deep)' }}>
          {porcentaje(reduccionPorcentaje, 1)}%
        </strong>
        .
      </figcaption>
    </figure>
  );
}
