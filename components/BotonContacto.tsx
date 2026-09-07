import { MessageCircle } from 'lucide-react';
import { enlaceContacto } from '@/lib/contacto';

interface Props {
  mensaje: string;
  etiqueta: string;
  variante?: 'primario' | 'secundario';
}

/**
 * Único punto de la página que renderiza un CTA. El día que aparezca el
 * número de WhatsApp de OpenV, cambia el canal de todos los botones a la
 * vez — sin tocar ninguna sección.
 */
export default function BotonContacto({ mensaje, etiqueta, variante = 'primario' }: Props) {
  return (
    <a className={`boton boton--${variante}`} href={enlaceContacto(mensaje)}>
      <MessageCircle size={18} aria-hidden />
      {etiqueta}
    </a>
  );
}
