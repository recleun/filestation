function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 31 && code !== 127) {
      out += ch;
    }
  }
  return out;
}

export function sanitizeFileName(raw: string): string {
  const base = raw.replaceAll('\\', '/').split('/').at(-1) ?? '';
  const cleaned = stripControlChars(base).replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return 'untitled';
  }
  return cleaned.slice(0, 200);
}

export function sanitizeDisplayName(raw: string, maxLength = 64): string {
  const cleaned = stripControlChars(raw).replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, maxLength) : 'anonymous';
}

export function sanitizeMimeType(raw: string | undefined): string {
  if (raw !== undefined) {
    const mainType = raw.split(';')[0]?.trim() ?? '';
    if (/^[\w.+-]+\/[\w.+-]+$/.test(mainType)) {
      return mainType;
    }
  }
  return 'application/octet-stream';
}

export function contentDisposition(fileName: string): string {
  let fallback = '';
  for (const ch of fileName) {
    const code = ch.codePointAt(0) ?? 0;
    fallback += code >= 32 && code <= 126 ? ch : '_';
  }
  fallback = fallback.replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
