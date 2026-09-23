import type { Metadata } from 'next';
import { CONSENT_PURPOSES, CONSENT_VERSION } from '@/lib/consent';
import { responsable } from '../datos';

export const metadata: Metadata = { title: 'Política de tratamiento de datos personales', robots: { index: true, follow: true } };

export default function PrivacidadPage() {
  const r = responsable();
  return (
    <article>
      <h1>Política de tratamiento de datos personales</h1>
      <p className="ov-meta">Versión {CONSENT_VERSION} · Ley 1581 de 2012, Decreto 1074 de 2015 y Ley 1266 de 2008.</p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        {r.nombre}
        {r.nit ? `, NIT ${r.nit}` : ''}
        {r.domicilio ? `, con domicilio en ${r.domicilio}` : ''}. Correo para asuntos de datos personales: <strong>{r.correo}</strong>.
      </p>

      <h2>2. Datos que tratamos</h2>
      <p>Identificación y contacto; información de tu hogar, ingresos y gastos que declares; datos de tu crédito de vivienda y de tu inmueble; documentos que cargues; registros de uso y seguridad (fecha, dispositivo y un identificador irreversible de tu conexión, nunca tu IP en claro). Los datos de identificación y teléfono se guardan cifrados.</p>

      <h2>3. Finalidades</h2>
      <ul>
        {CONSENT_PURPOSES.map((p) => (
          <li key={p.code}><strong>{p.title}{p.required ? '' : ' (solo si la autorizas)'}:</strong> {p.text}</li>
        ))}
      </ul>

      <h2>4. Tus derechos</h2>
      <p>Como titular puedes: conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado del uso que se les ha dado; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización y solicitar la supresión cuando no exista un deber legal o contractual de conservarlos; y acceder gratuitamente a tus datos.</p>

      <h2>5. Cómo ejercerlos</h2>
      <p>Desde tu cuenta: <em>Gestiones → Mis datos personales (habeas data)</em>, o escribiendo a {r.correo}. Las consultas se responden en máximo diez (10) días hábiles y los reclamos en máximo quince (15) días hábiles, prorrogables en los términos del artículo 15 de la Ley 1581 de 2012. Las autorizaciones opcionales se pueden retirar en cualquier momento desde <em>Mi cuenta</em>.</p>

      <h2>6. Transmisión y transferencia</h2>
      <p>Solo compartimos tu expediente con entidades financieras cuando lo autorizas expresamente y para gestionar tu solicitud. Nuestros proveedores de infraestructura y correo actúan como encargados bajo obligaciones de confidencialidad y seguridad. No vendemos datos personales.</p>

      <h2>7. Seguridad</h2>
      <p>Aplicamos verificación en dos pasos obligatoria, cifrado en tránsito y en reposo, control de acceso por rol con mínimo privilegio, análisis antivirus de documentos, enlaces de descarga temporales con marca de agua y una bitácora de auditoría inalterable de consultas y cambios.</p>

      <h2>8. Conservación</h2>
      <p>Conservamos la información mientras exista la relación contigo y durante los términos legales aplicables a la documentación comercial y financiera. Cumplido el término, se suprime o anonimiza de forma controlada. Los registros de auditoría se conservan íntegros como prueba.</p>

      <h2>9. Simulaciones</h2>
      <p>Las simulaciones y recomendaciones de OpenV son ilustrativas y no constituyen una oferta vinculante ni una aprobación de crédito. Cada una indica sus supuestos, fuente, fecha y versión del motor de cálculo.</p>

      <h2>10. Vigencia</h2>
      <p>Esta política rige desde su publicación. Los cambios sustanciales se informarán por los canales registrados; cada autorización conserva la versión del texto que aceptaste.</p>
    </article>
  );
}
