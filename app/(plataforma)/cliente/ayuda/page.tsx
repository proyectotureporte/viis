import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson } from '@/components/cliente/ui';
import { PageHeader, Section, Status } from '@/components/ov/ui';
import { clientPage } from '@/lib/cliente/page';
import { fechaDia, REQUEST_KINDS, REQUEST_STATUS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { createRequestAction } from '../gestiones/actions';

export const metadata: Metadata = { title: 'Ayuda' };

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: '¿Puedo abonar a mi crédito de vivienda sin pagar multa?',
    a: (
      <>
        Sí. La Ley 546 de 1999 (art. 17) establece que los créditos de vivienda de largo plazo pueden prepagarse total o parcialmente en cualquier momento <strong>sin penalidad</strong>, y que en un abono parcial tú eliges si reduce el <strong>plazo</strong> o la <strong>cuota</strong>. Pide a tu entidad que la elección quede por escrito y revisa el siguiente extracto. Antes de abonar, conserva un fondo de emergencia.
      </>
    ),
  },
  {
    q: '¿Qué es la UVR y por qué mi cuota sube?',
    a: (
      <>
        La UVR (Unidad de Valor Real) es una unidad que sigue la inflación; su valor diario lo certifica el Banco de la República. En un crédito en UVR la deuda se expresa en UVR: la cuota en pesos suele arrancar más baja que en un crédito a tasa fija, pero sube cuando hay inflación, y el saldo en pesos puede crecer durante los primeros años. Compara siempre con varios escenarios de inflación en <Link href="/cliente/decidir?sim=FIXED_VS_UVR">Pesos vs UVR</Link>.
      </>
    ),
  },
  {
    q: '¿Qué es una compra de cartera y cuándo conviene?',
    a: (
      <>
        Es trasladar tu crédito a otra entidad que paga tu saldo actual y te da un crédito nuevo, idealmente a menor tasa. Tiene costos (estudio de crédito, avalúo, notaría, registro de la nueva hipoteca) y requisitos. Conviene cuando el <strong>ahorro neto</strong>, después de costos, es positivo y se recupera antes de que planees vender. Simúlalo en <Link href="/cliente/decidir?sim=PORTFOLIO">Compra de cartera</Link>; también puedes pedirle a tu entidad actual que mejore la tasa.
      </>
    ),
  },
  {
    q: '¿Qué significa la tasa EA?',
    a: 'Efectiva anual: lo que cuesta el dinero en un año, incluyendo la capitalización mensual. Con una tasa del 12 % EA, el interés de un mes es cerca del 0,95 % del saldo. En “Mi crédito” te mostramos cuánto de cada cuota se va en intereses, en pesos.',
  },
  {
    q: '¿Tengo que tomar los seguros que ofrece el banco?',
    a: 'Los seguros de vida e incendio y terremoto protegen al hogar y a la entidad, y son exigidos en créditos hipotecarios. Puedes contratar una póliza por tu cuenta con coberturas equivalentes y pedir a tu entidad que la acepte. Un asesor puede ayudarte a comparar costo y cobertura.',
  },
  {
    q: '¿Qué pasa si no puedo pagar una cuota?',
    a: (
      <>
        Actúa antes del vencimiento: habla con tu entidad sobre periodos de gracia, ampliación de plazo o reestructuración. En OpenV activa el <Link href="/cliente/gestiones?nueva=HARDSHIP#nueva">Modo Tranquilidad</Link>: calculamos tu escenario y una persona te acompaña. Reportar un soporte en OpenV no reemplaza pagarle a tu entidad.
      </>
    ),
  },
  {
    q: '¿Qué derechos tengo sobre mis datos (habeas data)?',
    a: (
      <>
        Por la Ley 1581 de 2012 puedes conocer, actualizar, rectificar y pedir la supresión de tus datos, y revocar autorizaciones; la Ley 1266 de 2008 protege tu información financiera y crediticia. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles (prorrogables en los casos que la ley permite). Gestiona tus autorizaciones en <Link href="/cuenta">Mi cuenta</Link> o crea una solicitud de datos personales.
      </>
    ),
  },
  {
    q: '¿La valorización de mi vivienda en OpenV es un avalúo?',
    a: (
      <>
        No. Es una estimación con la fuente y la fecha que indicamos (muchas veces declarada por ti). Para trámites con bancos se necesita un avalúo de un perito inscrito en el Registro Abierto de Avaluadores; puedes <Link href="/cliente/vivienda#avaluo">solicitarlo aquí</Link>.
      </>
    ),
  },
  {
    q: '¿Las simulaciones son una oferta?',
    a: 'No. Son estimaciones con los datos y supuestos que mostramos, calculadas con un motor versionado. Las condiciones reales las fija tu entidad por escrito. Cada escenario guardado conserva sus supuestos y se puede descargar en PDF.',
  },
];

export default async function AyudaPage() {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Ayuda" />
        <NoPerson />
      </>
    );
  }
  const recent = await getPrisma().serviceRequest.findMany({
    where: { personId: person.id, kind: { in: ['ADVISOR', 'PQR', 'PRIVACY'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return (
    <>
      <PageHeader title="Ayuda" subtitle="Una persona del equipo te acompaña. Todo queda registrado con código y tiempo de respuesta." />
      <div className="ov-grid">
        <article className="ov-card s6" id="asesor">
          <h2>Hablar con un asesor</h2>
          <p className="ov-meta">Te contactamos en máximo {REQUEST_KINDS.ADVISOR.slaHours} horas por el medio que prefieras. Sin costo y sin compromiso.</p>
          <KeepForm action={createRequestAction} resetOnSuccess className="ov-form">
            <input type="hidden" name="kind" value="ADVISOR" />
            <label className="ov-field">
              <span>¿Sobre qué quieres hablar?</span>
              <select name="subject" defaultValue="Quiero revisar mi crédito con un asesor">
                <option>Quiero revisar mi crédito con un asesor</option>
                <option>Quiero revisar los seguros de mi crédito</option>
                <option>Quiero evaluar una compra de cartera</option>
                <option>Quiero comprar vivienda</option>
                <option>Quiero entender una simulación</option>
              </select>
            </label>
            <label className="ov-field">
              <span>Cuéntanos un poco más y cómo prefieres que te contactemos</span>
              <textarea name="detail" required minLength={10} maxLength={4000} placeholder="Por ejemplo: prefiero una llamada en la tarde." />
            </label>
            <Submit pendingText="Enviando…">Solicitar asesor</Submit>
          </KeepForm>
        </article>
        <article className="ov-card s6" id="pqr">
          <h2>Petición, queja o reclamo (PQR)</h2>
          <p className="ov-meta">Respuesta en máximo {Math.round(REQUEST_KINDS.PQR.slaHours / 24)} días. Si tu reclamo es con tu entidad financiera, también puedes acudir a su Defensor del Consumidor Financiero.</p>
          <KeepForm action={createRequestAction} resetOnSuccess className="ov-form">
            <input type="hidden" name="kind" value="PQR" />
            <label className="ov-field">
              <span>Asunto</span>
              <input name="subject" required minLength={4} maxLength={200} placeholder="Ej.: Reclamo por demora en mi solicitud" />
            </label>
            <label className="ov-field">
              <span>Detalle</span>
              <textarea name="detail" required minLength={10} maxLength={4000} placeholder="Qué pasó, cuándo y qué solución esperas." />
            </label>
            <Submit pendingText="Enviando…">Radicar PQR</Submit>
          </KeepForm>
        </article>
      </div>

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s6">
          <h2>Canales</h2>
          <dl className="ov-dl">
            <dt>Correo de soporte</dt>
            <dd><a href="mailto:contacto@viis.app">contacto@viis.app</a></dd>
            <dt>En la plataforma</dt>
            <dd><Link href="/cliente/gestiones#nueva">Crear una solicitud</Link> (con código y seguimiento)</dd>
            <dt>Tus datos personales</dt>
            <dd><Link href="/cliente/gestiones?nueva=PRIVACY#nueva">Solicitud de habeas data</Link></dd>
            <dt>Dificultades para pagar</dt>
            <dd><Link href="/cliente/gestiones?nueva=HARDSHIP#nueva">Modo Tranquilidad</Link> (respuesta en {REQUEST_KINDS.HARDSHIP.slaHours} horas)</dd>
          </dl>
          <p className="ov-meta" style={{ marginTop: 10 }}>OpenV nunca te pedirá tu contraseña, códigos de verificación ni dinero para pagar tu cuota. Si alguien lo hace a nombre de OpenV, repórtalo a contacto@viis.app.</p>
        </article>
        <article className="ov-card s6">
          <h2>Tus solicitudes recientes</h2>
          {recent.length ? (
            <div className="ov-list">
              {recent.map((r) => (
                <Link key={r.id} className="ov-row" href={`/cliente/gestiones?solicitud=${r.id}#solicitudes`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><strong>{r.code} · {r.subject}</strong><small>{REQUEST_KINDS[r.kind]?.label ?? r.kind} · {fechaDia(r.createdAt)}</small></div>
                  <Status tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Status>
                </Link>
              ))}
            </div>
          ) : (
            <p className="ov-meta">No tienes solicitudes de ayuda abiertas.</p>
          )}
        </article>
      </div>

      <Section title="Preguntas frecuentes" />
      <div className="cl-faq">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      <p className="ov-meta" style={{ marginTop: 12 }}>Información general, no asesoría legal ni financiera personalizada. Para tu caso concreto, habla con un asesor.</p>
    </>
  );
}
