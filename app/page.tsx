import AntesDeFirmar from '@/components/AntesDeFirmar';
import Calculadora from '@/components/Calculadora';
import CtaFinal from '@/components/CtaFinal';
import Dictamen from '@/components/Dictamen';
import Empresas from '@/components/Empresas';
import Hero from '@/components/Hero';
import Palancas from '@/components/Palancas';
import PorQueExistimos from '@/components/PorQueExistimos';
import PorQueSabemos from '@/components/PorQueSabemos';
import QueHacemos from '@/components/QueHacemos';
import Reconocimiento from '@/components/Reconocimiento';
import Relojes from '@/components/Relojes';
import Revelar from '@/components/Revelar';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import Transparencia from '@/components/Transparencia';

/*
 * El hero NO va envuelto en Revelar: está sobre el pliegue y animarlo solo
 * produciría parpadeo en lo primero que se ve. De ahí para abajo cada sección
 * aparece al entrar en pantalla — y Revelar de todos modos se salta lo que ya
 * esté a la vista al cargar.
 */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        {/* Reconocer antes de pedir: va deliberadamente ANTES de los números. */}
        <Revelar>
          <Reconocimiento />
        </Revelar>
        <Revelar>
          <Relojes />
        </Revelar>
        <Revelar>
          <Calculadora />
        </Revelar>
        <Revelar>
          <QueHacemos />
        </Revelar>
        <Revelar>
          <Palancas />
        </Revelar>
        <Revelar>
          <AntesDeFirmar />
        </Revelar>
        <Revelar>
          <Dictamen />
        </Revelar>
        <Revelar>
          <PorQueExistimos />
        </Revelar>
        <Revelar>
          <PorQueSabemos />
        </Revelar>
        <Revelar>
          <Transparencia />
        </Revelar>
        <Revelar>
          <Empresas />
        </Revelar>
        <Revelar>
          <CtaFinal />
        </Revelar>
      </main>
      <SiteFooter />
    </>
  );
}
