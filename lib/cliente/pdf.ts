import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Las fuentes estándar de PDF solo codifican WinAnsi (Latin-1 + algunos
 * signos). Todo texto pasa por aquí para que un carácter no soportado no
 * rompa la generación del documento.
 */
const REPLACEMENTS: Record<string, string> = {
  '−': '-', '‐': '-', '‑': '-', '≥': '>=', '≤': '<=', '≈': '~', '→': '->', '←': '<-', '×': 'x',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '√': 'raiz', '∑': 'Suma', 'Σ': 'Suma', ' ': ' ', ' ': ' ', ' ': ' ',
  '\t': ' ',
};
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function winAnsi(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    if (REPLACEMENTS[ch] !== undefined) {
      out += REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) {
      out += ch;
      continue;
    }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base && [...base].every((c) => (c.codePointAt(0) ?? 0) < 0x7f) ? base : '?';
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of winAnsi(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palabra más larga que el ancho (hashes, URLs): se corta por caracteres.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

export interface PdfSection {
  title: string;
  lines?: Array<{ label: string; value: string }>;
  bullets?: string[];
  paragraphs?: string[];
}

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.043, 0.145, 0.2);
const MUTED = rgb(0.34, 0.41, 0.44);
const MINT = rgb(0.043, 0.557, 0.455);

/** Documento simple, paginado, con pie de página en cada hoja. */
export async function buildReportPdf(input: { title: string; subtitle: string; footer: string; sections: PdfSection[] }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(input.title));
  pdf.setProducer('OpenV');
  pdf.setCreator('OpenV');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE[0] - MARGIN * 2;
  let page: PDFPage = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 20) {
      page = pdf.addPage(PAGE);
      y = PAGE[1] - MARGIN;
    }
  };
  const text = (value: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    for (const line of wrap(value, f, size, width - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  page.drawRectangle({ x: MARGIN, y: y - 4, width: 26, height: 26, color: MINT });
  page.drawText('V', { x: MARGIN + 8, y: y + 3, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText('OpenV', { x: MARGIN + 34, y: y + 3, size: 15, font: bold, color: INK });
  y -= 40;
  text(input.title, { size: 17, f: bold, gap: 2 });
  text(input.subtitle, { size: 10, color: MUTED, gap: 10 });

  for (const section of input.sections) {
    ensure(40);
    y -= 6;
    text(section.title, { size: 12.5, f: bold, color: MINT, gap: 4 });
    for (const line of section.lines ?? []) {
      const label = `${line.label}:`;
      const labelWidth = Math.min(bold.widthOfTextAtSize(winAnsi(label), 10) + 6, width * 0.55);
      const valueLines = wrap(line.value, font, 10, width - labelWidth);
      ensure(14);
      page.drawText(winAnsi(label), { x: MARGIN, y: y - 10, size: 10, font: bold, color: INK });
      valueLines.forEach((v, i) => {
        if (i > 0) ensure(14);
        page.drawText(v, { x: MARGIN + labelWidth, y: y - 10, size: 10, font, color: INK });
        y -= 14;
      });
    }
    for (const bullet of section.bullets ?? []) {
      const lines = wrap(bullet, font, 9.5, width - 14);
      lines.forEach((l, i) => {
        ensure(13);
        if (i === 0) page.drawText('-', { x: MARGIN + 2, y: y - 9.5, size: 9.5, font, color: MUTED });
        page.drawText(l, { x: MARGIN + 14, y: y - 9.5, size: 9.5, font, color: INK });
        y -= 13;
      });
      y -= 2;
    }
    for (const paragraph of section.paragraphs ?? []) text(paragraph, { size: 10, gap: 4 });
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(winAnsi(`${input.footer} · Página ${i + 1} de ${pages.length}`), { x: MARGIN, y: 28, size: 8, font, color: MUTED });
  });
  return pdf.save();
}
