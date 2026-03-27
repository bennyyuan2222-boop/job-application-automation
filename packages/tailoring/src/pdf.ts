import type { ResumeDocument, ResumeEntry } from '@job-ops/domain';

type PdfFont = 'regular' | 'bold';

type LayoutLine = {
  text: string;
  font: PdfFont;
  size: number;
  indent: number;
  spacingBefore: number;
  spacingAfter: number;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function normalizeText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value: string): string {
  return normalizeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function estimateTextWidth(text: string, size: number, font: PdfFont): number {
  const normalized = normalizeText(text);
  const factor = font === 'bold' ? 0.56 : 0.52;
  return normalized.length * size * factor;
}

function breakLongWord(word: string, maxWidth: number, size: number, font: PdfFont): string[] {
  const chars = normalizeText(word).split('');
  const result: string[] = [];
  let current = '';

  for (const char of chars) {
    const candidate = `${current}${char}`;
    if (current && estimateTextWidth(candidate, size, font) > maxWidth) {
      result.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) {
    result.push(current);
  }

  return result.length > 0 ? result : [''];
}

function wrapText(text: string, size: number, font: PdfFont, indent = 0): string[] {
  const maxWidth = CONTENT_WIDTH - indent;
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;

    const candidate = current ? `${current} ${word}` : word;
    if (!current || estimateTextWidth(candidate, size, font) <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = '';

    if (estimateTextWidth(word, size, font) > maxWidth) {
      const pieces = breakLongWord(word, maxWidth, size, font);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? '';
    } else {
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function pushWrappedLine(
  target: LayoutLine[],
  text: string,
  font: PdfFont,
  size: number,
  indent = 0,
  spacingBefore = 0,
  spacingAfter = 0,
) {
  const wrapped = wrapText(text, size, font, indent);
  wrapped.forEach((line, index) => {
    target.push({
      text: line,
      font,
      size,
      indent,
      spacingBefore: index === 0 ? spacingBefore : 0,
      spacingAfter: index === wrapped.length - 1 ? spacingAfter : 0,
    });
  });
}

function headingText(entry: ResumeEntry): string | null {
  if (!entry.heading) {
    return null;
  }

  let value = entry.heading;
  if (entry.subheading) {
    value += ` - ${entry.subheading}`;
  }
  if (entry.location) {
    value += ` - ${entry.location}`;
  }
  return value;
}

function buildLayout(title: string, document: ResumeDocument): LayoutLine[] {
  const lines: LayoutLine[] = [];

  pushWrappedLine(lines, title, 'bold', 20, 0, 0, 10);

  for (const headerLine of document.meta?.headerLines ?? []) {
    pushWrappedLine(lines, headerLine, 'regular', 10.5, 0, 0, 0);
  }

  if ((document.meta?.headerLines ?? []).length > 0) {
    lines.push({ text: '', font: 'regular', size: 10, indent: 0, spacingBefore: 0, spacingAfter: 6 });
  }

  if (document.meta?.summary) {
    pushWrappedLine(lines, 'SUMMARY', 'bold', 11, 0, 0, 6);
    pushWrappedLine(lines, document.meta.summary, 'regular', 10, 0, 0, 8);
  }

  for (const section of document.sections) {
    pushWrappedLine(lines, section.title.toUpperCase(), 'bold', 11, 0, 6, 4);

    for (const entry of section.entries) {
      const heading = headingText(entry);
      if (heading) {
        pushWrappedLine(lines, heading, 'bold', 10.5, 0, 2, 0);
      }
      if (entry.dateRange) {
        pushWrappedLine(lines, entry.dateRange, 'regular', 9.5, 0, 0, 0);
      }
      for (const line of entry.lines ?? []) {
        pushWrappedLine(lines, line, 'regular', 9.5, 0, 0, 0);
      }
      for (const bullet of entry.bullets ?? []) {
        pushWrappedLine(lines, `- ${bullet}`, 'regular', 9.5, 16, 0, 0);
      }
      lines.push({ text: '', font: 'regular', size: 8, indent: 0, spacingBefore: 0, spacingAfter: 5 });
    }
  }

  return lines;
}

function lineHeight(size: number): number {
  return size * 1.32;
}

function paginate(lines: LayoutLine[]): LayoutLine[][] {
  const pages: LayoutLine[][] = [[]];
  let currentPage = pages[0]!;
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  for (const line of lines) {
    currentY -= line.spacingBefore;
    const drawHeight = line.text ? lineHeight(line.size) : line.spacingAfter;

    if (currentY - drawHeight < MARGIN_BOTTOM) {
      currentPage = [];
      pages.push(currentPage);
      currentY = PAGE_HEIGHT - MARGIN_TOP;
      currentY -= line.spacingBefore;
    }

    currentPage.push(line);
    currentY -= drawHeight;
    currentY -= line.spacingAfter;
  }

  return pages.filter((page) => page.length > 0);
}

function pageContentStream(lines: LayoutLine[]): string {
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const commands: string[] = [];

  for (const line of lines) {
    y -= line.spacingBefore;

    if (!line.text) {
      y -= line.spacingAfter;
      continue;
    }

    const fontRef = line.font === 'bold' ? 'F2' : 'F1';
    const text = escapePdfText(line.text);
    commands.push(`BT /${fontRef} ${line.size.toFixed(2)} Tf ${MARGIN_X + line.indent} ${y.toFixed(2)} Td (${text}) Tj ET`);
    y -= lineHeight(line.size);
    y -= line.spacingAfter;
  }

  return commands.join('\n');
}

export function renderResumePdf(title: string, document: ResumeDocument): Buffer {
  const pages = paginate(buildLayout(title, document));
  const objects: string[] = [];

  const catalogId = 1;
  const pagesId = 2;
  const regularFontId = 3;
  const boldFontId = 4;

  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(5 + index * 2);
    contentObjectIds.push(6 + index * 2);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
  objects[regularFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[boldFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  pages.forEach((pageLines, index) => {
    const pageObjectId = pageObjectIds[index]!;
    const contentObjectId = contentObjectIds[index]!;
    const stream = pageContentStream(pageLines);
    const streamLength = Buffer.byteLength(stream, 'utf8');

    objects[pageObjectId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId - 1] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const objectId = index + 1;
    offsets[objectId] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${objectId} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}
