import { TabStack } from '@/ui/cliente/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return <TabStack screens={[{ name: 'simular', title: 'Simulador' }, { name: 'escenario/[id]', title: 'Escenario' }, { name: 'comparar', title: 'Comparar escenarios' }]} />;
}
