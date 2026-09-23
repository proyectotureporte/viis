import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pencil, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { AliadoResponse, AllyUserRow } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora, pct, pesosCortos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Pill, Progress, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';
import { AllyStats } from '@/ui/empresa/areas/Aliados';
import { useDialog } from '@/ui/empresa/dialogs';
import { useLoad } from '@/ui/empresa/hooks';
import { routes } from '@/ui/empresa/nav';
import { OrgForm } from '@/ui/empresa/OrgForm';
import { LabelPill, Line, Loadable, Page, Pills, ResultFooter } from '@/ui/empresa/ui';

/** Ficha de la organización aliada: desempeño, usuarios, certificaciones y casos recientes. */
export default function Aliado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLoad<AliadoResponse>(`/empresa/aliados/${id}`);
  const action = useAction();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);

  async function run(path: string, body: Record<string, unknown> = {}) {
    const res = await action.run(path, body);
    if (res.ok) q.reload();
    return res;
  }

  async function invite(d: AliadoResponse) {
    const v = await dialog.ask({
      title: 'Invitar usuario',
      message: `Recibirá un correo con el enlace para activar su cuenta en ${d.org.name}.`,
      confirmLabel: 'Enviar invitación',
      fields: [
        { name: 'name', label: 'Nombre completo', required: true, minLength: 3, maxLength: 120 },
        { name: 'email', label: 'Correo', kind: 'email', required: true, maxLength: 320 },
        { name: 'role', label: 'Rol', kind: 'select', required: true, options: d.options.roles, initial: d.options.roles[0]?.value },
      ],
    });
    if (v) await run(`/empresa/aliados/${id}/invitar`, v);
  }

  async function toggle(u: AllyUserRow, active: boolean) {
    if (active) {
      if (await dialog.confirm({ title: 'Reactivar usuario', message: `${u.name} podrá ingresar de nuevo.`, confirmLabel: 'Reactivar' })) await run(`/empresa/aliados/usuarios/${u.id}/estado`, { active: '1' });
      return;
    }
    const v = await dialog.ask({ title: 'Desactivar usuario', message: `${u.name} no podrá ingresar y se cerrarán sus sesiones.`, confirmLabel: 'Desactivar', destructive: true, fields: [{ name: 'reason', label: 'Motivo', kind: 'multiline', required: true, minLength: 5, maxLength: 300 }] });
    if (v) await run(`/empresa/aliados/usuarios/${u.id}/estado`, { active: '0', reason: v.reason });
  }

  async function resend(u: AllyUserRow) {
    if (await dialog.confirm({ title: 'Reenviar invitación', message: `Se enviará un enlace nuevo a ${u.email}; el anterior deja de servir.`, confirmLabel: 'Reenviar' })) await run(`/empresa/aliados/usuarios/${u.id}/reenviar`);
  }

  return (
    <>
      <Stack.Screen options={{ title: q.data?.org.name ?? 'Aliado' }} />
      <Page refreshing={q.refreshing} onRefresh={q.refresh} footer={action.result ? <ResultFooter result={action.result} onClose={action.clear} /> : undefined}>
        <Loadable q={q}>
          {(d) => (
            <>
              <T v="title" style={{ fontSize: 23 }}>{d.org.name}</T>
              <Pills style={{ marginTop: 6 }}>
                <LabelPill label={d.org.kind} />
                <Pill tone="info">{d.org.tier}</Pill>
                {d.org.active ? <Pill tone="ok">Activa</Pill> : <Pill tone="gray">Inactiva</Pill>}
              </Pills>
              <Card style={{ marginTop: space.md }}>
                <Line label="NIT / documento" value={d.org.taxId ?? '—'} />
                <Line label="Territorio" value={d.org.territory ?? '—'} />
                <Line label="Desde" value={fecha(d.org.createdAt)} />
                <Line label="Meta mensual" value={d.org.monthlyGoal ? pesosCortos(d.org.monthlyGoal) : 'Sin meta'} />
                {d.org.monthlyGoal ? (
                  <>
                    <Progress value={(d.goalRatio ?? 0) * 100} />
                    <T v="small">{`Este mes ${pesosCortos(d.stats.monthSum)} (${d.goalRatio === null ? '—' : pct(d.goalRatio, 0)})`}</T>
                  </>
                ) : null}
                <Button small variant="secondary" title="Editar organización" icon={<Pencil size={15} color={colors.ink} />} onPress={() => { action.clear(); setEditing(true); }} style={{ marginTop: space.md, alignSelf: 'flex-start' }} />
              </Card>

              <Section title="Desempeño">
                <AllyStats s={d.stats} />
              </Section>

              <Section title="Usuarios" right={<Button small title="Invitar" icon={<UserPlus size={15} color={colors.navy} />} onPress={() => invite(d)} />}>
                {d.users.length === 0 ? <Empty>Sin usuarios. Invita al primero.</Empty> : null}
                {d.users.map((u) => (
                  <Card key={u.id} style={!u.active ? { opacity: 0.75 } : undefined}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <T v="h3">{u.name}</T>
                        <T v="small">{u.email}</T>
                      </View>
                      <LabelPill label={u.state} />
                    </View>
                    <Pills style={{ marginTop: 6 }}>
                      <LabelPill label={u.role} />
                      {u.blocked ? <Pill tone="bad">Bloqueado para radicar</Pill> : null}
                      {u.invitation ? <Pill tone={u.invitation.expired ? 'bad' : 'wait'}>{u.invitation.expired ? 'Invitación vencida' : `Invitación hasta ${fecha(u.invitation.expiresAt)}`}</Pill> : null}
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{u.lastLoginAt ? `Último ingreso ${fechaHora(u.lastLoginAt)}` : 'Nunca ha ingresado'}</T>
                    {u.certifications.length ? (
                      <View style={{ marginTop: 8, gap: 4 }}>
                        {u.certifications.map((c) => {
                          const course = d.courses.find((x) => x.id === c.courseId);
                          return (
                            <View key={c.courseId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                              <T v="small" style={{ flex: 1, color: colors.ink }}>{`${course?.title ?? 'Curso'}${course?.critical ? ' (crítico)' : ''}`}</T>
                              <LabelPill label={c.state} />
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                      {u.can.resendInvite ? <Button small variant="secondary" title="Reenviar invitación" onPress={() => resend(u)} /> : null}
                      {u.can.deactivate ? <Button small variant="danger" title="Desactivar" onPress={() => toggle(u, false)} /> : null}
                      {u.can.reactivate ? <Button small title="Reactivar" onPress={() => toggle(u, true)} /> : null}
                    </View>
                  </Card>
                ))}
              </Section>

              <Section title="Casos recientes">
                {d.recentCases.length === 0 ? <Empty>Sin casos.</Empty> : null}
                {d.recentCases.map((c) => (
                  <Card key={c.id} onPress={() => router.push(routes.caso(c.id))}>
                    <T v="h3">{`${c.code} · ${c.clientName}`}</T>
                    <Pills style={{ marginTop: 6 }}>
                      <LabelPill label={c.stage} />
                      <LabelPill label={c.product} />
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{`${c.allyUserName ?? 'Sin usuario'} · actualizado ${fechaHora(c.updatedAt)}`}</T>
                  </Card>
                ))}
              </Section>

              <OrgForm
                visible={editing}
                title="Editar organización"
                onClose={() => setEditing(false)}
                initial={{ kind: d.org.kind.code, name: d.org.name, taxId: d.org.taxId ?? '', territory: d.org.territory ?? '', tier: d.org.tier, monthlyGoal: d.org.monthlyGoal, active: d.org.active }}
                kinds={d.options.kinds}
                tiers={d.options.tiers.includes(d.org.tier) ? d.options.tiers : [d.org.tier, ...d.options.tiers]}
                pending={action.pending}
                confirmDeactivate={() => dialog.confirm({ title: 'Inactivar organización', message: `${d.org.name} quedará inactiva y se cerrarán las sesiones de todos sus usuarios.`, confirmLabel: 'Inactivar', destructive: true })}
                onSubmit={(v) => run(`/empresa/aliados/${id}`, v)}
              />
            </>
          )}
        </Loadable>
      </Page>
    </>
  );
}
