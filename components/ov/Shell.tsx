import Image from 'next/image';
import Link from 'next/link';
import {
  Bell,
  Building2,
  Calculator,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  FileCheck,
  FileText,
  Filter,
  GraduationCap,
  Handshake,
  Home,
  House,
  Inbox,
  Landmark,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessagesSquare,
  Receipt,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getPrisma } from '@/lib/prisma';
import { can, ROLE_LABELS, type Portal } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import { logoutAction } from '@/app/(plataforma)/ingresar/actions';
import { NAV } from './nav';
import { NavLink } from './NavLink';

const ICONS: Record<string, LucideIcon> = {
  Bell, Building2, Calculator, CalendarDays, ChartColumn, ClipboardCheck, FileCheck, FileText, Filter,
  GraduationCap, Handshake, Home, House, Inbox, Landmark, LifeBuoy, Megaphone, MessagesSquare, Receipt,
  Settings2, ShieldCheck, UserCog, Users, UsersRound, Wallet,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export async function Shell({
  portal,
  session,
  children,
}: {
  portal: Portal;
  session: CurrentSession;
  children: React.ReactNode;
}) {
  const unread = await getPrisma().notification.count({ where: { userId: session.user.id, readAt: null } });
  const items = NAV[portal].filter((item) => !item.permission || can(session.user.role, item.permission));

  return (
    <div className="ov-app">
      <aside className="ov-side" aria-label="Navegación principal">
        <Link href={`/${portal}`} className="ov-brand">
          <Image src="/openv-simbolo.png" alt="" width={36} height={36} className="ov-mark" aria-hidden />
          <span>OpenV</span>
        </Link>
        <div className="ov-side__role">
          {portal === 'cliente' ? 'Portal cliente' : portal === 'aliado' ? 'Portal aliado' : 'Consola empresa'}
          <strong>{ROLE_LABELS[session.user.role]}</strong>
        </div>
        <nav className="ov-nav">
          {items.map((item, index) => {
            const Icon = ICONS[item.icon] ?? Home;
            const header = item.group && item.group !== items[index - 1]?.group ? item.group : undefined;
            return (
              <div key={item.href} style={{ display: 'contents' }}>
                {header && <div className="ov-nav__group">{header}</div>}
                <NavLink href={item.href} exact={item.href === `/${portal}`}>
                  <Icon size={19} aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="ov-side__foot">
          <Link href="/cuenta">Mi cuenta y seguridad</Link>
          <small>Centro de ayuda: contacto@viis.app</small>
          <form action={logoutAction}>
            <button type="submit"><LogOut size={16} aria-hidden /><span>Cerrar sesión</span></button>
          </form>
        </div>
      </aside>
      <div className="ov-main">
        <div className="ov-top" style={{ marginBottom: 0, justifyContent: 'flex-end' }}>
          <div className="ov-top__actions">
            <Link href="/cuenta/notificaciones" className="ov-bell" aria-label={`Notificaciones: ${unread} sin leer`}>
              <Bell size={19} aria-hidden />
              {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link href="/cuenta" className="ov-avatar" title={session.user.name} aria-label="Mi cuenta">
              {initials(session.user.name)}
            </Link>
          </div>
        </div>
        {children}
      </div>
      <nav className="ov-mobilebar" aria-label="Navegación móvil">
        {items
          .filter((item) => item.mobile)
          .slice(0, 5)
          .map((item) => {
            const Icon = ICONS[item.icon] ?? Home;
            return (
              <NavLink key={item.href} href={item.href} exact={item.href === `/${portal}`}>
                <Icon size={20} aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
    </div>
  );
}
