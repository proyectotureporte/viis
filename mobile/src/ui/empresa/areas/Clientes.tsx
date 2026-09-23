import { router } from 'expo-router';
import { IdCard, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { ClienteRow, ClientesResponse } from '@/lib/movil/contract-empresa';
import { api, ApiError } from '@/services/api';
import { fecha } from '@/services/format';
import { Button, Card, Empty, Notice, Pill, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { qs, useDebounced, useLoad } from '../hooks';
import { routes } from '../nav';
import { LabelPill, Loadable, Page, Pager, Pills } from '../ui';
import type { AreaProps } from './types';

function ClientCard({ c }: { c: ClienteRow }) {
  return (
    <Card onPress={() => router.push(routes.cliente(c.id))}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T v="h3" style={{ flex: 1 }}>{c.name}</T>
        {c.hasAccount ? <Pill tone="ok">Con cuenta</Pill> : <Pill tone="gray">Sin cuenta</Pill>}
      </View>
      <T v="small">{`${c.documentType} ···${c.documentLast4}${c.city ? ` · ${c.city}` : ''}${c.email ? ` · ${c.email}` : ''}`}</T>
      <Pills style={{ marginTop: 6 }}>
        {c.lastCase ? <LabelPill label={c.lastCase.stage} prefix={c.lastCase.code} /> : null}
        <Pill tone="gray">{`${c.counts.cases} casos · ${c.counts.loans} créditos · ${c.counts.requests} solicitudes`}</Pill>
      </Pills>
      <T v="small" style={{ marginTop: 4 }}>{`Registrado ${fecha(c.createdAt)}`}</T>
    </Card>
  );
}

export function ClientesArea({ tab, title, header }: AreaProps) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const list = useLoad<ClientesResponse>(`/empresa/clientes${qs({ q, pagina: page })}`);
  const dialog = useDialog();
  const [byDoc, setByDoc] = useState<{ res: ClientesResponse; label: string } | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function searchByDocument() {
    const types = list.data?.documentTypes ?? [{ value: 'CC', label: 'Cédula de ciudadanía' }];
    const v = await dialog.ask({
      title: 'Buscar por documento',
      message: 'Búsqueda exacta por índice ciego: el número no queda en la URL ni se descifra.',
      confirmLabel: 'Buscar',
      fields: [
        { name: 'tipo', label: 'Tipo de documento', kind: 'select', required: true, options: types, initial: 'CC' },
        { name: 'doc', label: 'Número de documento', required: true, minLength: 4, maxLength: 20 },
      ],
    });
    if (!v) return;
    setSearching(true);
    setDocError(null);
    try {
      const res = await api.post<ClientesResponse>('/empresa/clientes/buscar-documento', { tipo: v.tipo, doc: v.doc });
      setByDoc({ res, label: `${v.tipo} terminado en ${v.doc.slice(-4)}` });
    } catch (e) {
      setDocError(e instanceof ApiError ? e.message : 'No pudimos buscar el documento.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <Page tab={tab} title={title} subtitle={tab ? 'Búsqueda y ficha 360' : undefined} refreshing={list.refreshing} onRefresh={list.refresh} busy={(list.stale && !list.loading) || searching}>
      {header}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 12 }}>
          <Search size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setPage(1);
              setByDoc(null);
            }}
            placeholder="Nombre, correo o últimos 4"
            placeholderTextColor="#8b9aa1"
            style={{ flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 15, color: colors.ink }}
            accessibilityLabel="Buscar clientes"
            autoCorrect={false}
          />
        </View>
        <Pressable onPress={searchByDocument} style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Buscar por número de documento">
          <IdCard size={21} color={colors.ink} />
        </Pressable>
      </View>
      {docError ? <Notice tone="bad">{docError}</Notice> : null}

      {byDoc ? (
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="h3" style={{ flex: 1 }}>{`Documento ${byDoc.label}`}</T>
            <Pressable onPress={() => setByDoc(null)} accessibilityRole="button" accessibilityLabel="Quitar búsqueda por documento" hitSlop={8}>
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>
          {byDoc.res.rows.length === 0 ? <Empty>No hay ningún cliente con ese documento.</Empty> : byDoc.res.rows.map((c) => <ClientCard key={c.id} c={c} />)}
          {byDoc.res.rows.length === 0 && byDoc.res.can.createCase ? <Button title="Crear caso para un cliente nuevo" variant="secondary" onPress={() => router.push(routes.nuevoCaso())} /> : null}
        </View>
      ) : (
        <Loadable q={list}>
          {(d) => (
            <>
              <View style={{ gap: space.md }}>
                {d.rows.length === 0 ? <Empty>{q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.'}</Empty> : null}
                {d.rows.map((c) => (
                  <ClientCard key={c.id} c={c} />
                ))}
              </View>
              <Pager page={d.page} onChange={setPage} />
            </>
          )}
        </Loadable>
      )}
    </Page>
  );
}
