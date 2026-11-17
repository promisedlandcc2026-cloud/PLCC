export type HuddleProviderName = 'livekit' | 'daily';

export type HuddleUser = {
  name?: string | null;
};

export class LiveKitQuotaError extends Error {
  readonly code = 'livekit_quota';

  constructor() {
    super('LiveKit is not accepting new Ka Link connections right now.');
    this.name = 'LiveKitQuotaError';
  }
}
