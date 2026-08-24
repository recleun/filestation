import { describe, expect, it } from 'vitest';
import { isValidClientId, isValidId, newId } from './ids.js';

describe('isValidId', () => {
  it('accepts generated ids', () => {
    expect(isValidId(newId())).toBe(true);
  });

  it('rejects non-uuid strings', () => {
    expect(isValidId('hello')).toBe(false);
    expect(isValidId('../../etc/passwd')).toBe(false);
    expect(isValidId('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidId(123)).toBe(false);
    expect(isValidId(null)).toBe(false);
    expect(isValidId(undefined)).toBe(false);
  });
});

describe('isValidClientId', () => {
  it('accepts reasonable client identifiers', () => {
    expect(isValidClientId(newId())).toBe(true);
    expect(isValidClientId('phone-1')).toBe(true);
  });

  it('rejects empty or oversized identifiers', () => {
    expect(isValidClientId('')).toBe(false);
    expect(isValidClientId('   ')).toBe(false);
    expect(isValidClientId('x'.repeat(129))).toBe(false);
  });
});
