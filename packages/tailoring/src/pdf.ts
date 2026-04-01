import type { ResumeDocument, ResumeEntry, ResumeSection, ResumeSectionKind } from '@job-ops/domain';

type PdfFont = 'regular' | 'bold' | 'italic';
type TextAlign = 'left' | 'center' | 'right';
type PdfColor = readonly [number, number, number];

type LayoutMeta = {
  sectionName?: string;
  sectionKind?: ResumeSectionKind;
  lineRole?: 'display_name' | 'header_line' | 'section_header' | 'entry_heading' | 'entry_line' | 'bullet' | 'spacer';
  bulletLineCount?: number;
  bulletCharCount?: number;
};

type BulletMarker = {
  kind: 'bullet';
  x: number;
  radius: number;
  color: PdfColor;
};

type TextItem = {
  kind: 'text';
  text: string;
  font: PdfFont;
  size: number;
  indent: number;
  align: TextAlign;
  color: PdfColor;
  spacingBefore: number;
  spacingAfter: number;
  marker?: BulletMarker;
  meta?: LayoutMeta;
};

type RowItem = {
  kind: 'row';
  leftText: string;
  rightText?: string;
  leftFont: PdfFont;
  rightFont: PdfFont;
  leftColor: PdfColor;
  rightColor: PdfColor;
  size: number;
  spacingBefore: number;
  spacingAfter: number;
  meta?: LayoutMeta;
};

type RuleItem = {
  kind: 'rule';
  spacingBefore: number;
  spacingAfter: number;
  thickness: number;
  color: PdfColor;
  x1?: number;
  x2?: number;
};

type SectionHeaderItem = {
  kind: 'sectionHeader';
  title: string;
  size: number;
  textColor: PdfColor;
  lineColor: PdfColor;
  thickness: number;
  spacingBefore: number;
  spacingAfter: number;
  meta?: LayoutMeta;
};

type InlineSegment = {
  text: string;
  font: PdfFont;
  color: PdfColor;
};

type SegmentsRowItem = {
  kind: 'segments';
  segments: InlineSegment[];
  size: number;
  align: TextAlign;
  spacingBefore: number;
  spacingAfter: number;
  meta?: LayoutMeta;
};

type LayoutItem = TextItem | RowItem | RuleItem | SectionHeaderItem | SegmentsRowItem;

export type SectionLayoutMetric = {
  sectionName: string;
  sectionKind: ResumeSectionKind;
  renderedLines: number;
  bulletCount: number;
  bulletLineCount: number;
  oneLineBulletCount: number;
  averageBulletChars: number;
};

export type ResumeLayoutMetrics = {
  pageHeightPts: number;
  pageWidthPts: number;
  topMarginPts: number;
  bottomMarginPts: number;
  pageCount: number;
  overflowed: boolean;
  bottomWhitespacePts: number;
  bottomWhitespaceRatio: number;
  totalRenderedLines: number;
  oneLineBulletRatio: number;
  sectionMetrics: SectionLayoutMetric[];
};

export type RenderResumePdfDetailedResult = {
  pdfBuffer: Buffer;
  layoutMetrics: ResumeLayoutMetrics;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 34;
const MARGIN_TOP = 26;
const MARGIN_BOTTOM = 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BLUE: PdfColor = [0.27, 0.67, 0.82];
const BLACK: PdfColor = [0, 0, 0];
const RULE_GRAY: PdfColor = [0.42, 0.42, 0.42];
const BULLET_TEXT_INDENT = 32;
const BULLET_MARKER_X = MARGIN_X + 18;
const BULLET_RADIUS = 1.85;

function normalizeText(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value: string): string {
  return normalizeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function comparableText(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fontWidthFactor(font: PdfFont): number {
  switch (font) {
    case 'bold':
      return 0.5;
    case 'italic':
      return 0.46;
    default:
      return 0.47;
  }
}

function estimateTextWidth(text: string, size: number, font: PdfFont): number {
  const normalized = normalizeText(text);
  return normalized.length * size * fontWidthFactor(font);
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
  options?: {
    indent?: number;
    align?: TextAlign;
    color?: PdfColor;
    spacingBefore?: number;
    spacingAfter?: number;
    meta?: LayoutMeta;
  },
) {
  const indent = options?.indent ?? 0;
  const align = options?.align ?? 'left';
  const color = options?.color ?? BLACK;
  const spacingBefore = options?.spacingBefore ?? 0;
  const spacingAfter = options?.spacingAfter ?? 0;
  const meta = options?.meta;
  const wrapped = wrapText(text, size, font, CONTENT_WIDTH - indent);

  wrapped.forEach((line, index) => {
    target.push({
      kind: 'text',
      text: line,
      font,
      size,
      indent,
      align,
      color,
      spacingBefore: index === 0 ? spacingBefore : 0,
      spacingAfter: index === wrapped.length - 1 ? spacingAfter : 0,
      ...(meta ? { meta } : {}),
    });
  });
}

function pushBulletParagraph(
  target: LayoutItem[],
  text: string,
  options?: { size?: number; font?: PdfFont; color?: PdfColor; spacingBefore?: number; spacingAfter?: number; meta?: LayoutMeta },
) {
  const size = options?.size ?? 9.2;
  const font = options?.font ?? 'regular';
  const color = options?.color ?? BLACK;
  const spacingBefore = options?.spacingBefore ?? 0;
  const spacingAfter = options?.spacingAfter ?? 0;
  const indent = BULLET_TEXT_INDENT;
  const wrapped = wrapText(text, size, font, CONTENT_WIDTH - indent);
  const bulletText = normalizeText(text);
  const meta = options?.meta;

  wrapped.forEach((line, index) => {
    target.push({
      kind: 'text',
      text: line,
      font,
      size,
      indent,
      align: 'left',
      color,
      spacingBefore: index === 0 ? spacingBefore : 0,
      spacingAfter: index === wrapped.length - 1 ? spacingAfter : 0,
      ...(index === 0
        ? {
            marker: {
              kind: 'bullet' as const,
              x: BULLET_MARKER_X,
              radius: BULLET_RADIUS,
              color,
            },
          }
        : {}),
      ...(meta || wrapped.length > 0
        ? {
            meta: {
              ...(meta ?? {}),
              lineRole: 'bullet',
              ...(index === 0
                ? {
                    bulletLineCount: wrapped.length,
                    bulletCharCount: bulletText.length,
                  }
                : {}),
            },
          }
        : {}),
    });
  });
}

function dedupeAppend(base: string, addition: string | undefined): string {
  if (!addition) {
    return base;
  }

  const cleanAddition = normalizeText(addition);
  if (!cleanAddition) {
    return base;
  }

  const baseComparable = comparableText(base);
  const additionComparable = comparableText(cleanAddition);
  if (!additionComparable || baseComparable.includes(additionComparable)) {
    return base;
  }

  return `${base} - ${cleanAddition}`;
}

function headingText(entry: ResumeEntry): string | null {
  if (!entry.heading) {
    return null;
  }

  let value = normalizeText(entry.heading);
  value = dedupeAppend(value, entry.subheading);
  value = dedupeAppend(value, entry.location);
  return value;
}

function lineHeight(size: number): number {
  return size * 1.06;
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

function buildHeaderSegments(line: string): InlineSegment[] {
  const normalized = normalizeText(line);
  if (!normalized) {
    return [];
  }

  const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [{ text: normalized, font: 'regular', color: BLACK }];
  }

  const segments: InlineSegment[] = [];
  parts.forEach((part, index) => {
    if (index > 0) {
      segments.push({ text: ' | ', font: 'regular', color: BLACK });
    }
    segments.push({
      text: part,
      font: /available/i.test(part) ? 'bold' : 'regular',
      color: BLACK,
    });
  });
  return segments;
}

function shouldRenderSection(section: ResumeSection): boolean {
  return section.kind !== 'summary' && normalizeText(section.title).toLowerCase() !== 'summary';
}

function buildLayout(title: string, document: ResumeDocument): LayoutItem[] {
  const items: LayoutItem[] = [];
  const displayName = normalizeText(document.meta?.displayName || title);
  const headerLines = (document.meta?.headerLines ?? []).map((line) => normalizeText(line)).filter(Boolean);
  const sections = document.sections.filter(shouldRenderSection);

  pushWrappedText(items, displayName, 'bold', 17.2, {
    align: 'center',
    color: BLUE,
    spacingAfter: 1.5,
    meta: { lineRole: 'display_name' },
  });

  for (const headerLine of headerLines) {
    items.push({
      kind: 'segments',
      segments: buildHeaderSegments(headerLine),
      size: 8.9,
      align: 'center',
      spacingBefore: 0,
      spacingAfter: 0,
      meta: { lineRole: 'header_line' },
    });
  }

  items.push({
    kind: 'rule',
    spacingBefore: 5.5,
    spacingAfter: 6,
    thickness: 0.6,
    color: RULE_GRAY,
  });

  sections.forEach((section, sectionIndex) => {
    const sectionMeta: LayoutMeta = {
      sectionName: normalizeText(section.title).toUpperCase(),
      sectionKind: section.kind,
    };

    items.push({
      kind: 'sectionHeader',
      title: normalizeText(section.title).toUpperCase(),
      size: 10.6,
      textColor: BLUE,
      lineColor: RULE_GRAY,
      thickness: 0.55,
      spacingBefore: sectionIndex === 0 ? 0 : 3,
      spacingAfter: 3.6,
      meta: {
        ...sectionMeta,
        lineRole: 'section_header',
      },
    });

    for (const entry of section.entries) {
      const heading = headingText(entry);
      const dateRange = entry.dateRange ? normalizeText(entry.dateRange) : undefined;

      if (heading && dateRange) {
        const availableLeftWidth = CONTENT_WIDTH - estimateTextWidth(dateRange, 10, 'italic') - 14;
        if (estimateTextWidth(heading, 10.35, 'bold') <= availableLeftWidth) {
          items.push({
            kind: 'row',
            leftText: heading,
            rightText: dateRange,
            leftFont: 'bold',
            rightFont: 'italic',
            leftColor: BLACK,
            rightColor: BLACK,
            size: 10.35,
            spacingBefore: 0.8,
            spacingAfter: 0,
            meta: {
              ...sectionMeta,
              lineRole: 'entry_heading',
            },
          });
        } else {
          pushWrappedText(items, heading, 'bold', 10.35, {
            spacingBefore: 0.8,
            spacingAfter: 0,
            meta: {
              ...sectionMeta,
              lineRole: 'entry_heading',
            },
          });
          pushWrappedText(items, dateRange, 'italic', 10, {
            align: 'right',
            spacingAfter: 0,
            meta: {
              ...sectionMeta,
              lineRole: 'entry_heading',
            },
          });
        }
      } else if (heading) {
        pushWrappedText(items, heading, 'bold', 10.35, {
          spacingBefore: 0.8,
          spacingAfter: 0,
          meta: {
            ...sectionMeta,
            lineRole: 'entry_heading',
          },
        });
      } else if (dateRange) {
        pushWrappedText(items, dateRange, 'italic', 10, {
          align: 'right',
          spacingBefore: 0.8,
          spacingAfter: 0,
          meta: {
            ...sectionMeta,
            lineRole: 'entry_heading',
          },
        });
      }

      for (const line of entry.lines ?? []) {
        pushWrappedText(items, line, 'regular', 9.6, {
          spacingAfter: 0,
          meta: {
            ...sectionMeta,
            lineRole: 'entry_line',
          },
        });
      }

      for (const bullet of entry.bullets ?? []) {
        pushBulletParagraph(items, bullet, {
          size: 9.25,
          spacingAfter: 0,
          meta: sectionMeta,
        });
      }

      items.push({
        kind: 'text',
        text: '',
        font: 'regular',
        size: 8,
        indent: 0,
        align: 'left',
        color: BLACK,
        spacingBefore: 0,
        spacingAfter: 1.2,
        meta: {
          ...sectionMeta,
          lineRole: 'spacer',
        },
      });
    }
  });

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

function colorFillCommand(color: PdfColor): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`;
}

function colorStrokeCommand(color: PdfColor): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG`;
}

function bulletCirclePath(cx: number, cy: number, radius: number): string {
  const c = radius * 0.5522847498;
  const x0 = cx - radius;
  const x1 = cx - c;
  const x2 = cx + c;
  const x3 = cx + radius;
  const y0 = cy - radius;
  const y1 = cy - c;
  const y2 = cy + c;
  const y3 = cy + radius;

  return [
    `${x3.toFixed(2)} ${cy.toFixed(2)} m`,
    `${x3.toFixed(2)} ${y2.toFixed(2)} ${x2.toFixed(2)} ${y3.toFixed(2)} ${cx.toFixed(2)} ${y3.toFixed(2)} c`,
    `${x1.toFixed(2)} ${y3.toFixed(2)} ${x0.toFixed(2)} ${y2.toFixed(2)} ${x0.toFixed(2)} ${cy.toFixed(2)} c`,
    `${x0.toFixed(2)} ${y1.toFixed(2)} ${x1.toFixed(2)} ${y0.toFixed(2)} ${cx.toFixed(2)} ${y0.toFixed(2)} c`,
    `${x2.toFixed(2)} ${y0.toFixed(2)} ${x3.toFixed(2)} ${y1.toFixed(2)} ${x3.toFixed(2)} ${cy.toFixed(2)} c`,
    'f',
  ].join(' ');
}

function fontRef(font: PdfFont): string {
  switch (font) {
    case 'bold':
      return 'F2';
    case 'italic':
      return 'F3';
    default:
      return 'F1';
  }
}

function pageContentStream(items: LayoutItem[]): string {
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const commands: string[] = [];

  for (const item of items) {
    y -= item.spacingBefore;

    if (item.kind === 'rule') {
      const x1 = item.x1 ?? MARGIN_X;
      const x2 = item.x2 ?? PAGE_WIDTH - MARGIN_X;
      commands.push(`${colorStrokeCommand(item.color)} ${item.thickness.toFixed(2)} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
      y -= item.thickness;
      y -= item.spacingAfter;
      continue;
    }

    if (item.kind === 'sectionHeader') {
      const title = escapePdfText(item.title);
      const titleX = MARGIN_X;
      const titleWidth = estimateTextWidth(item.title, item.size, 'bold');
      const lineStart = Math.min(PAGE_WIDTH - MARGIN_X - 8, titleX + titleWidth + 10);
      const lineY = y + item.size * 0.16;
      commands.push(`${colorFillCommand(item.textColor)} BT /F2 ${item.size.toFixed(2)} Tf ${titleX.toFixed(2)} ${y.toFixed(2)} Td (${title}) Tj ET`);
      commands.push(`${colorStrokeCommand(item.lineColor)} ${item.thickness.toFixed(2)} w ${lineStart.toFixed(2)} ${lineY.toFixed(2)} m ${(PAGE_WIDTH - MARGIN_X).toFixed(2)} ${lineY.toFixed(2)} l S`);
      y -= lineHeight(item.size);
      y -= item.spacingAfter;
      continue;
    }

    if (item.kind === 'segments') {
      const width = item.segments.reduce((total, segment) => total + estimateTextWidth(segment.text, item.size, segment.font), 0);
      let x = item.align === 'center' ? Math.max(MARGIN_X, (PAGE_WIDTH - width) / 2) : MARGIN_X;
      for (const segment of item.segments) {
        commands.push(`${colorFillCommand(segment.color)} BT /${fontRef(segment.font)} ${item.size.toFixed(2)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(segment.text)}) Tj ET`);
        x += estimateTextWidth(segment.text, item.size, segment.font);
      }
      y -= lineHeight(item.size);
      y -= item.spacingAfter;
      continue;
    }

    if (item.kind === 'row') {
      commands.push(`${colorFillCommand(item.leftColor)} BT /${fontRef(item.leftFont)} ${item.size.toFixed(2)} Tf ${MARGIN_X.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(item.leftText)}) Tj ET`);

      if (item.rightText) {
        const rightWidth = estimateTextWidth(item.rightText, item.size, item.rightFont);
        const rightX = PAGE_WIDTH - MARGIN_X - rightWidth;
        commands.push(`${colorFillCommand(item.rightColor)} BT /${fontRef(item.rightFont)} ${item.size.toFixed(2)} Tf ${rightX.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(item.rightText)}) Tj ET`);
      }

      y -= lineHeight(item.size);
      y -= item.spacingAfter;
      continue;
    }

    if (item.text) {
      const x = resolveTextX(item.text, item.size, item.font, item.align, item.indent);
      commands.push(`${colorFillCommand(item.color)} BT /${fontRef(item.font)} ${item.size.toFixed(2)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(item.text)}) Tj ET`);

      if (item.marker?.kind === 'bullet') {
        const bulletCenterY = y + item.size * 0.26;
        commands.push(`${colorFillCommand(item.marker.color)} ${bulletCirclePath(item.marker.x, bulletCenterY, item.marker.radius)}`);
      }

      y -= lineHeight(item.size);
    }

    y -= item.spacingAfter;
  }

  return commands.join('\n');
}

function getItemMeta(item: LayoutItem): LayoutMeta | undefined {
  if (item.kind === 'rule') {
    return undefined;
  }

  return item.meta;
}

function isRenderableLineItem(item: LayoutItem) {
  return item.kind === 'sectionHeader' || item.kind === 'segments' || item.kind === 'row' || (item.kind === 'text' && item.text.length > 0);
}

function buildLayoutMetrics(pages: LayoutItem[][]): ResumeLayoutMetrics {
  const sectionMetrics = new Map<string, SectionLayoutMetric>();
  const sectionOrder: string[] = [];
  let totalRenderedLines = 0;
  let totalBullets = 0;
  let oneLineBullets = 0;
  let finalY = PAGE_HEIGHT - MARGIN_TOP;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageItems = pages[pageIndex]!;
    let currentY = PAGE_HEIGHT - MARGIN_TOP;

    for (const item of pageItems) {
      currentY -= item.spacingBefore;
      const drawHeight = itemHeight(item);
      const meta = getItemMeta(item);
      const isLine = isRenderableLineItem(item);

      if (isLine) {
        totalRenderedLines += 1;
      }

      if (meta?.sectionName && meta.sectionKind && isLine) {
        if (!sectionMetrics.has(meta.sectionName)) {
          sectionOrder.push(meta.sectionName);
          sectionMetrics.set(meta.sectionName, {
            sectionName: meta.sectionName,
            sectionKind: meta.sectionKind,
            renderedLines: 0,
            bulletCount: 0,
            bulletLineCount: 0,
            oneLineBulletCount: 0,
            averageBulletChars: 0,
          });
        }

        const metric = sectionMetrics.get(meta.sectionName)!;
        metric.renderedLines += 1;

        if (meta.lineRole === 'bullet') {
          metric.bulletLineCount += 1;
        }

        if (typeof meta.bulletLineCount === 'number' && meta.bulletLineCount > 0) {
          metric.bulletCount += 1;
          totalBullets += 1;
          if (meta.bulletLineCount === 1) {
            metric.oneLineBulletCount += 1;
            oneLineBullets += 1;
          }
          const nextTotalChars = metric.averageBulletChars * (metric.bulletCount - 1) + (meta.bulletCharCount ?? 0);
          metric.averageBulletChars = nextTotalChars / metric.bulletCount;
        }
      }

      currentY -= drawHeight;
      currentY -= item.spacingAfter;
    }

    if (pageIndex === pages.length - 1) {
      finalY = currentY;
    }
  }

  const resolvedSectionMetrics = sectionOrder.map((name) => {
    const metric = sectionMetrics.get(name)!;
    return {
      ...metric,
      averageBulletChars: Math.round(metric.averageBulletChars * 10) / 10,
    };
  });

  const usableHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const bottomWhitespacePts = Math.max(0, finalY - MARGIN_BOTTOM);

  return {
    pageHeightPts: PAGE_HEIGHT,
    pageWidthPts: PAGE_WIDTH,
    topMarginPts: MARGIN_TOP,
    bottomMarginPts: MARGIN_BOTTOM,
    pageCount: pages.length,
    overflowed: pages.length > 1,
    bottomWhitespacePts,
    bottomWhitespaceRatio: usableHeight > 0 ? bottomWhitespacePts / usableHeight : 0,
    totalRenderedLines,
    oneLineBulletRatio: totalBullets > 0 ? oneLineBullets / totalBullets : 0,
    sectionMetrics: resolvedSectionMetrics,
  };
}

function buildPdfFromPages(pages: LayoutItem[][]): Buffer {
  const objects: string[] = [];

  const catalogId = 1;
  const pagesId = 2;
  const regularFontId = 3;
  const boldFontId = 4;
  const italicFontId = 5;

  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(6 + index * 2);
    contentObjectIds.push(7 + index * 2);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
  objects[regularFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>';
  objects[boldFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>';
  objects[italicFontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>';

  pages.forEach((pageItems, index) => {
    const pageObjectId = pageObjectIds[index]!;
    const contentObjectId = contentObjectIds[index]!;
    const stream = pageContentStream(pageItems);
    const streamLength = Buffer.byteLength(stream, 'utf8');

    objects[pageObjectId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R /F3 ${italicFontId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
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

export function renderResumePdfDetailed(title: string, document: ResumeDocument): RenderResumePdfDetailedResult {
  const pages = paginate(buildLayout(title, document));
  return {
    pdfBuffer: buildPdfFromPages(pages),
    layoutMetrics: buildLayoutMetrics(pages),
  };
}

export function renderResumePdf(title: string, document: ResumeDocument): Buffer {
  return renderResumePdfDetailed(title, document).pdfBuffer;
}
