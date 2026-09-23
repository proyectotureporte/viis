import { router } from 'expo-router';
import { Bell, GraduationCap, KanbanSquare, LogOut, UserRound, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { HeaderActions } from '@/ui/aliado/HeaderActions';
import { ConfirmSheet } from '@/ui/aliado/parts';
import { Button, Card, Row, Screen, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

function Icono({ children }: { children: React.ReactNode }) {
  return <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

export default function Mas() {
  const { user, logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const admin = user?.role === 'ALLY_ADMIN';
  const unread = user?.unreadNotifications ?? 0;

  return (
    <Screen title="Más" right={<HeaderActions />}>
      <Card style={{ gap: 4 }}>
        <T v="h2">{user?.name}</T>
        <T v="small">{user?.roleLabel}{user?.organization ? ` · ${user.organization.name}` : ''}</T>
        <T v="small">{user?.email}</T>
      </Card>

      <Section title="Trabajo">
        <Row title="Academia" subtitle="Cursos, evaluaciones y certificaciones para radicar" right={<Icono><GraduationCap size={18} color={colors.navy} /></Icono>} onPress={() => router.push('/(aliado)/mas/academia')} />
        <Row title="Embudo" subtitle="Casos por etapa, conversión y tiempo por etapa" right={<Icono><KanbanSquare size={18} color={colors.navy} /></Icono>} onPress={() => router.push('/(aliado)/mas/embudo')} />
        {admin ? <Row title="Equipo" subtitle="Meta mensual, consolidado por aliado, invitaciones y reparto" right={<Icono><UsersRound size={18} color={colors.navy} /></Icono>} onPress={() => router.push('/(aliado)/mas/equipo')} /> : null}
      </Section>

      <Section title="Cuenta">
        <Row title="Notificaciones" subtitle={unread ? `${unread} sin leer` : 'Todo al día'} right={<Icono><Bell size={18} color={colors.navy} /></Icono>} onPress={() => router.push('/notificaciones')} />
        <Row title="Mi cuenta" subtitle="Datos, seguridad y dispositivos" right={<Icono><UserRound size={18} color={colors.navy} /></Icono>} onPress={() => router.push('/cuenta')} />
      </Section>

      <View style={{ marginTop: space.xl }}>
        <Button title="Cerrar sesión" variant="secondary" icon={<LogOut size={18} color={colors.ink} />} onPress={() => setConfirm(true)} />
      </View>

      <ConfirmSheet
        visible={confirm}
        title="Cerrar sesión"
        message="Tendrás que ingresar de nuevo con tu contraseña y código, o desbloquear con biometría si recordaste este teléfono."
        confirmLabel="Cerrar sesión"
        pending={leaving}
        onConfirm={async () => {
          setLeaving(true);
          setConfirm(false);
          await logout(false);
        }}
        onClose={() => setConfirm(false)}
      />
    </Screen>
  );
}
