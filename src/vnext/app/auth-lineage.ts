export const ANONYMOUS_AUTH_IDENTITY = 'anonymous';

export interface AuthLineageState {
  readonly identity: string;
  readonly epoch: number;
}

export function createAuthLineageState(identity: string): AuthLineageState {
  return { identity, epoch: 0 };
}

export function advanceAuthLineage(
  current: AuthLineageState,
  nextIdentity: string
): AuthLineageState {
  if (nextIdentity === current.identity) return current;
  return { identity: nextIdentity, epoch: current.epoch + 1 };
}

export function authLineageValue(state: AuthLineageState): string {
  return `${state.identity}:${state.epoch}`;
}
