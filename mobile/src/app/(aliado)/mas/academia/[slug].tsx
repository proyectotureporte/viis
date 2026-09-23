import type { AliadoCursoResponse } from '@/lib/movil/contract';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Award, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAction, useApi } from '@/services/hooks';
import { fecha } from '@/services/format';
import { toneOf } from '@/ui/aliado/parts';
import { Button, Card, ErrorState, KeyValue, Loading, Notice, Pill, Progress, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

/** Verificación pública del certificado (la web oficial, no la API de pruebas). */
const CERT_BASE = 'https://app.viis.app/certificados';

export default function Curso() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoCursoResponse>(slug ? `/aliado/academia/${slug}` : null);
  const lessonAction = useAction();
  const quizAction = useAction();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [copied, setCopied] = useState(false);
  const [retake, setRetake] = useState(false);

  const header = <Stack.Screen options={{ title: data ? data.course.title : 'Curso' }} />;
  if (loading && !data) return <Screen scroll={false}>{header}<Loading /></Screen>;
  if (!data) return <Screen scroll={false}>{header}<ErrorState message={error ?? 'Ese curso no está disponible.'} onRetry={reload} /></Screen>;

  const lesson = data.lessons[Math.min(current, data.lessons.length - 1)];
  const answered = data.quiz.every((q) => answers[q.index] !== undefined);
  const cert = data.certification;

  async function markSeen() {
    if (!lesson) return;
    const res = await lessonAction.run(`/aliado/academia/${data!.course.slug}/leccion`, { lesson: lesson.index });
    if (res.ok) {
      reload();
      if (current < data!.lessons.length - 1) setCurrent(current + 1);
    }
  }

  async function submitQuiz() {
    const res = await quizAction.run(`/aliado/academia/${data!.course.slug}/evaluacion`, { answers: data!.quiz.map((q) => answers[q.index]) });
    reload();
    if (res.ok) {
      setAnswers({});
      setRetake(false);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {header}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {data.course.critical ? <Pill tone="bad">Crítico para radicar</Pill> : null}
          {data.course.mandatory ? <Pill tone="info">Obligatorio</Pill> : null}
          <Pill tone="gray">Versión {data.course.version}</Pill>
        </View>
        <T>{data.course.summary}</T>
        <Progress value={data.progress} />
        <T v="small">{data.progress} % de las lecciones vistas · aprueba con {data.course.passScore} de 100 · certificado válido {data.course.validityDays} días</T>
      </Card>

      {cert ? (
        <Section title="Tu certificado">
          <Card style={{ gap: space.md, borderColor: cert.state.valid ? colors.mint : colors.line }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Award size={28} color={cert.state.valid ? colors.mintDeep : colors.muted} />
              <View style={{ flex: 1 }}>
                <T v="h3" selectable style={{ fontFamily: fonts.bold, letterSpacing: 0.5 }}>{cert.code}</T>
                <T v="small">Vigente hasta {fecha(cert.expiresAt)}</T>
              </View>
              <Pill tone={toneOf(cert.state.tone)}>{cert.state.label}</Pill>
            </View>
            <T v="small">Cualquier entidad puede verificarlo en {CERT_BASE}/{cert.code}</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small title="Verificación pública" icon={<ExternalLink size={15} color={colors.navy} />} onPress={() => Linking.openURL(`${CERT_BASE}/${cert.code}`)} />
              <Button small variant="secondary" title="Compartir" icon={<Share2 size={15} color={colors.ink} />} onPress={() => Share.share({ message: `Certificado ${data.course.title} de la Academia OpenV: ${cert.code}. Verifícalo en ${CERT_BASE}/${cert.code}` })} />
              <Button
                small
                variant="secondary"
                title={copied ? 'Copiado' : 'Copiar código'}
                icon={copied ? <Check size={15} color={colors.mintDeep} /> : <Copy size={15} color={colors.ink} />}
                onPress={async () => {
                  await Clipboard.setStringAsync(cert.code);
                  setCopied(true);
                }}
              />
            </View>
          </Card>
        </Section>
      ) : null}

      <Section title="Lecciones">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.lessons.map((l, i) => (
            <Pressable key={l.index} onPress={() => setCurrent(i)} style={[s.lessonDot, i === current && s.lessonDotOn, l.done && i !== current && { backgroundColor: colors.okSoft, borderColor: colors.mint }]} accessibilityRole="button" accessibilityLabel={`Lección ${i + 1}: ${l.title}${l.done ? ', vista' : ''}`} accessibilityState={{ selected: i === current }}>
              {l.done && i !== current ? <Check size={14} color={colors.mintDeep} /> : <Text style={{ fontFamily: fonts.bold, color: i === current ? colors.white : colors.ink }}>{i + 1}</Text>}
            </Pressable>
          ))}
        </View>
        {lesson ? (
          <Card style={{ gap: space.md }}>
            <T v="eyebrow">Lección {current + 1} de {data.lessons.length}</T>
            <T v="h2">{lesson.title}</T>
            {lesson.body.map((p, i) => <T key={i} style={{ fontSize: 15.5, lineHeight: 24 }}>{p}</T>)}
            <ResultBanner result={lessonAction.result} />
            {lesson.done ? <Pill tone="ok">Vista</Pill> : <Button title="Marcar como vista" icon={<Check size={18} color={colors.navy} />} loading={lessonAction.pending} onPress={markSeen} />}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small variant="secondary" title="Anterior" style={{ flex: 1 }} icon={<ChevronLeft size={16} color={colors.ink} />} disabled={current === 0} onPress={() => { lessonAction.clear(); setCurrent(current - 1); }} />
              <Button small variant="secondary" title="Siguiente" style={{ flex: 1 }} icon={<ChevronRight size={16} color={colors.ink} />} disabled={current >= data.lessons.length - 1} onPress={() => { lessonAction.clear(); setCurrent(current + 1); }} />
            </View>
          </Card>
        ) : null}
      </Section>

      <Section title="Evaluación">
        <Card style={{ gap: 6 }}>
          <KeyValue
            items={[
              ['Preguntas', String(data.quiz.length)],
              ['Puntaje para aprobar', `${data.course.passScore} de 100`],
              ['Intentos hoy', `${data.attemptsToday} de ${data.maxAttemptsPerDay}`],
            ]}
          />
          <T v="small">La calificación se hace en el servidor; las respuestas correctas nunca llegan al teléfono.</T>
        </Card>
        {!data.allSeen ? (
          <Notice tone="wait">Marca como vistas todas las lecciones para presentar la evaluación.</Notice>
        ) : cert?.state.valid && !retake ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="info">Ya aprobaste esta evaluación y tu certificado está vigente. Puedes presentarla de nuevo para renovarlo antes de que venza.</Notice>
            <Button title="Presentar de nuevo" variant="secondary" onPress={() => { quizAction.clear(); setRetake(true); }} />
          </View>
        ) : data.attemptsLeft === 0 ? (
          <Notice tone="wait">Llegaste al límite de {data.maxAttemptsPerDay} intentos por hoy. Repasa las lecciones y vuelve mañana.</Notice>
        ) : (
          <>
            {data.quiz.map((q) => (
              <Card key={q.index} style={{ gap: 10 }}>
                <T v="h3">{q.index + 1}. {q.q}</T>
                <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                  {q.options.map((opt, oi) => {
                    const selected = answers[q.index] === oi;
                    return (
                      <Pressable key={oi} onPress={() => setAnswers((prev) => ({ ...prev, [q.index]: oi }))} style={[s.option, selected && s.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
                        <View style={[s.radio, selected && { borderColor: colors.mintDeep }]}>{selected ? <View style={s.radioIn} /> : null}</View>
                        <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.body, fontSize: 14.5, color: colors.ink }}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
            <T v="small">{data.attemptsLeft === 1 ? 'Te queda 1 intento hoy.' : `Te quedan ${data.attemptsLeft} intentos hoy.`}</T>
            <Button title="Enviar evaluación" loading={quizAction.pending} disabled={!answered} onPress={submitQuiz} />
          </>
        )}
        <ResultBanner result={quizAction.result} />
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  lessonDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  lessonDotOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  optionOn: { borderColor: colors.mintDeep, backgroundColor: colors.okSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9aacb3', alignItems: 'center', justifyContent: 'center' },
  radioIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mintDeep },
});
