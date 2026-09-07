import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, Sora } from 'next/font/google';
import { marca } from '@/content/sitio';
import './globals.css';

/*
 * Tipografía del manual de marca (Santiago, 2026-09-04): **Atkinson
 * Hyperlegible para titulares, Sora para texto**.
 *
 * Vale la pena saber por qué Atkinson es una elección afortunada acá y no
 * solo estilo: es la tipografía del Braille Institute, dibujada para que los
 * caracteres se distingan entre sí con visión reducida — la I mayúscula, la l
 * minúscula y el 1 no se confunden, la O y el 0 tampoco. Esta página le habla
 * a gente asustada, muchas veces mayor, leyendo en un celular. Ahí eso pesa.
 *
 * ⚠️ Atkinson Hyperlegible solo tiene 400 y 700. No pedir 500 ni 600: el
 * navegador los sintetizaría y los titulares saldrían sucios.
 *
 * Las dos se auto-hospedan con next/font, así que no hay peticiones a Google.
 */
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${marca.nombre} — ${marca.eslogan}`,
  description:
    'Qué puedes exigir de verdad tras el sismo: el seguro que ya pagas, la reducción de tasa, la refinanciación obligatoria y la segunda postulación al subsidio. Peritos financieros y abogados del lado del deudor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: extensiones de navegador (gestores de contraseñas,
  // correctores) inyectan atributos en <html>/<body> antes de que React hidrate.
  // Es DOM ajeno, no un bug del sitio.
  return (
    <html
      lang="es"
      className={`${atkinson.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
