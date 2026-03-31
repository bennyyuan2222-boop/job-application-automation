import type { ResumeDocument, ResumeEntry, ResumeSection, ResumeSectionKind } from '@job-ops/domain';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'section';
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMarkdownArtifacts(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return /\*\*|__|`|\[[^\]]+\]\([^)]+\)/.test(value);
}

export function buildResumeArtifactFilename(title: string, extension = 'md'): string {
  return `${slugify(title)}.${extension.replace(/^\./, '')}`;
}

function toKind(title: string): ResumeSectionKind {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes('education')) return 'education';
  if (normalized.includes('skill')) return 'skills';
  if (normalized.includes('project')) return 'projects';
  if (normalized.includes('leadership') || normalized.includes('activity')) return 'leadership';
  if (normalized.includes('summary')) return 'summary';
  return 'experience';
}

function parseHeadingLine(line: string) {
  const clean = stripInlineMarkdown(line.replace(/^###\s*/, '').trim());
  const parts = clean.split(' — ');
  const main = parts[0] ?? clean;
  const location = parts.slice(1).join(' — ') || undefined;
  const [heading, subheading] = main.split(' - ').map((part) => part.trim());

  if (!subheading) {
    return {
      heading: clean,
      subheading: undefined,
      location,
    };
  }

  return {
    heading,
    subheading,
    location,
  };
}

function parseEducationHeadingLine(line: string): { heading: string; dateRange?: string } | null {
  const clean = stripInlineMarkdown(line);
  const match = clean.match(/^(.*?)\s+[—-]\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    heading: match[1]?.trim() || clean,
    dateRange: match[2]?.trim() || undefined,
  };
}

function finalizeSection(sectionTitle: string | null, rawEntries: ResumeEntry[]): ResumeSection | null {
  if (!sectionTitle) {
    return null;
  }

  return {
    id: slugify(sectionTitle),
    kind: toKind(sectionTitle),
    title: sectionTitle,
    entries: rawEntries,
  };
}

function normalizeEntry(entry: ResumeEntry): ResumeEntry {
  return {
    ...entry,
    heading: entry.heading ? stripInlineMarkdown(entry.heading) : undefined,
    subheading: entry.subheading ? stripInlineMarkdown(entry.subheading) : undefined,
    location: entry.location ? stripInlineMarkdown(entry.location) : undefined,
    dateRange: entry.dateRange ? stripInlineMarkdown(entry.dateRange) : undefined,
    bullets: entry.bullets?.filter(Boolean).map((bullet) => stripInlineMarkdown(bullet)) ?? [],
    lines: entry.lines?.filter(Boolean).map((line) => stripInlineMarkdown(line)) ?? [],
  };
}

function normalizeDocument(document: ResumeDocument): ResumeDocument {
  return {
    meta: {
      ...(document.meta?.displayName ? { displayName: stripInlineMarkdown(document.meta.displayName) } : {}),
      ...(document.meta?.lane ? { lane: document.meta.lane } : {}),
      ...(document.meta?.source ? { source: document.meta.source } : {}),
      ...(document.meta?.summary ? { summary: stripInlineMarkdown(document.meta.summary) } : {}),
      ...(document.meta?.keywords ? { keywords: document.meta.keywords.map((keyword) => stripInlineMarkdown(keyword)) } : {}),
      ...(document.meta?.headerLines
        ? { headerLines: document.meta.headerLines.map((line) => stripInlineMarkdown(line)).filter(Boolean) }
        : {}),
    },
    sections: document.sections.map((section) => ({
      ...section,
      title: stripInlineMarkdown(section.title),
      entries: section.entries.map(normalizeEntry),
    })),
  };
}

function documentHasMarkdownArtifacts(document: ResumeDocument): boolean {
  const metaStrings = [
    document.meta?.displayName,
    document.meta?.summary,
    ...(document.meta?.headerLines ?? []),
    ...(document.meta?.keywords ?? []),
  ];

  if (metaStrings.some((value) => hasMarkdownArtifacts(value))) {
    return true;
  }

  return document.sections.some((section) => {
    if (hasMarkdownArtifacts(section.title)) {
      return true;
    }

    return section.entries.some((entry) => {
      return [
        entry.heading,
        entry.subheading,
        entry.location,
        entry.dateRange,
        ...(entry.lines ?? []),
        ...(entry.bullets ?? []),
      ].some((value) => hasMarkdownArtifacts(value));
    });
  });
}

function mergeDocuments(primary: ResumeDocument, fallback: ResumeDocument): ResumeDocument {
  const preferred = normalizeDocument(primary);
  const backup = normalizeDocument(fallback);

  return {
    meta: {
      ...(backup.meta?.displayName && !preferred.meta?.displayName ? { displayName: backup.meta.displayName } : {}),
      ...(preferred.meta?.displayName ? { displayName: preferred.meta.displayName } : {}),
      ...(preferred.meta?.lane ? { lane: preferred.meta.lane } : backup.meta?.lane ? { lane: backup.meta.lane } : {}),
      ...(preferred.meta?.source ? { source: preferred.meta.source } : backup.meta?.source ? { source: backup.meta.source } : {}),
      ...(preferred.meta?.summary ? { summary: preferred.meta.summary } : backup.meta?.summary ? { summary: backup.meta.summary } : {}),
      ...(preferred.meta?.keywords?.length
        ? { keywords: preferred.meta.keywords }
        : backup.meta?.keywords?.length
          ? { keywords: backup.meta.keywords }
          : {}),
      ...(preferred.meta?.headerLines?.length
        ? { headerLines: preferred.meta.headerLines }
        : backup.meta?.headerLines?.length
          ? { headerLines: backup.meta.headerLines }
          : {}),
    },
    sections: preferred.sections.length > 0 ? preferred.sections : backup.sections,
  };
}

export function parseLegacyResumeMarkdown(
  contentMarkdown: string,
  meta?: ResumeDocument['meta'],
): ResumeDocument {
  const lines = contentMarkdown.replace(/\r\n/g, '\n').split('\n');
  const headerLines: string[] = [];
  const sections: ResumeSection[] = [];

  let displayName = meta?.displayName ? stripInlineMarkdown(meta.displayName) : undefined;
  let currentSectionTitle: string | null = null;
  let currentEntries: ResumeEntry[] = [];
  let currentEntry: ResumeEntry | null = null;

  const flushEntry = () => {
    if (currentEntry) {
      currentEntries.push(normalizeEntry(currentEntry));
      currentEntry = null;
    }
  };

  const flushSection = () => {
    flushEntry();
    const section = finalizeSection(currentSectionTitle, currentEntries);
    if (section) {
      sections.push(section);
    }
    currentSectionTitle = null;
    currentEntries = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (!currentSectionTitle && !trimmed.startsWith('## ')) {
      if (trimmed.startsWith('# ')) {
        displayName = stripInlineMarkdown(trimmed.replace(/^#\s*/, ''));
        continue;
      }

      if (!trimmed.toLowerCase().startsWith('source file:')) {
        headerLines.push(stripInlineMarkdown(trimmed));
      }
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushSection();
      currentSectionTitle = stripInlineMarkdown(trimmed.replace(/^##\s*/, '').trim());
      continue;
    }

    if (!currentSectionTitle) {
      continue;
    }

    const sectionKind = toKind(currentSectionTitle);

    if (trimmed.startsWith('### ')) {
      flushEntry();
      currentEntry = {
        id: slugify(stripInlineMarkdown(trimmed)),
        ...parseHeadingLine(trimmed),
        bullets: [],
        lines: [],
      };
      continue;
    }

    if (sectionKind === 'education') {
      const educationHeading = parseEducationHeadingLine(trimmed);
      if (educationHeading) {
        flushEntry();
        currentEntry = {
          id: slugify(educationHeading.heading),
          heading: educationHeading.heading,
          dateRange: educationHeading.dateRange,
          bullets: [],
          lines: [],
        };
        continue;
      }
    }

    if (trimmed.startsWith('- ')) {
      const bullet = stripInlineMarkdown(trimmed.replace(/^-\s*/, '').trim());
      if (!currentEntry) {
        currentEntry = {
          id: `${slugify(currentSectionTitle)}-entry-${currentEntries.length + 1}`,
          bullets: [],
          lines: [],
        };
      }
      currentEntry.bullets ??= [];
      currentEntry.bullets.push(bullet);
      continue;
    }

    if (!currentEntry) {
      currentEntry = {
        id: `${slugify(currentSectionTitle)}-entry-${currentEntries.length + 1}`,
        bullets: [],
        lines: [],
      };
    }

    const cleanLine = stripInlineMarkdown(trimmed);
    if (!currentEntry.dateRange && (sectionKind === 'experience' || sectionKind === 'projects' || sectionKind === 'leadership')) {
      currentEntry.dateRange = cleanLine;
    } else {
      currentEntry.lines ??= [];
      currentEntry.lines.push(cleanLine);
    }
  }

  flushSection();

  return {
    meta: {
      ...(displayName ? { displayName } : {}),
      ...(meta?.lane ? { lane: meta.lane } : {}),
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.summary ? { summary: stripInlineMarkdown(meta.summary) } : {}),
      ...(meta?.keywords ? { keywords: meta.keywords.map((keyword) => stripInlineMarkdown(keyword)) } : {}),
      ...(headerLines.length > 0 ? { headerLines } : {}),
    },
    sections,
  };
}

function isResumeEntry(value: unknown): value is ResumeEntry {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string';
}

function isResumeSection(value: unknown): value is ResumeSection {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string' && Array.isArray(record.entries) && record.entries.every(isResumeEntry);
}

export function coerceResumeDocument(value: unknown, fallbackMarkdown?: string): ResumeDocument {
  const fallbackDocument = fallbackMarkdown ? parseLegacyResumeMarkdown(fallbackMarkdown) : null;

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sections) && record.sections.every(isResumeSection)) {
      const structured = normalizeDocument(record as ResumeDocument);
      if (!fallbackDocument) {
        return structured;
      }

      const shouldPreferParsedFallback = !structured.meta?.displayName || documentHasMarkdownArtifacts(structured);
      return shouldPreferParsedFallback
        ? mergeDocuments(fallbackDocument, structured)
        : mergeDocuments(structured, fallbackDocument);
    }
  }

  return fallbackDocument ?? parseLegacyResumeMarkdown('');
}

export function renderResumeDocument(title: string, document: ResumeDocument): string {
  const lines: string[] = [];
  lines.push(`# ${document.meta?.displayName ?? title}`);
  lines.push('');

  for (const headerLine of document.meta?.headerLines ?? []) {
    lines.push(headerLine);
  }

  if ((document.meta?.headerLines ?? []).length > 0) {
    lines.push('');
  }

  if (document.meta?.summary) {
    lines.push('## SUMMARY');
    lines.push(document.meta.summary);
    lines.push('');
  }

  for (const section of document.sections) {
    lines.push(`## ${section.title.toUpperCase()}`);
    lines.push('');

    for (const entry of section.entries) {
      if (entry.heading) {
        let heading = `### ${entry.heading}`;
        if (entry.subheading) {
          heading += ` - ${entry.subheading}`;
        }
        if (entry.location) {
          heading += ` — ${entry.location}`;
        }
        lines.push(heading);
      }

      if (entry.dateRange) {
        lines.push(entry.dateRange);
      }

      for (const line of entry.lines ?? []) {
        lines.push(line);
      }

      for (const bullet of entry.bullets ?? []) {
        lines.push(`- ${bullet}`);
      }

      lines.push('');
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
