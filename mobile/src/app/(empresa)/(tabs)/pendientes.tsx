import { useState } from 'react';
import type { AreaKey } from '@/lib/movil/contract-empresa';
import { AREA_SCREENS } from '@/ui/empresa/areas';
import { useEmpresa } from '@/ui/empresa/context';
import { areaMeta, QUEUE_KEYS } from '@/ui/empresa/nav';
import { Chip, ChipRow } from '@/ui/empresa/ui';
import { Loading } from '@/ui/kit';

/** Colas de trabajo del rol (documentos, pagos, solicitudes, leads) con sus contadores. */
export default function Pendientes() {
  const { visible, badge } = useEmpresa();
  const queues = QUEUE_KEYS.filter(visible);
  const [chosen, setChosen] = useState<AreaKey | null>(null);
  const current = chosen && queues.includes(chosen) ? chosen : (queues.find((k) => badge(k) > 0) ?? queues[0]);
  if (!current) return <Loading />;
  const Area = AREA_SCREENS[current];
  const header =
    queues.length > 1 ? (
      <ChipRow>
        {queues.map((k) => (
          <Chip key={k} label={areaMeta(k).label} active={k === current} count={badge(k)} onPress={() => setChosen(k)} />
        ))}
      </ChipRow>
    ) : null;
  return <Area key={current} tab title="Pendientes" header={header} />;
}
