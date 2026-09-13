import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_AUTH_IDENTITY,
  advanceAuthLineage,
  authLineageValue,
  createAuthLineageState,
} from '@/vnext/app/auth-lineage';

describe('W3.C auth lineage policy', () => {
  it('AUTH-1 repeated SIGNED_IN for the same effective user preserves lineage', () => {
    const initial = createAuthLineageState('user-a');
    const repeatedSignedIn = advanceAuthLineage(initial, 'user-a');

    expect(repeatedSignedIn).toBe(initial);
    expect(authLineageValue(repeatedSignedIn)).toBe('user-a:0');
  });

  it('AUTH-3 TOKEN_REFRESHED for the same effective user preserves lineage', () => {
    const initial = createAuthLineageState('user-a');
    const tokenRefreshed = advanceAuthLineage(initial, 'user-a');

    expect(tokenRefreshed).toBe(initial);
    expect(authLineageValue(tokenRefreshed)).toBe('user-a:0');
  });

  it('AUTH-4 SIGNED_OUT changes A to anonymous and advances lineage', () => {
    const initial = createAuthLineageState('user-a');
    const signedOut = advanceAuthLineage(initial, ANONYMOUS_AUTH_IDENTITY);

    expect(authLineageValue(signedOut)).toBe('anonymous:1');
  });

  it('AUTH-5 SIGNED_IN changes anonymous to A and advances lineage', () => {
    const initial = createAuthLineageState(ANONYMOUS_AUTH_IDENTITY);
    const signedIn = advanceAuthLineage(initial, 'user-a');

    expect(authLineageValue(signedIn)).toBe('user-a:1');
  });

  it('AUTH-6 direct A to B principal transition advances lineage', () => {
    const initial = createAuthLineageState('user-a');
    const userB = advanceAuthLineage(initial, 'user-b');

    expect(authLineageValue(userB)).toBe('user-b:1');
  });

  it('AUTH-7 sign-out then same-user sign-in yields a new lineage from original A', () => {
    const initial = createAuthLineageState('user-a');
    const signedOut = advanceAuthLineage(initial, ANONYMOUS_AUTH_IDENTITY);
    const signedInAgain = advanceAuthLineage(signedOut, 'user-a');

    expect(authLineageValue(initial)).toBe('user-a:0');
    expect(authLineageValue(signedInAgain)).toBe('user-a:2');
  });
});
