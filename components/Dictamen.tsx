import { dictamen } from '@/content/sitio';
import { sinHuerfanas } from '@/lib/tipografia';
import BotonContacto from './BotonContacto';

/** El hueco entre el sticker de la alcaldía y lo que exige un banco. Venta cruzada real con CNP. */
export default function Dictamen() {
  return (
    <section className="seccion seccion--suave">
      <div className="contenedor--lectura">
        {/* Encabezado solo con antetítulo y título; la prosa entera debajo. */}
        <div className="encabezado">
          <p className="eyebrow">{dictamen.eyebrow}</p>
          <h2 className="titulo-seccion">{sinHuerfanas(dictamen.titulo)}</h2>
        </div>
        <p className="bajada">{dictamen.cuerpo}</p>
        <p style={{ marginTop: 16, fontWeight: 600 }}>{dictamen.cierre}</p>
        <div style={{ marginTop: 22 }}>
          <BotonContacto mensaje={dictamen.mensaje} etiqueta={dictamen.cta} variante="secundario" />
        </div>
      </div>
    </section>
  );
}
