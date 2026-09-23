/** Utilidades de exportación del portal aliado: iCalendar (RFC 5545) y CSV. */

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Pliega líneas a 75 octetos como exige el estándar. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(event: { uid: string; start: Date; minutes: number; title: string; description?: string; url?: string; stamp?: Date }): string {
  const end = new Date(event.start.getTime() + event.minutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenV//Agenda aliado//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@openv`,
    `DTSTAMP:${icsDate(event.stamp ?? new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Celda CSV segura: comillas y neutralización de fórmulas (=, +, -, @) para Excel. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";,\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(';');
}
