import { describe, expect, test } from '@jest/globals';

import { isNewerVersion, parseVersion } from './version';

describe('parseVersion', () => {
  test('accepts plain and v-prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v10.0.1')).toEqual([10, 0, 1]);
  });

  test('rejects other formats', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('v1.2.3-beta')).toBeNull();
    expect(parseVersion('build-12')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  test('compares numerically, not lexically', () => {
    expect(isNewerVersion('v1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('v2.0.0', '1.99.99')).toBe(true);
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true);
  });

  test('is false for equal or older versions', () => {
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('v1.0.0', '1.0.1')).toBe(false);
  });

  test('is false for invalid input', () => {
    expect(isNewerVersion('latest', '1.0.0')).toBe(false);
    expect(isNewerVersion('v1.0.1', 'unknown')).toBe(false);
  });
});
