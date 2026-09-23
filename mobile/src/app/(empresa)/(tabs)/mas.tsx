import { router } from 'expo-router';
import { Bell, LogOut, Plus, UserRound } from 'lucide-react-native';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { useEmpresa } from '@/ui/empresa/context';
import { useDialog } from '@/ui/empresa/dialogs';
import { AREAS, PANEL_PREFERENCE, QUEUE_KEYS, routes, TAB_KEYS } from '@/ui/empresa/nav';
import { Count, Page } from '@/ui/empresa/ui';
import { Card, Row, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

/** Resto de áreas permitidas al rol y accesos de la sesión. */
export default function Mas() {
  const { user, logout } = useAuth();
  const { visible, badge, can, menu, menuError } = useEmpresa();
  const panelKey = PANEL_PREFERENCE.find(visible);
  const queues = QUEUE_KEYS.filter(visible);
  const inTabs = new Set([...TAB_KEYS, ...queues, ...(panelKey ? [panelKey] : [])]);
  const rest = AREAS.filter((a) => visible(a.key) && !inTabs.has(a.key));
  const groups = Array.from(new Set(rest.map((a) => a.group)));
  const dialog = useDialog();

  async function signOut() {
    if (await dialog.confirm({ title: 'Cerrar sesión', message: 'Tendrás que ingresar de nuevo con tu contraseña y código.', confirmLabel: 'Cerrar sesión', destructive: true })) await logout(false);
  }

  return (
    <Page tab title="Más" subtitle={`${user?.name ?? ''} · ${menu?.user.roleLabel ?? user?.roleLabel ?? ''}`}>
      {menuError ? <T v="small" style={{ color: colors.danger }}>{menuError}</T> : null}
      {groups.map((g) => (
        <Section key={g} title={g}>
          {rest
            .filter((a) => a.group === g)
            .map((a) => {
              const Icon = a.icon;
              return (
                <Card key={a.key} onPress={() => router.push(routes.area(a.key))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color={colors.navy2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="h3">{a.label}</T>
                    <T v="small">{menu?.areas.find((x) => x.key === a.key)?.badgeHint && badge(a.key) ? `${badge(a.key)} · ${menu.areas.find((x) => x.key === a.key)!.badgeHint}` : a.description}</T>
                  </View>
                  <Count n={badge(a.key)} />
                </Card>
              );
            })}
        </Section>
      ))}
      {rest.length === 0 ? <T v="muted" style={{ marginTop: space.md }}>Todas las áreas de tu rol ya están en la barra inferior.</T> : null}

      <Section title="Accesos">
        {can('case.create') ? <Row title="Nuevo caso" subtitle="Registrar cliente, caso y autorizaciones" onPress={() => router.push(routes.nuevoCaso())} right={<Plus size={18} color={colors.mintDeep} />} /> : null}
        <Row title="Notificaciones" subtitle={menu?.unreadNotifications ? `${menu.unreadNotifications} sin leer` : 'Avisos de la operación'} onPress={() => router.push('/notificaciones')} right={<Bell size={18} color={colors.muted} />} />
        <Row title="Mi cuenta" subtitle="Datos, seguridad y dispositivos" onPress={() => router.push('/cuenta')} right={<UserRound size={18} color={colors.muted} />} />
        <Row title="Cerrar sesión" onPress={signOut} right={<LogOut size={18} color={colors.danger} />} />
      </Section>
    </Page>
  );
}
