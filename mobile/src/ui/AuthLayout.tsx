import { ScrollView, StyleSheet, View , KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from './Brand';
import { T } from './kit';
import { colors, radius, space } from './theme';

export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Brand />
            <T v="title" style={{ marginTop: space.xl }}>{title}</T>
            {intro ? <T v="muted" style={{ marginTop: 6, marginBottom: space.lg }}>{intro}</T> : <View style={{ height: space.lg }} />}
            <View style={{ gap: space.md }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: space.xl },
});
