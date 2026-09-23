import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type { LegalDocumentResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { ErrorState, Loading, Screen, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

/** Política de privacidad y términos: el mismo texto de la web, en pantalla nativa. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { data, error, loading, refresh, refreshing, reload } = useApi<LegalDocumentResponse>(`/legal/${doc}`);
  const document = data?.document;
  return (
    <>
      <Stack.Screen options={{ title: doc === 'terminos' ? 'Términos de uso' : 'Privacidad' }} />
      {loading && !document ? (
        <Loading />
      ) : error && !document ? (
        <ErrorState message={error} onRetry={reload} />
      ) : document ? (
        <Screen title={document.title} subtitle={document.meta} refreshing={refreshing} onRefresh={refresh}>
          <View style={{ gap: space.xl }}>
            {document.sections.map((section) => (
              <View key={section.heading} style={{ gap: space.sm }} accessibilityRole="summary">
                <T v="h2" style={{ fontSize: 17 }}>{section.heading}</T>
                {section.paragraphs?.map((p) => <T key={p} selectable style={{ lineHeight: 23 }}>{p}</T>)}
                {section.bullets?.map((b) => (
                  <View key={b.text} style={{ flexDirection: 'row', gap: 8 }}>
                    <T style={{ color: colors.mintDeep }}>•</T>
                    <T selectable style={{ flex: 1, lineHeight: 23 }}>
                      {b.title ? <T style={{ fontFamily: fonts.semibold }}>{b.title}: </T> : null}
                      {b.text}
                    </T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Screen>
      ) : null}
    </>
  );
}
