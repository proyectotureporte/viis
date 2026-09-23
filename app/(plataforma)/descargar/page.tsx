import { readFile } from 'node:fs/promises';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { fechaHora } from '@/lib/labels';

export const metadata: Metadata = { title: 'Descarga la app', robots: { index: true, follow: true } };
export const dynamic = 'force-dynamic';

interface Build { version: string; commit: string; sha256: string; bytes: number; builtAt: string }

async function builds(): Promise<{ android: Build | null; ios: Build | null }> {
  try {
    const dir = process.env.APP_DIST_DIR?.trim() || '/var/www/viis-copia-dist';
    return JSON.parse(await readFile(`${dir}/app-version.json`, 'utf8'));
  } catch {
    return { android: null, ios: null };
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}

function BuildInfo({ build }: { build: Build | null }) {
  if (!build) return <p className="ov-meta">Compilación en preparación.</p>;
  return (
    <dl className="ov-dl" style={{ marginTop: 10 }}>
      <dt>Versión</dt><dd>{build.version} ({build.commit})</dd>
      <dt>Publicada</dt><dd>{fechaHora(build.builtAt)}</dd>
      <dt>Tamaño</dt><dd>{mb(build.bytes)}</dd>
      <dt>SHA-256</dt><dd className="ov-mono">{build.sha256}</dd>
    </dl>
  );
}

export default async function DescargarPage() {
  const { android, ios } = await builds();
  return (
    <main className="ov-legal">
      <Link href="/"><Image src="/logo-openv.png" alt="OpenV" width={640} height={228} style={{ width: 150, height: 'auto' }} priority /></Link>
      <h1 style={{ marginTop: 20 }}>Descarga la app de OpenV</h1>
      <p>Una sola app para clientes, aliados y el equipo OpenV: crédito, simulaciones, trámites y documentos para clientes; clientes, agenda, comisiones y academia para aliados; y la consola completa de operación para el equipo. Con desbloqueo por Face ID o huella.</p>

      <div className="ov-grid" style={{ marginTop: 24 }}>
        <article className="ov-card s6">
          <h2>Android</h2>
          <a className="ov-btn" href="/app.apk" style={{ marginTop: 8 }}>Descargar OpenV.apk</a>
          <BuildInfo build={android} />
          <ol style={{ paddingLeft: 18, marginTop: 14 }}>
            <li>Descarga el archivo desde el celular.</li>
            <li>Ábrelo. Si Android lo pide, permite instalar apps de esta fuente (tu navegador o gestor de archivos).</li>
            <li>Instala y abre OpenV. Para actualizar, descarga e instala de nuevo: tus datos se conservan.</li>
          </ol>
        </article>
        <article className="ov-card s6">
          <h2>iPhone</h2>
          <a className="ov-btn" href="/app.ipa" style={{ marginTop: 8 }}>Descargar OpenV.ipa</a>
          <BuildInfo build={ios} />
          <ol style={{ paddingLeft: 18, marginTop: 14 }}>
            <li>Instala <strong>SideStore</strong> en tu iPhone (sidestore.io) y déjalo configurado con tu Apple ID.</li>
            <li>Descarga <em>OpenV.ipa</em> y compártelo con SideStore (o en SideStore: Mis apps → +, y elige el archivo).</li>
            <li>SideStore firma la app con tu Apple ID. Ábrela y acepta Face ID cuando la app lo pida.</li>
            <li>Con un Apple ID gratuito, SideStore debe renovar la firma cada 7 días (lo hace solo si está configurado).</li>
          </ol>
          <p className="ov-meta">El IPA se distribuye sin firma, para instalación de prueba con SideStore.</p>
        </article>
      </div>
      <p className="ov-meta" style={{ marginTop: 20 }}>¿Prefieres el navegador? Todo está también en <Link href="/ingresar">app.viis.app</Link>.</p>
    </main>
  );
}
