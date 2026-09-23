import { TabStack } from '@/ui/cliente/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return <TabStack screens={[{ name: 'editar', title: 'Datos del crédito' }, { name: 'amortizacion', title: 'Tabla de amortización' }]} />;
}
