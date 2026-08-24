import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  sanitizeDisplayName,
  sanitizeFileName,
  sanitizeMimeType,
} from './sanitize.js';

describe('sanitizeFileName', () => {
  it('strips path components', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('/absolute/path/photo.jpg')).toBe('photo.jpg');
    expect(sanitizeFileName('C:\\Users\\bob\\cv.pdf')).toBe('cv.pdf');
  });

  it('strips control characters and collapses whitespace', () => {
    const hostile = `bad${String.fromCharCode(0)}${String.fromCharCode(31)}name.txt`;
    expect(sanitizeFileName(hostile)).toBe('badname.txt');
    expect(sanitizeFileName('  spaced   out.txt  ')).toBe('spaced out.txt');
  });

  it('falls back for empty or dot-only names', () => {
    expect(sanitizeFileName('')).toBe('untitled');
    expect(sanitizeFileName('///')).toBe('untitled');
    expect(sanitizeFileName('..')).toBe('untitled');
  });

  it('truncates very long names', () => {
    expect(sanitizeFileName('a'.repeat(500))).toHaveLength(200);
  });
});

describe('sanitizeDisplayName', () => {
  it('keeps ordinary names intact', () => {
    expect(sanitizeDisplayName('Alice')).toBe('Alice');
    expect(sanitizeDisplayName('  bob   q ')).toBe('bob q');
  });

  it('falls back to anonymous for empty input', () => {
    expect(sanitizeDisplayName('')).toBe('anonymous');
    expect(sanitizeDisplayName('   ')).toBe('anonymous');
  });

  it('truncates to the maximum length', () => {
    expect(sanitizeDisplayName('n'.repeat(100))).toHaveLength(64);
  });
});

describe('sanitizeMimeType', () => {
  it('keeps well-formed types and drops parameters', () => {
    expect(sanitizeMimeType('image/png')).toBe('image/png');
    expect(sanitizeMimeType('text/plain; charset=utf-8')).toBe('text/plain');
  });

  it('falls back for malformed input', () => {
    expect(sanitizeMimeType(undefined)).toBe('application/octet-stream');
    expect(sanitizeMimeType('garbage')).toBe('application/octet-stream');
    expect(sanitizeMimeType('../../../etc/passwd')).toBe('application/octet-stream');
  });
});

describe('contentDisposition', () => {
  it('quotes plain ascii names directly', () => {
    const header = contentDisposition('report.pdf');
    expect(header).toContain('filename="report.pdf"');
    expect(header).toContain(`filename*=UTF-8''report.pdf`);
  });

  it('escapes quotes and backslashes in the ascii fallback', () => {
    const header = contentDisposition('we"ird\\na"me.txt');
    const asciiPart = header.split(';')[1]?.trim() ?? '';
    expect(asciiPart.startsWith('filename="')).toBe(true);
    expect(asciiPart.endsWith('"')).toBe(true);
    expect(asciiPart).not.toContain('\\"');
  });

  it('percent-encodes non-ascii names per RFC 5987', () => {
    const header = contentDisposition('café.png');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('café.png')}`);
    expect(header).toContain('filename="caf_.png"');
  });
});
