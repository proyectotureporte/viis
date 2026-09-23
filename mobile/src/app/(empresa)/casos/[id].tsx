import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { CasoResponse } from '@/lib/movil/contract-empresa';
import { useAction } from '@/services/hooks';
import { Segmented, T } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { Actividad } from '@/ui/empresa/caso/Actividad';
import { Bitacora } from '@/ui/empresa/caso/Bitacora';
import { Documentos } from '@/ui/empresa/caso/Documentos';
import { Ofertas } from '@/ui/empresa/caso/Ofertas';
import { Resumen } from '@/ui/empresa/caso/Resumen';
import type { CasoCtx } from '@/ui/empresa/caso/types';
import { useEmpresa } from '@/ui/empresa/context';
import { useLoad } from '@/ui/empresa/hooks';
import { LabelPill, Loadable, Page, Pills, ResultFooter, SlaPill } from '@/ui/empresa/ui';

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'ofertas', label: 'Ofertas' },
  { value: 'actividad', label: 'Actividad' },
  { value: 'bitacora', label: 'Bitácora' },
];

/** Expediente 360 del caso. */
export default function Caso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLoad<CasoResponse>(`/empresa/casos/${id}`);
  const action = useAction();
  const { refreshMenu } = useEmpresa();
  const [tab, setTab] = useState('resumen');
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);

  const result = local ?? action.result;

  return (
    <>
      <Stack.Screen options={{ title: q.data ? q.data.case.code : 'Expediente' }} />
      <Page
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        footer={
          result ? (
            <ResultFooter
              result={result}
              onClose={() => {
                setLocal(null);
                action.clear();
              }}
            />
          ) : undefined
        }
      >
        <Loadable q={q} label="Cargando expediente…">
          {(d) => {
            const ctx: CasoCtx = {
              d,
              pending: action.pending,
              notify: (r) => setLocal(r),
              act: async (sub, body) => {
                setLocal(null);
                const res = await action.run(`/empresa/casos/${id}${sub}`, body);
                if (res.ok) {
                  q.reload();
                  void refreshMenu(true);
                }
                return res;
              },
            };
            return (
              <>
                <View style={{ marginBottom: 12 }}>
                  <T v="title" style={{ fontSize: 23 }}>{d.client.name}</T>
                  <T v="muted">{`${d.case.code} · ${d.case.product.label}`}</T>
                  <Pills style={{ marginTop: 8 }}>
                    <LabelPill label={d.case.stage} />
                    <LabelPill label={d.case.priority} />
                    <SlaPill sla={d.case.sla} />
                  </Pills>
                  <T v="small" style={{ marginTop: 6, color: colors.ink }}>{d.case.assignee ? `Responsable: ${d.case.assignee.name}` : 'Sin responsable'}</T>
                </View>
                <Segmented value={tab} options={TABS} onChange={setTab} />
                {tab === 'resumen' ? <Resumen {...ctx} /> : null}
                {tab === 'documentos' ? <Documentos {...ctx} /> : null}
                {tab === 'ofertas' ? <Ofertas {...ctx} /> : null}
                {tab === 'actividad' ? <Actividad {...ctx} /> : null}
                {tab === 'bitacora' ? <Bitacora {...ctx} /> : null}
              </>
            );
          }}
        </Loadable>
      </Page>
    </>
  );
}
