import { TabStack } from '@/ui/cliente/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return (
    <TabStack
      screens={[
        { name: 'pago', title: 'Reportar pago' },
        { name: 'nueva', title: 'Nueva solicitud' },
        { name: 'solicitud/[id]', title: 'Solicitud' },
        { name: 'caso/[id]', title: 'Mi caso' },
        { name: 'oferta/[id]', title: 'Aceptar oferta' },
      ]}
    />
  );
}
