import { describe, expect, it } from 'vitest';
import { contactRequestSchema, firstValidationMessage } from '@/lib/contacto-schema';

const validRequest = {
  name: 'María Pérez',
  email: 'maria@example.com',
  phone: '',
  city: 'Cali',
  message: 'Mi vivienda quedó afectada y necesito orientación.',
  source: 'cta-web',
  consent: true,
  website: '',
  startedAt: Date.now() - 5_000,
};

describe('contactRequestSchema', () => {
  it('acepta un contacto con correo', () => {
    const result = contactRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it('acepta un contacto con teléfono aunque no tenga correo', () => {
    const result = contactRequestSchema.safeParse({
      ...validRequest,
      email: '',
      phone: '+57 300 123 4567',
    });
    expect(result.success).toBe(true);
  });

  it('exige al menos una forma de contacto', () => {
    const result = contactRequestSchema.safeParse({ ...validRequest, email: '', phone: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstValidationMessage(result.error)).toContain('teléfono o un correo');
    }
  });

  it('exige consentimiento', () => {
    const result = contactRequestSchema.safeParse({ ...validRequest, consent: false });
    expect(result.success).toBe(false);
  });

  it('rechaza datos y mensajes excesivamente largos', () => {
    const result = contactRequestSchema.safeParse({
      ...validRequest,
      name: 'a'.repeat(121),
      message: 'm'.repeat(4_001),
    });
    expect(result.success).toBe(false);
  });
});
