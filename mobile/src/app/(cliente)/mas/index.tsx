import { Bell, FolderOpen, House, LifeBuoy, PiggyBank, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { APP_VERSION } from '@/services/config';
import { go, R } from '@/ui/cliente/nav';
import { Screen, T } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

const ITEMS = [
  { title: 'Mi vivienda', detail: 'Ficha del inmueble, valor con fuente y fecha, avalúo', href: R.vivienda, Icon: House },
  { title: 'Mi hogar', detail: 'Objetivos, ingresos, gastos y ahorro', href: R.hogar, Icon: PiggyBank },
  { title: 'Documentos', detail: 'Lo que falta por caso, subir y ver tu expediente', href: R.documentos, Icon: FolderOpen },
  { title: 'Ayuda', detail: 'Hablar con un asesor, PQR y preguntas frecuentes', href: R.ayuda(), Icon: LifeBuoy },
  { title: 'Notificaciones', detail: 'Avisos de tus pagos, solicitudes y casos', href: R.notificaciones, Icon: Bell },
  { title: 'Mi cuenta', detail: 'Perfil, seguridad del teléfono y cerrar sesión', href: R.cuenta, Icon: UserRound },
];

export default function Mas() {
  const { user } = useAuth();
  return (
    <Screen title="Más" subtitle={user ? `${user.name} · ${user.email}` : undefined}>
      <View style={{ gap: 10 }}>
        {ITEMS.map(({ title, detail, href, Icon }) => (
          <Pressable key={title} onPress={() => go(href)} style={({ pressed }) => [s.item, pressed && { backgroundColor: colors.mist }]} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`}>
            <View style={s.icon}><Icon size={22} color={colors.navy} /></View>
            <View style={{ flex: 1 }}>
              <T v="h3">{title}</T>
              <T v="small">{detail}</T>
            </View>
          </Pressable>
        ))}
      </View>
      <T v="small" style={{ textAlign: 'center', marginTop: 24 }}>OpenV · versión {APP_VERSION}</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' },
});
