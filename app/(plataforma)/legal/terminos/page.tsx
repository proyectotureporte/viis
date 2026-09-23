import type { Metadata } from 'next';
import { responsable } from '../datos';

export const metadata: Metadata = { title: 'Términos de uso', robots: { index: true, follow: true } };

export default function TerminosPage() {
  const r = responsable();
  return (
    <article>
      <h1>Términos de uso de la plataforma OpenV</h1>

      <h2>1. Qué es OpenV</h2>
      <p>OpenV es una plataforma para entender, controlar y optimizar créditos de vivienda, y para gestionar solicitudes con entidades financieras con la participación de asesores y aliados comerciales. OpenV no es un establecimiento de crédito: la aprobación, tasa y condiciones de cualquier crédito las define la entidad financiera.</p>

      <h2>2. Cuentas y seguridad</h2>
      <p>Cada cuenta es personal e intransferible y exige verificación en dos pasos. Eres responsable de custodiar tu contraseña, tu aplicación autenticadora y tus códigos de recuperación. Nunca te pediremos esos datos por teléfono, correo o mensajería.</p>

      <h2>3. Información que registras</h2>
      <p>Te comprometes a registrar información veraz. Los datos que declaras se marcan como &quot;declarados&quot; y los cálculos que dependen de ellos lo indican. Reportar un pago en la plataforma no sustituye pagarle al acreedor ni garantiza su imputación.</p>

      <h2>4. Simulaciones y recomendaciones</h2>
      <p>Las simulaciones son estimaciones no vinculantes basadas en los supuestos mostrados. Las recomendaciones indican los datos usados, la razón principal y la forma de solicitar revisión humana.</p>

      <h2>5. Aliados comerciales</h2>
      <p>Los aliados solo pueden registrar clientes con su autorización expresa, deben mantener vigentes sus certificaciones y usar la información únicamente para la finalidad autorizada. Sus comisiones se liquidan según las reglas versionadas publicadas en su portal.</p>

      <h2>6. Uso aceptable</h2>
      <p>No está permitido acceder a información de terceros sin autorización, intentar vulnerar la seguridad de la plataforma, cargar archivos maliciosos o usarla para fines distintos a la gestión de vivienda. Toda actividad queda registrada.</p>

      <h2>7. Contacto</h2>
      <p>{r.nombre} · {r.correo}</p>
    </article>
  );
}
