import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LockKeyhole, LogOut, Mail, MapPin, Phone } from 'lucide-react';
import { getPrisma } from '@/lib/prisma';
import { PANEL_COOKIE_NAME, validPanelSession } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Panel de solicitudes — VIIS',
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

function Login({ invalid }: { invalid: boolean }) {
  return (
    <main className="panel-login">
      <section className="panel-login__card">
        <div className="panel-login__icon"><LockKeyhole size={28} aria-hidden /></div>
        <p className="eyebrow">Acceso privado</p>
        <h1>Panel VIIS</h1>
        <p>Introduce la contraseña para consultar las solicitudes recibidas.</p>
        <form action="/api/panel/login" method="post" className="panel-login__form">
          <label className="campo">
            <span>Contraseña</span>
            <input name="password" type="password" autoComplete="current-password" required autoFocus />
          </label>
          {invalid && <p className="estado estado--error">Contraseña incorrecta o demasiados intentos.</p>}
          <button className="boton boton--primario" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}

export default async function PanelPage({ searchParams }: Props) {
  const [cookieStore, params] = await Promise.all([cookies(), searchParams]);
  if (!validPanelSession(cookieStore.get(PANEL_COOKIE_NAME)?.value)) {
    return <Login invalid={params.error === '1'} />;
  }

  const prisma = getPrisma();
  const [contacts, total, newCount] = await Promise.all([
    prisma.contactRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 250 }),
    prisma.contactRequest.count(),
    prisma.contactRequest.count({ where: { status: 'NEW' } }),
  ]);

  return (
    <main className="panel">
      <header className="panel__header">
        <div>
          <p className="eyebrow">Gestión privada</p>
          <h1>Solicitudes VIIS</h1>
          <p>Los 250 formularios más recientes, ordenados por fecha.</p>
        </div>
        <form action="/api/panel/logout" method="post">
          <button className="panel__logout" type="submit"><LogOut size={17} aria-hidden /> Salir</button>
        </form>
      </header>

      <section className="panel__metrics" aria-label="Resumen">
        <article><strong>{total}</strong><span>Solicitudes totales</span></article>
        <article><strong>{newCount}</strong><span>Pendientes de gestión</span></article>
        <article><strong>{contacts.filter((contact) => contact.notificationStatus === 'SENT').length}</strong><span>Correos enviados (en esta vista)</span></article>
      </section>

      <section className="panel__list" aria-label="Formularios recibidos">
        {contacts.length === 0 && <div className="panel__empty">Todavía no hay formularios recibidos.</div>}
        {contacts.map((contact) => (
          <article className="panel-lead" key={contact.id}>
            <div className="panel-lead__top">
              <div>
                <span className="panel-lead__date">{dateFormatter.format(contact.createdAt)}</span>
                <h2>{contact.name}</h2>
              </div>
              <div className="panel-lead__badges">
                <span className="panel-badge">{contact.status === 'NEW' ? 'Nuevo' : contact.status}</span>
                <span className={`panel-badge panel-badge--${contact.notificationStatus.toLowerCase()}`}>
                  Correo: {contact.notificationStatus === 'SENT' ? 'enviado' : contact.notificationStatus.toLowerCase()}
                </span>
              </div>
            </div>
            <div className="panel-lead__contact">
              {contact.email && <a href={`mailto:${contact.email}`}><Mail size={16} aria-hidden />{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`}><Phone size={16} aria-hidden />{contact.phone}</a>}
              {contact.city && <span><MapPin size={16} aria-hidden />{contact.city}</span>}
            </div>
            <p className="panel-lead__message">{contact.message}</p>
            <p className="panel-lead__source">Origen: {contact.source}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
