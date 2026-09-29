import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_RETURN_STORAGE_KEY,
  consumeTrustedV2ReturnTarget,
  currentTrustedV2ReturnTarget,
  normalizeTrustedV2ReturnTarget,
  storeTrustedV2ReturnTarget,
} from '@/components/auth/return-target';

const ID = '11111111-1111-4111-8111-111111111111';

describe('PILOT.B trusted V2 return target', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it.each([
    '/v2',
    '/v2/',
    `/v2?catalog=${ID}`,
  ])('accepts only canonical internal V2 target %s', (target) => {
    expect(normalizeTrustedV2ReturnTarget(target)).toBe(target);
  });

  it.each([
    'https://evil.example',
    'http://evil.example',
    '//evil.example',
    '\\evil',
    '/foo',
    '/v2/foo',
    '/v2?catalog=invalid',
    '/v2?catalog=11111111-1111-4111-8111-11111111111A',
    `/v2?catalog=${ID}&next=https://evil.example`,
    '/v2#https://evil.example',
    `/v2?catalog=${ID}#next`,
  ])('rejects unsafe return target %s', (target) => {
    expect(normalizeTrustedV2ReturnTarget(target)).toBeNull();
  });

  it('stores and consumes a valid target exactly once', () => {
    expect(storeTrustedV2ReturnTarget(`/v2?catalog=${ID}`)).toBe(true);
    expect(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBe(`/v2?catalog=${ID}`);
    expect(consumeTrustedV2ReturnTarget()).toBe(`/v2?catalog=${ID}`);
    expect(consumeTrustedV2ReturnTarget()).toBeNull();
  });

  it('clears an invalid stored target while consuming it', () => {
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, 'https://evil.example');
    expect(consumeTrustedV2ReturnTarget()).toBeNull();
    expect(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull();
  });

  it('derives only a hash-free trusted target from a browser location', () => {
    expect(currentTrustedV2ReturnTarget({
      pathname: '/v2',
      search: `?catalog=${ID}`,
      hash: '',
    } as Location)).toBe(`/v2?catalog=${ID}`);

    expect(currentTrustedV2ReturnTarget({
      pathname: '/v2',
      search: '',
      hash: '#redirect',
    } as Location)).toBeNull();
  });
});
