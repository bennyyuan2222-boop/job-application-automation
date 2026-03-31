import type { ResumeDocument, ResumeEntry } from '@job-ops/domain';

type PdfFont = 'regular' | 'bold';
type TextAlign = 'left' | 'center' | 'right';

type TextItem = {
  kind: 'text';
  text: string;
  font: PdfFont;
  size: number;
  indent: number;
  align: TextAlign;
  spacingBefore: number;
  spacingAfter: number;
};

type RowItem = {
  kind: 'row';
  leftText: string;
  rightText?: string;
  leftFont: PdfFont;
  rightFont: PdfFont;
  size: number;
  spacingBefore: number;
  spacingAfter: number;
};

type RuleItem = {
  kind: 'rule';
  spacingBefore: number;
  spacingAfter: number;
  thickness: number;
};

type LayoutItem = TextItem | RowItem | RuleItem;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 36;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function normalizeText(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
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
  const factor = font === 'bold' ? 0.5 : 0.47;
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

function wrapText(text: string, size: number, font: PdfFont, maxWidth: number): string[] {
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

function pushWrappedText(
  target: LayoutItem[],
  text: string,
  font: PdfFont,
  size: number,
  options?: { indent?: number; align?: TextAlign; spacingBefore?: number; spacingAfter?: number },
) {
  const indent = options?.indent ?? 0;
  const align = options?.align ?? 'left';
  const spacingBefore = options?.spacingBefore ?? 0;
  const spacingAfter = options?.spacingAfter ?? 0;
  const wrapped = wrapText(text, size, font, CONTENT_WIDTH - indent);

  wrapped.forEach((line, index) => {
    target.push({
      kind: 'text',
      text: line,
      font,
      size,
      indent,
      align,
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
    value += ` — ${entry.location}`;
  }
  return normalizeText(value);
}

function lineHeight(size: number): number {
  return size * 1.12;
}

function itemHeight(item: LayoutItem): number {
  if (item.kind === 'rule') {
    return item.thickness;
  }

  if (item.kind === 'text' && !item.text) {
    return 0;
  }

  return lineHeight(item.size);
}

function buildLayout(title: string, document: ResumeDocument): LayoutItem[] {
  const items: LayoutItem[] = [];
  const displayName = normalizeText(document.meta?.displayName || title);
  const headerLines = (document.meta?.headerLines ?? []).map((line) => normalizeText(line)).filter(Boolean);

  pushWrappedText(items, displayName, 'bold', 14.5, { align: 'center', spacingAfter: 1 });
  for (const headerLine of headerLines) {
    pushWrappedText(items, headerLine, 'regular', 9.2, { align: 'center' });
  }

  items.push({ kind: 'rule', spacingBefore: 6, spacingAfter: 4, thickness: 0.7 });

  if (document.meta?.summary) {
    pushWrappedText(items, 'SUMMARY', 'bold', 9.8, { spacingBefore: 1, spacingAfter: 1 });
    pushWrappedText(items, document.meta.summary, 'regular', 9.5, { spacingAfter: 3 });
  }

  for (const section of document.sections) {
    pushWrappedText(items, section.title.toUpperCase(), 'bold', 9.8, { spacingBefore: 4, spacingAfter: 1 });
    items.push({ kind: 'rule', spacingBefore: 0, spacingAfter: 2, thickness: 0.7 });

    for (const entry of section.entries) {
      const heading = headingText(entry);
      const dateRange = entry.dateRange ? normalizeText(entry.dateRange) : undefined;

      if (heading && dateRange) {
        const availableLeftWidth = CONTENT_WIDTH - estimateTextWidth(dateRange, 10, 'regular') - 16;
        if (estimateTextWidth(heading, 10.1, 'bold') <= availableLeftWidth) {
          items.push({
            kind: 'row',
            leftText: heading,
            rightText: dateRange,
            leftFont: 'bold',
            rightFont: 'regular',
            size: 10.1,
            spacingBefore: 1.5,
            spacingAfter: 0,
          });
        } else {
          pushWrappedText(items, heading, 'bold', 10.1, { spacingBefore: 1.5, spacingAfter: 0 });
          pushWrappedText(items, dateRange, 'regular', 9.8, { align: 'right', spacingAfter: 0 });
        }
      } else if (heading) {
        pushWrappedText(items, heading, 'bold', 10.1, { spacingBefore: 1.5, spacingAfter: 0 });
      } else if (dateRange) {
        pushWrappedText(items, dateRange, 'regular', 9.8, { align: 'right', spacingBefore: 1.5, spacingAfter: 0 });
      }

      for (const line of entry.lines ?? []) {
        pushWrappedText(items, line, 'regular', 9.55, { spacingAfter: 0 });
      }
      for (const bullet of entry.bullets ?? []) {
        if (section.kind === 'skills') {
          pushWrappedText(items, bullet, 'regular', 9.35, { spacingAfter: 0 });
        } else {
          pushWrappedText(items, `- ${bullet}`, 'regular', 9.35, { indent: 8, spacingAfter: 0 });
        }
      }

      items.push({ kind: 'text', text: '', font: 'regular', size: 8, indent: 0, align: 'left', spacingBefore: 0, spacingAfter: 2 });
    }
  }

  return items;
}

function paginate(items: LayoutItem[]): LayoutItem[][] {
  const pages: LayoutItem[][] = [[]];
  let currentPage = pages[0]!;
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  for (const item of items) {
    currentY -= item.spacingBefore;
    const drawHeight = itemHeight(item);

    if (currentY - drawHeight < MARGIN_BOTTOM) {
      currentPage = [];
      pages.push(currentPage);
      currentY = PAGE_HEIGHT - MARGIN_TOP;
      currentY -= item.spacingBefore;
    }

    currentPage.push(item);
    currentY -= drawHeight;
    currentY -= item.spacingAfter;
  }

  return pages.filter((page) => page.length > 0);
}

function resolveTextX(text: string, size: number, font: PdfFont, align: TextAlign, indent: number): number {
  const width = estimateTextWidth(text, size, font);
  if (align === 'center') {
    return Math.max(MARGIN_X, (PAGE_WIDTH - width) / 2);
  }
  if (align === 'right') {
    return PAGE_WIDTH - MARGIN_X - indent - width;
  }
  return MARGIN_X + indent;
}

function pageContentStream(items: LayoutItem[]): string {
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const commands: string[] = [];

  for (const item of items) {
    y -= item.spacingBefore;

    if (item.kind === 'rule') {
      commands.push(`${item.thickness.toFixed(2)} w ${MARGIN_X} ${y.toFixed(2)} m ${PAGE_WIDTH - MARGIN_X} ${y.toFixed(2)} l S`);
      y -= item.thickness;
      y -= item.spacingAfter;
      continue;
    }

    if (item.kind === 'row') {
      const leftText = escapePdfText(item.leftText);
      const leftX = MARGIN_X;
      commands.push(`BT /F${item.leftFont === 'bold' ? 2 : 1} ${item.size.toFixed(2)} Tf ${leftX.toFixed(2)} ${y.toFixed(2)} Td (${leftText}) Tj ET`);

      if (item.rightText) {
        const rightText = escapePdfText(item.rightText);
        const rightWidth = estimateTextWidth(item.rightText, item.size, item.rightFont);
        const rightX = PAGE_WIDTH - MARGIN_X - rightWidth;
        commands.push(`BT /F${item.rightFont === 'bold' ? 2 : 1} ${item.size.toFixed(2)} Tf ${rightX.toFixed(2)} ${y.toFixed(2)} Td (${rightText}) Tj ET`);
      }

      y -= lineHeight(item.size);
      y -= item.spacingAfter;
      continue;
    }

    if (item.text) {
      const fontRef = item.font === 'bold' ? 'F2' : 'F1';
      const text = escapePdfText(item.text);
      const x = resolveTextX(item.text, item.size, item.font, item.align, item.indent);
      commands.push(`BT /${fontRef} ${item.size.toFixed(2)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`);
      y -= lineHeight(item.size);
    }

    y -= item.spacingAfter;
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
  objects[regularFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>';
  objects[boldFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>';

  pages.forEach((pageItems, index) => {
    const pageObjectId = pageObjectIds[index]!;
    const contentObjectId = contentObjectIds[index]!;
    const stream = pageContentStream(pageItems);
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
