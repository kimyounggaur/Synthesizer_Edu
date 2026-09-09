import { sha1 } from './hash';
import type { OutlineItem, SectionKind } from '../types';

const CONTROL_PATTERNS = [
  /\[([A-Z0-9][A-Z0-9 /+-]{1,20})\]/g,
  /(?:press|hold|turn|move|tap)\s+(?:the\s+)?([A-Z][A-Z0-9 /+-]{1,24})\s+(?:button|knob|slider|switch|key)/gi,
  /([A-Z][A-Z0-9 /+-]{1,24})\s+(?:button|knob|slider|switch|key)/g,
];

export function classifySection(heading: string): SectionKind | undefined {
  if (/panel|controls?|appearance|front\s*panel|패널/i.test(heading)) {
    return 'panel_description';
  }
  if (/operation|playing|editing|using|조작|연주|편집/i.test(heading)) {
    return 'operation';
  }
  if (/troubleshoot|error|problem|문제|오류/i.test(heading)) {
    return 'troubleshooting';
  }
  if (/specification|specifications|사양/i.test(heading)) return 'spec';
  if (/appendix|midi implementation|부록/i.test(heading)) return 'appendix';
  return undefined;
}

export function extractControlCandidates(text: string): string[] {
  const names = new Set<string>();
  for (const pattern of CONTROL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[1]?.replace(/\s+/g, ' ').trim();
      if (value && value.length <= 30) names.add(value);
    }
  }
  return [...names].sort();
}

export function makeOutlineItem(
  documentId: string,
  order: number,
  depth: number,
  heading: string,
  pageStart?: number,
): OutlineItem {
  const clean = heading.replace(/\s+/g, ' ').trim().slice(0, 500);
  return {
    id: sha1(`${documentId}:${order}:${clean}`),
    depth,
    order,
    heading: clean,
    pageStart,
    sectionKind: classifySection(clean),
  };
}
