import { MonitorSmartphone, Search, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { StaffUserRow, UsuariosResponse } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, Pill, Select, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { qs, useDebounced, useLoad } from '../hooks';
import { Chip, ChipRow, LabelPill, Loadable, Page, Pager, Pills, ResultFooter } from '../ui';
import type { AreaProps } from './types';

type Estado = UsuariosResponse['filters']['estado'];

export function UsuariosArea({ tab, title, header }: AreaProps) {
  const [search, setSearch] = useState('');
  const q0 = useDebounced(search.trim());
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState<Estado>('');
  const [page, setPage] = useState(1);
  const q = useLoad<UsuariosResponse>(`/empresa/usuarios${qs({ q: q0, rol, estado, pagina: page })}`);
  const action = useAction();
  const dialog = useDialog();
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(path: string, body: Record<string, unknown> = {}) {
    const res = await action.run(path, body);
    if (res.ok) q.reload();
  }

  async function invite(d: UsuariosResponse) {
    const v = await dialog.ask({
      title: 'Invitar a una persona del equipo',
      message: 'Recibirá un correo con el enlace para activar su cuenta. Solo tendrá los permisos de su rol.',
      confirmLabel: 'Enviar invitación',
      fields: [
        { name: 'name', label: 'Nombre completo', required: true, minLength: 3, maxLength: 160 },
        { name: 'email', label: 'Correo corporativo', kind: 'email', required: true, maxLength: 320 },
        { name: 'role', label: 'Rol', kind: 'select', required: true, options: d.roles },
      ],
    });
    if (v) await run('/empresa/usuarios', v);
  }

  async function changeRole(u: StaffUserRow, d: UsuariosResponse) {
    const v = await dialog.ask({
      title: `Cambiar rol de ${u.name}`,
      message: `Rol actual: ${u.role.label}.`,
      warning: 'Se cierran todas sus sesiones activas para aplicar los nuevos permisos.',
      confirmLabel: 'Cambiar rol',
      fields: [{ name: 'role', label: 'Nuevo rol', kind: 'select', required: true, options: d.roles, initial: u.role.code }],
    });
    if (v && v.role !== u.role.code) await run(`/empresa/usuarios/${u.id}/rol`, v);
  }

  async function deactivate(u: StaffUserRow) {
    const v = await dialog.ask({ title: `Desactivar a ${u.name}`, message: 'No podrá ingresar y se cierran sus sesiones. Sus registros se conservan.', confirmLabel: 'Desactivar', destructive: true, fields: [{ name: 'reason', label: 'Motivo', kind: 'multiline', required: true, minLength: 5, maxLength: 300 }] });
    if (v) await run(`/empresa/usuarios/${u.id}/estado`, { active: '0', reason: v.reason });
  }

  async function reactivate(u: StaffUserRow) {
    if (await dialog.confirm({ title: `Reactivar a ${u.name}`, message: 'Podrá ingresar de nuevo con su rol actual.', confirmLabel: 'Reactivar' })) await run(`/empresa/usuarios/${u.id}/estado`, { active: '1' });
  }

  async function resend(u: StaffUserRow) {
    if (await dialog.confirm({ title: 'Reenviar invitación', message: `Se envía un enlace nuevo a ${u.email}; el anterior deja de servir.`, confirmLabel: 'Reenviar' })) await run(`/empresa/usuarios/${u.id}/reenviar`);
  }

  async function resetMfa(u: StaffUserRow) {
    const v = await dialog.ask({
      title: `Restablecer MFA de ${u.name}`,
      message: 'Deberá configurar de nuevo su autenticador en el próximo ingreso. Recibirá un correo con el motivo.',
      warning: 'Se cierran sus sesiones. Hazlo solo tras verificar su identidad por un canal confiable.',
      confirmLabel: 'Restablecer MFA',
      destructive: true,
      fields: [{ name: 'reason', label: 'Motivo (queda en la bitácora)', kind: 'multiline', required: true, minLength: 10, maxLength: 300 }],
    });
    if (v) await run(`/empresa/usuarios/${u.id}/mfa`, v);
  }

  async function closeSession(u: StaffUserRow, sessionId: string, device: string) {
    if (await dialog.confirm({ title: 'Cerrar sesión', message: `${u.name} · ${device}. Tendrá que volver a ingresar en ese dispositivo.`, confirmLabel: 'Cerrar sesión', destructive: true })) await run(`/empresa/usuarios/sesiones/${sessionId}/cerrar`);
  }

  const set = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading} footer={action.result ? <ResultFooter result={action.result} onClose={action.clear} /> : undefined}>
      {header}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 12, marginBottom: space.md }}>
        <Search size={18} color={colors.muted} />
        <TextInput value={search} onChangeText={(t) => set(() => setSearch(t))} placeholder="Nombre o correo" placeholderTextColor="#8b9aa1" style={{ flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 15, color: colors.ink }} accessibilityLabel="Buscar usuarios" autoCapitalize="none" autoCorrect={false} />
      </View>
      <ChipRow>
        <Chip label="Todos" active={estado === ''} onPress={() => set(() => setEstado(''))} />
        <Chip label="Activos" active={estado === 'activos'} onPress={() => set(() => setEstado('activos'))} />
        <Chip label="Invitación pendiente" active={estado === 'pendientes'} onPress={() => set(() => setEstado('pendientes'))} />
        <Chip label="Sin MFA" active={estado === 'sin-mfa'} onPress={() => set(() => setEstado('sin-mfa'))} />
        <Chip label="Inactivos" active={estado === 'inactivos'} onPress={() => set(() => setEstado('inactivos'))} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            <Select label="Rol" value={rol} options={[{ value: '', label: 'Todos los roles' }, ...d.roles]} onChange={(v) => set(() => setRol(v))} />
            <Button title="Invitar usuario" icon={<UserPlus size={18} color={colors.navy} />} onPress={() => invite(d)} style={{ marginTop: space.md }} />
            <T v="small" style={{ marginTop: space.sm }}>{`${d.activeAdmins} ${d.activeAdmins === 1 ? 'administrador activo' : 'administradores activos'}.`}</T>
            <View style={{ gap: space.md, marginTop: space.md }}>
              {d.rows.length === 0 ? <Empty>Ningún usuario coincide.</Empty> : null}
              {d.rows.map((u) => (
                <Card key={u.id} style={!u.active ? { opacity: 0.75 } : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <T v="h3">{`${u.name}${u.self ? ' (tú)' : ''}`}</T>
                      <T v="small">{u.email}</T>
                    </View>
                    <LabelPill label={u.role} />
                  </View>
                  <Pills style={{ marginTop: 6 }}>
                    {u.active ? <Pill tone="ok">Activo</Pill> : <Pill tone="gray">Inactivo</Pill>}
                    {u.pendingInvitation ? <Pill tone="wait">Invitación pendiente</Pill> : null}
                    {u.mfaEnabled ? <Pill tone="info">{`MFA desde ${fecha(u.mfaSince)}`}</Pill> : <Pill tone="bad">Sin MFA</Pill>}
                  </Pills>
                  <T v="small" style={{ marginTop: 4 }}>{`${u.lastLoginAt ? `Último ingreso ${fechaHora(u.lastLoginAt)}` : 'Nunca ha ingresado'} · creado ${fecha(u.createdAt)}`}</T>
                  {u.sessions.length ? (
                    <Button small variant="secondary" title={expanded === u.id ? 'Ocultar sesiones' : `Sesiones activas (${u.sessions.length})`} icon={<MonitorSmartphone size={15} color={colors.ink} />} onPress={() => setExpanded(expanded === u.id ? null : u.id)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
                  ) : null}
                  {expanded === u.id ? (
                    <View style={{ gap: 8, marginTop: space.sm }}>
                      {u.sessions.map((s) => (
                        <View key={s.id} style={{ padding: 10, borderRadius: radius.sm, backgroundColor: colors.mist, gap: 2 }}>
                          <T v="small" style={{ color: colors.ink, fontFamily: fonts.semibold }}>{`${s.device}${s.current ? ' · esta sesión' : ''}${s.mfaPassed ? '' : ' · sin MFA'}`}</T>
                          <T v="small">{`Inició ${fechaHora(s.createdAt)} · última actividad ${fechaHora(s.lastSeenAt)} · vence ${fechaHora(s.expiresAt)}`}</T>
                          {!s.current ? <Button small variant="danger" title="Cerrar esta sesión" onPress={() => closeSession(u, s.id, s.device)} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                    {u.can.changeRole ? <Button small variant="secondary" title="Cambiar rol" onPress={() => changeRole(u, d)} /> : null}
                    {u.can.resendInvite ? <Button small variant="secondary" title="Reenviar invitación" onPress={() => resend(u)} /> : null}
                    {u.can.resetMfa ? <Button small variant="secondary" title="Restablecer MFA" onPress={() => resetMfa(u)} /> : null}
                    {u.can.deactivate ? <Button small variant="danger" title="Desactivar" onPress={() => deactivate(u)} /> : null}
                    {u.can.reactivate ? <Button small title="Reactivar" onPress={() => reactivate(u)} /> : null}
                  </View>
                </Card>
              ))}
            </View>
            <Pager page={d.page} onChange={setPage} />
            <View style={{ marginTop: space.lg }}>
              <Notice tone="info">Cada cambio de rol, estado, MFA o sesión queda en la bitácora de auditoría.</Notice>
            </View>
          </>
        )}
      </Loadable>
    </Page>
  );
}
