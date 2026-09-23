import type { AliadoEquipoMiembro, AliadoEquipoResponse } from '@/lib/movil/contract';
import { Send, Target, UserCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { useAction, useApi } from '@/services/hooks';
import { fecha, milesInput, pct, pesos, pesosCortos, soloDigitos } from '@/services/format';
import { ConfirmSheet, goToCase } from '@/ui/aliado/parts';
import { Button, Card, Empty, ErrorState, Field, KeyValue, Loading, MoneyField, Notice, Pill, Progress, ResultBanner, Screen, Section, Select, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function estadoAcceso(m: AliadoEquipoMiembro): string {
  if (!m.active) return 'Inactivo';
  if (m.invitePending) return 'Invitación pendiente';
  return m.lastLoginAt ? `Último ingreso ${fecha(m.lastLoginAt)}` : 'Sin ingresos';
}

function Miembro({ m, hasCritical }: { m: AliadoEquipoMiembro; hasCritical: boolean }) {
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T v="h3">{m.name}</T>
          <T v="small">{m.email} · {m.roleLabel}</T>
        </View>
        <Pill tone={!m.active ? 'gray' : m.invitePending ? 'wait' : 'ok'}>{estadoAcceso(m)}</Pill>
      </View>
      {m.blockingCourses.length ? (
        <Pill tone="bad">Bloqueado para radicar: {m.blockingCourses.join(', ')}</Pill>
      ) : hasCritical ? (
        <Pill tone="ok">Certificación al día</Pill>
      ) : (
        <Pill tone="gray">Sin cursos críticos</Pill>
      )}
      <KeyValue
        items={[
          ['Casos activos', `${m.openCases} de ${m.totalCases} en total`],
          ['Desembolsado este mes', pesos(m.disbursedMonth)],
          ['Conversión', m.conversion === null ? '—' : `${pct(m.conversion, 0)} · ${m.won} desembolsados`],
          ['Calidad documental', m.docQuality === null ? 'Sin revisiones' : `${pct(m.docQuality, 0)} de ${m.reviewedDocs} revisados`],
          ['Desistimiento', m.withdrawal === null ? '—' : pct(m.withdrawal, 0)],
          ['Comisión pendiente', pesos(m.commissionPending)],
          ['Comisión pagada', pesos(m.commissionPaid)],
        ]}
      />
    </Card>
  );
}

/** Equipo de la organización aliada (solo ALLY_ADMIN): meta, invitaciones, consolidado y reparto. */
export default function Equipo() {
  const { user } = useAuth();
  const admin = user?.role === 'ALLY_ADMIN';
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoEquipoResponse>(admin ? '/aliado/equipo' : null);
  const goalAction = useAction();
  const inviteAction = useAction();
  const assignAction = useAction();
  const [goal, setGoal] = useState('');
  const [goalTouched, setGoalTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ caseId: string; code: string; client: string; to: string } | null>(null);

  if (!admin) return <Screen scroll={false}><Empty>Esta sección es solo para el administrador de la organización aliada.</Empty></Screen>;
  if (loading && !data) return <Screen scroll={false}><Loading /></Screen>;
  if (!data) return <Screen scroll={false}><ErrorState message={error ?? 'No pudimos cargar el equipo.'} onRetry={reload} /></Screen>;

  const goalPct = data.goal ? data.monthTotal / data.goal : null;
  const emailOk = EMAIL.test(email.trim());
  // Hasta que el administrador la edite, el campo muestra la meta vigente del servidor.
  const goalValue = goalTouched ? goal : data.goal ? milesInput(String(data.goal)) : '';

  async function saveGoal() {
    const res = await goalAction.run('/aliado/equipo/meta', { monthlyGoal: goalValue ? String(soloDigitos(goalValue)) : '' });
    if (res.ok) {
      setGoalTouched(false);
      reload();
    }
  }

  async function invite() {
    const res = await inviteAction.run('/aliado/equipo/invitar', { name: name.trim(), email: email.trim() });
    if (res.ok) {
      setName('');
      setEmail('');
      reload();
    }
  }

  async function reassign() {
    if (!confirm) return;
    const res = await assignAction.run('/aliado/equipo/reasignar', { opportunityId: confirm.caseId, allyUserId: confirm.to });
    setConfirm(null);
    if (res.ok) {
      setTargets((prev) => ({ ...prev, [confirm.caseId]: '' }));
      reload();
    }
  }

  const nameOf = (id: string) => data.assignable.find((a) => a.id === id)?.name ?? '';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <T v="muted">{data.organization?.name ?? 'Tu organización'}: metas, invitaciones, consolidado y reparto de casos.</T>

      <Section title="Meta mensual">
        <Card style={{ gap: space.md }}>
          <View>
            <T v="big" style={{ fontSize: 24 }}>{pesosCortos(data.monthTotal)}</T>
            <T v="small">desembolsado este mes{data.goal ? ` · ${pct(goalPct ?? 0, 0)} de ${pesos(data.goal)}` : ' · sin meta definida'}</T>
            {data.goal ? <Progress value={(goalPct ?? 0) * 100} color={(goalPct ?? 0) >= 1 ? colors.mintDeep : colors.mint} /> : null}
          </View>
          <MoneyField
            label="Meta de desembolsos del mes (pesos)"
            value={goalValue}
            onChangeText={(t) => {
              setGoalTouched(true);
              setGoal(t ?? '');
            }}
            placeholder="500.000.000"
            hint="Déjala vacía para quitar la meta."
          />
          <ResultBanner result={goalAction.result} />
          <Button title="Guardar meta" icon={<Target size={17} color={colors.navy} />} loading={goalAction.pending} disabled={!goalTouched} onPress={saveGoal} />
        </Card>
      </Section>

      <Section title="Invitar a un aliado">
        <Card style={{ gap: space.md }}>
          <T v="small">Recibirá un enlace de activación válido por 72 horas. Podrá registrar clientes de inmediato; para radicar debe aprobar los cursos críticos.</T>
          <Field label="Nombre completo" value={name} onChangeText={setName} autoComplete="off" maxLength={160} />
          <Field label="Correo del aliado" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" maxLength={320} error={email.trim() && !emailOk ? 'Correo electrónico inválido.' : undefined} />
          <ResultBanner result={inviteAction.result} />
          <Button title="Enviar invitación" icon={<Send size={17} color={colors.navy} />} loading={inviteAction.pending} disabled={name.trim().length < 3 || !emailOk} onPress={invite} />
        </Card>
      </Section>

      <Section title="Consolidado por aliado">
        {data.members.length === 0 ? <Empty>Aún no hay aliados en la organización.</Empty> : null}
        {data.members.map((m) => <Miembro key={m.id} m={m} hasCritical={data.hasCriticalCourses} />)}
        <T v="small">Calidad documental: documentos aprobados sobre los revisados que cargó cada aliado. Un volumen alto con muchos rechazos o desistimientos es una señal para acompañar, no para premiar.</T>
      </Section>

      <Section title="Reparto de casos activos">
        <ResultBanner result={assignAction.result} />
        {data.activeCases.length === 0 ? <Empty>No hay casos activos para repartir.</Empty> : null}
        {data.activeCases.map((c) => {
          const options = data.assignable.filter((a) => a.id !== c.allyUserId).map((a) => ({ value: a.id, label: a.name }));
          const target = targets[c.id] ?? '';
          return (
            <Card key={c.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T v="h3">{c.client}</T>
                  <T v="small">{c.code} · Responsable: {c.allyName ?? 'Sin asignar'}</T>
                </View>
                <Button small variant="secondary" title="Ficha" onPress={() => goToCase(c.id)} />
              </View>
              {options.length ? (
                <>
                  <Select label={`Nuevo responsable de ${c.code}`} value={target} placeholder="Elige un aliado" options={options} onChange={(v) => setTargets((prev) => ({ ...prev, [c.id]: v }))} />
                  <Button small title="Reasignar" icon={<UserCheck size={16} color={colors.navy} />} disabled={!target} onPress={() => { assignAction.clear(); setConfirm({ caseId: c.id, code: c.code, client: c.client, to: target }); }} />
                </>
              ) : (
                <T v="small">No hay otro aliado activo con cuenta creada para asignarlo.</T>
              )}
            </Card>
          );
        })}
      </Section>

      <ConfirmSheet
        visible={Boolean(confirm)}
        title="Reasignar caso"
        message={confirm ? `${confirm.client} (${confirm.code}) pasará a ${nameOf(confirm.to)}. Ambos aliados reciben una notificación y el cambio queda en la bitácora.` : ''}
        confirmLabel="Confirmar reasignación"
        pending={assignAction.pending}
        onConfirm={reassign}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}
