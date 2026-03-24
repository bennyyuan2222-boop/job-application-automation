import type { ResumeDocument, ResumeEntry, ResumeSection, ResumeSectionKind } from '@job-ops/domain';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'section';
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
  const clean = line.replace(/^###\s*/, '').trim();
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

export function parseLegacyResumeMarkdown(
  contentMarkdown: string,
  meta?: ResumeDocument['meta'],
): ResumeDocument {
  const lines = contentMarkdown.replace(/\r\n/g, '\n').split('\n');
  const headerLines: string[] = [];
  const sections: ResumeSection[] = [];

  let currentSectionTitle: string | null = null;
  let currentEntries: ResumeEntry[] = [];
  let currentEntry: ResumeEntry | null = null;

  const flushEntry = () => {
    if (currentEntry) {
      const normalized: ResumeEntry = {
        ...currentEntry,
        bullets: currentEntry.bullets?.filter(Boolean) ?? [],
        lines: currentEntry.lines?.filter(Boolean) ?? [],
      };
      currentEntries.push(normalized);
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
      if (!trimmed.startsWith('# ') && !trimmed.toLowerCase().startsWith('source file:')) {
        headerLines.push(trimmed);
      }
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushSection();
      currentSectionTitle = trimmed.replace(/^##\s*/, '').trim();
      continue;
    }

    if (!currentSectionTitle) {
      continue;
    }

    const sectionKind = toKind(currentSectionTitle);

    if (trimmed.startsWith('### ')) {
      flushEntry();
      currentEntry = {
        id: slugify(trimmed),
        ...parseHeadingLine(trimmed),
        bullets: [],
        lines: [],
      };
      continue;
    }

    if (trimmed.startsWith('- ')) {
      const bullet = trimmed.replace(/^-\s*/, '').trim();
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

    if (!currentEntry.dateRange && (sectionKind === 'experience' || sectionKind === 'projects' || sectionKind === 'leadership')) {
      currentEntry.dateRange = trimmed;
    } else {
      currentEntry.lines ??= [];
      currentEntry.lines.push(trimmed);
    }
  }

  flushSection();

  return {
    meta: {
      ...meta,
      headerLines,
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
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sections) && record.sections.every(isResumeSection)) {
      return record as ResumeDocument;
    }
  }

  return parseLegacyResumeMarkdown(fallbackMarkdown ?? '');
}

export function renderResumeDocument(title: string, document: ResumeDocument): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
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
