/**
 * El diagrama del hero: dos caminos que se separan el 10 de agosto.
 *
 * 🔴 DELIBERADAMENTE NO ES UN GRÁFICO DE DATOS. No existe una serie medida del
 * "valor de la casa" de nadie, así que dibujar una línea con eje numérico sería
 * inventar datos — justo en una página cuyo argumento entero descansa en cifras
 * verificadas. Por eso: sin eje Y, sin números, sin cuadrícula, y con la
 * palabra "esquema" escrita debajo. Ilustra el titular; no mide nada.
 *
 * Los dos colores están validados para daltonismo (ΔE 25,3 protan / 32,7 visión
 * normal sobre blanco), y cada camino lleva su rótulo directo, así que la
 * identidad nunca depende solo del color.
 */
export default function DiagramaCasaCuota() {
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 420 250"
        role="img"
        aria-label="Esquema: el 10 de agosto el estado de la casa cae mientras la cuota del crédito sigue igual."
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* Línea de base, recesiva */}
        <line x1="16" y1="212" x2="404" y2="212" stroke="var(--line-strong)" strokeWidth="1" />

        {/* Marcador del 10 de agosto */}
        <line
          x1="168"
          y1="34"
          x2="168"
          y2="212"
          stroke="var(--ink-faint)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text x="168" y="230" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
          10 de agosto
        </text>

        {/* La cuota: sigue plana. Va en NEUTRO — es lo constante, lo aburrido. */}
        <path
          className="trazo"
          pathLength={1}
          d="M16 78 L168 78 L404 78"
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle className="marca-diagrama" cx="404" cy="78" r="5" fill="var(--ink-faint)" />
        <text className="marca-diagrama" x="398" y="66" textAnchor="end" fontSize="13" fontWeight="700" fill="var(--ink-soft)">
          Tu cuota
        </text>

        {/* La casa: cae en el sismo. Va en TERRACOTA — es el drama, y es el punto. */}
        <path
          className="trazo trazo--casa"
          pathLength={1}
          d="M16 78 L168 78 L214 168 L404 176"
          fill="none"
          stroke="var(--alerta)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="marca-diagrama" cx="404" cy="176" r="5" fill="var(--alerta)" />
        <text className="marca-diagrama" x="398" y="198" textAnchor="end" fontSize="13" fontWeight="700" fill="var(--alerta)">
          Tu casa
        </text>

        {/* El hueco entre las dos: es el argumento de la página. */}
        <line
          x1="330"
          y1="80"
          x2="330"
          y2="174"
          stroke="var(--ink-faint)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>

      <figcaption
        style={{
          fontSize: 12,
          color: 'var(--ink-faint)',
          textAlign: 'center',
          marginTop: 6,
        }}
      >
        Esquema ilustrativo, no una medición.
      </figcaption>
    </figure>
  );
}
