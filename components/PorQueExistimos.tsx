import { porQueExistimos } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';

/** El alma de la marca: el abandono post-desembolso, del concepto de Open Vi. */
export default function PorQueExistimos() {
  return (
    <section className="seccion">
      <div className="contenedor--lectura">
        {/*
          El encabezado lleva SOLO antetítulo y título. La prosa va toda
          junta debajo: si un párrafo queda centrado dentro del encabezado y
          el siguiente alineado a la izquierda fuera, la sección se parte en
          dos alineaciones y vuelve la asimetría.
        */}
        <div className="encabezado">
          <p className="eyebrow">{porQueExistimos.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(porQueExistimos.titulo)}</h2>
        </div>
        <p className="bajada">{porQueExistimos.cuerpo}</p>
        <p className="bajada" style={{ marginTop: 18 }}>
          {porQueExistimos.cuerpoDos}
        </p>
        <p
          style={{
            marginTop: 16,
            fontSize: 19,
            fontWeight: 700,
            color: 'var(--acento-deep)',
          }}
        >
          {porQueExistimos.cierre}
        </p>
      </div>
    </section>
  );
}
