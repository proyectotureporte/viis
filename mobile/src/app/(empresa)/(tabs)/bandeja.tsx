import { useLocalSearchParams } from 'expo-router';
import { BandejaArea } from '@/ui/empresa/areas/Bandeja';

export default function Bandeja() {
  // `?q=OV-1001` llega desde una notificación: abre la bandeja ya filtrada.
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <BandejaArea key={q ?? ''} tab initialQuery={q ?? ''} />;
}
