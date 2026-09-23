import { AREA_SCREENS } from '@/ui/empresa/areas';
import { useEmpresa } from '@/ui/empresa/context';
import { areaMeta, PANEL_PREFERENCE } from '@/ui/empresa/nav';
import { Loading } from '@/ui/kit';

/** Cuarta pestaña: Analítica si el rol la tiene; si no, el área más útil disponible para el rol. */
export default function Panel() {
  const { visible } = useEmpresa();
  const key = PANEL_PREFERENCE.find(visible);
  if (!key) return <Loading />;
  const Area = AREA_SCREENS[key];
  return <Area tab title={areaMeta(key).label} />;
}
