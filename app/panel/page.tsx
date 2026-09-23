import { redirect } from 'next/navigation';

/** El panel de contraseña única se reemplazó por la consola con MFA y permisos por rol. */
export default function PanelPage() {
  redirect('/empresa/leads');
}
