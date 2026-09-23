import { TabStack } from '@/ui/cliente/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return (
    <TabStack
      screens={[
        { name: 'vivienda', title: 'Mi vivienda' },
        { name: 'inmueble', title: 'Ficha del inmueble' },
        { name: 'valor', title: 'Valor de mi vivienda' },
        { name: 'hogar', title: 'Mi hogar' },
        { name: 'documentos', title: 'Documentos' },
        { name: 'subir', title: 'Subir documento' },
        { name: 'ayuda', title: 'Ayuda' },
      ]}
    />
  );
}
