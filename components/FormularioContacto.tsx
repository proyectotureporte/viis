'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  initialMessage: string;
}

type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export default function FormularioContacto({ initialMessage }: Props) {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [state, setState] = useState<SubmissionState>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();

    if (!email && !phone) {
      setState({ kind: 'error', message: 'Deja un teléfono o un correo para poder responderte.' });
      return;
    }

    setState({ kind: 'pending' });

    try {
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          phone,
          email,
          city: formData.get('city'),
          message: formData.get('message'),
          source: 'cta-web',
          consent: formData.get('consent') === 'on',
          website: formData.get('website'),
          startedAt,
        }),
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'No pudimos enviar el formulario.');
      }

      setState({
        kind: 'success',
        message: result.message || 'Recibimos tu solicitud. Te responderemos lo antes posible.',
      });
      form.reset();
      setStartedAt(Date.now());
    } catch (error) {
      setState({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No pudimos enviar el formulario. Inténtalo de nuevo.',
      });
    }
  }

  const pending = state.kind === 'pending';

  return (
    <form className="formulario-contacto" onSubmit={handleSubmit}>
      <div className="formulario-contacto__rejilla">
        <label className="campo">
          <span>Nombre y apellido</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
          />
        </label>

        <label className="campo">
          <span>Ciudad</span>
          <input name="city" type="text" autoComplete="address-level2" maxLength={120} />
        </label>

        <label className="campo">
          <span>Teléfono</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="Ej. 300 123 4567"
          />
        </label>

        <label className="campo">
          <span>Correo electrónico</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={320}
            placeholder="tu@correo.com"
          />
        </label>
      </div>

      <p className="formulario-contacto__ayuda">Deja al menos un teléfono o un correo.</p>

      <label className="campo">
        <span>Cuéntanos qué pasó</span>
        <textarea
          name="message"
          rows={7}
          minLength={10}
          maxLength={4_000}
          defaultValue={initialMessage}
          required
        />
      </label>

      <label className="campo-trampa" aria-hidden="true">
        Sitio web
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="consentimiento">
        <input name="consent" type="checkbox" required />
        <span>
          Autorizo a OpenV a usar estos datos únicamente para estudiar mi solicitud y responderme.
        </span>
      </label>

      <button className="boton boton--primario" type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar mi solicitud'}
        {!pending && <ArrowRight size={18} aria-hidden />}
      </button>

      <div className="formulario-contacto__estado" aria-live="polite" role="status">
        {state.kind === 'success' && (
          <p className="estado estado--exito">
            <CheckCircle2 size={20} aria-hidden />
            {state.message}
          </p>
        )}
        {state.kind === 'error' && <p className="estado estado--error">{state.message}</p>}
      </div>
    </form>
  );
}
