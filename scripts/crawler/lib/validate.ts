import * as cheerio from 'cheerio';
import type { NormalizedDocument, ValidationResult } from '../types';
import { extractControlCandidates, makeOutlineItem } from './derive';
import { readCachedBytes, type CachedFile } from './storage';

const MIN_BYTES = 10_000;
const MAX_BYTES = 500_000_000;

function headerMatches(document: NormalizedDocument, file: CachedFile) {
  const contentType = file.metadata.contentType?.toLowerCase() ?? '';
  if (!contentType) return true;
  if (document.mimeType === 'application/pdf') {
    return contentType.includes('application/pdf') || contentType.includes('octet-stream');
  }
  return contentType.includes('text/html') || contentType.includes('application/xhtml');
}

async function validateHtml(
  document: NormalizedDocument,
  file: CachedFile,
  bytes: Uint8Array,
): Promise<ValidationResult> {
  const text = new TextDecoder().decode(bytes);
  const $ = cheerio.load(text);
  const outline = $('h1,h2,h3,h4')
    .toArray()
    .map((element, order) =>
      makeOutlineItem(
        document.id,
        order,
        Number(element.tagName.slice(1)),
        $(element).text(),
      ),
    )
    .filter((item) => item.heading);
  const checks = {
    contentType: headerMatches(document, file),
    magic: /<html|<!doctype\s+html/i.test(text.slice(0, 2048)),
    size: bytes.byteLength > 500 && bytes.byteLength < MAX_BYTES,
    parse: Boolean($('html').length || $('body').length),
    pages: true,
    text: $('body').text().replace(/\s+/g, ' ').trim().length > 500,
    notEncrypted: true,
  };
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    valid: errors.length === 0,
    checks,
    errors,
    sha256: file.sha256,
    byteSize: file.size,
    pageCount: 1,
    textLayer: checks.text,
    outline,
    textSample: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000),
    controlCandidates: extractControlCandidates($('body').text()),
  };
}

export async function validateCachedDocument(
  document: NormalizedDocument,
  file: CachedFile,
): Promise<ValidationResult> {
  const bytes = await readCachedBytes(file);
  if (document.mimeType === 'text/html') {
    return validateHtml(document, file, bytes);
  }

  const checks: Record<string, boolean> = {
    contentType: headerMatches(document, file),
    magic: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    size: bytes.byteLength > MIN_BYTES && bytes.byteLength < MAX_BYTES,
    parse: false,
    pages: false,
    text: false,
    notEncrypted: true,
  };
  let pageCount: number | undefined;
  const outline = [] as ValidationResult['outline'];
  let textSample = '';
  let derivedText = '';
  if (!checks.contentType || !checks.magic || !checks.size) {
    const errors = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    return {
      valid: false,
      checks,
      errors,
      sha256: file.sha256,
      byteSize: file.size,
      pageCount,
      textLayer: false,
      outline,
      textSample,
      controlCandidates: [],
    };
  }
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: bytes.slice() });
    const pdf = await task.promise;
    checks.parse = true;
    pageCount = pdf.numPages;
    checks.pages = pdf.numPages >= 2;
    let textLength = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      textLength += pageText.length;
      if (textSample.length < 2000) textSample += ` ${pageText}`;
      if (derivedText.length < 100_000) derivedText += ` ${pageText}`;
      if (textLength > 500) break;
    }
    checks.text = textLength > 500;
    const rawOutline = await pdf.getOutline();
    let order = 0;
    const flatten = (
      items: Awaited<ReturnType<typeof pdf.getOutline>>,
      depth: number,
    ) => {
      for (const item of items ?? []) {
        outline.push(makeOutlineItem(document.id, order++, depth, item.title));
        flatten(item.items, depth + 1);
      }
    };
    flatten(rawOutline, 1);
    await task.destroy();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    checks.notEncrypted =
      name !== 'PasswordException' && !/password|encrypted/i.test(message);
  }

  // A missing text layer is review work with OCR disabled, not permission to OCR.
  const fatalChecks = ['contentType', 'magic', 'size', 'parse', 'pages', 'notEncrypted'];
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    valid: fatalChecks.every((name) => checks[name]),
    checks,
    errors,
    sha256: file.sha256,
    byteSize: file.size,
    pageCount,
    textLayer: checks.text,
    outline,
    textSample: textSample.replace(/\s+/g, ' ').trim().slice(0, 2000),
    controlCandidates: extractControlCandidates(derivedText),
  };
}
