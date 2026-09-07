import { describe, expect, it } from 'vitest';
import { escapeEmailHtml } from '@/lib/contact-emails';

describe('correo del formulario', () => {
  it('escapa datos introducidos por el usuario antes de crear el HTML', () => {
    expect(escapeEmailHtml(`<script>alert('x')</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;',
    );
  });
});
