import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import FormularioContacto from '@/components/FormularioContacto';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { MENSAJE_GENERICO } from '@/content/sitio';

export const metadata: Metadata = {
  title: 'Cuéntanos tu caso — OpenV',
  description:
    'Cuéntale a OpenV tu situación de vivienda para que peritos financieros y abogados revisen tu caso.',
};

interface Props {
  searchParams: Promise<{ mensaje?: string | string[] }>;
}

export default async function ContactoPage({ searchParams }: Props) {
  const params = await searchParams;
  const suppliedMessage = Array.isArray(params.mensaje) ? params.mensaje[0] : params.mensaje;
  const initialMessage = suppliedMessage?.trim().slice(0, 4_000) || MENSAJE_GENERICO;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="seccion pagina-contacto">
          <div className="contenedor--lectura">
            <Link className="volver" href="/">
              <ArrowLeft size={17} aria-hidden /> Volver a la página
            </Link>

            <p className="eyebrow">Hablemos de tu caso</p>
            <h1>Cuéntanos qué te pasó</h1>
            <p className="bajada">
              No necesitas conocer términos técnicos ni tener todos los papeles. Déjanos una forma
              de contactarte y una explicación breve para empezar.
            </p>

            <div className="tarjeta formulario-contacto__tarjeta">
              <FormularioContacto initialMessage={initialMessage} />
            </div>

            <p className="contacto-confianza">
              <ShieldCheck size={19} aria-hidden />
              Primero revisamos tu situación. Después te explicamos por escrito qué se puede hacer
              y cuánto cuesta; tú decides si continúas.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
