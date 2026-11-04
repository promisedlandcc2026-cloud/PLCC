import DailyIframe, { type DailyCall, type DailyParticipant } from '@daily-co/daily-js';

export type DailyJoinCredentials = {
  token: string;
  url: string;
};

export type DailyRosterPerson = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  cameraOn: boolean;
  videoTrack: MediaStreamTrack | null;
};

type DailyHandlers = {
  onRoster: (people: DailyRosterPerson[]) => void;
  onConnected: () => void;
  onReconnecting: () => void;
  onLeft: () => void;
  onError: (message: string) => void;
  onAppMessage?: (data: unknown, fromId: string) => void;
};

function peopleFromCall(call: DailyCall, speakingId: string): DailyRosterPerson[] {
  const participants = call.participants() as Record<string, DailyParticipant>;
  return Object.values(participants).map((person) => {
    const identity = String(person.session_id || person.user_id || '');
    const video = person.tracks?.video;
    const cameraOn = video?.state === 'playable' || video?.state === 'sendable';
    return {
      identity,
      name: String(person.user_name || 'Member'),
      isLocal: Boolean(person.local),
      isSpeaking: Boolean(speakingId) && speakingId === identity,
      isMuted: person.audio === false,
      cameraOn,
      videoTrack: video?.persistentTrack || video?.track || null,
    };
  });
}

/** In-page Daily call. Video stays off until the member turns it on. */
export async function joinDailyAudio(
  credentials: DailyJoinCredentials,
  handlers: DailyHandlers
): Promise<DailyCall> {
  const call = DailyIframe.createCallObject({
    subscribeToTracksAutomatically: true,
    audioSource: true,
    startVideoOff: true,
  });
  let speakingId = '';
  const publishRoster = () => handlers.onRoster(peopleFromCall(call, speakingId));

  call.on('joined-meeting', () => {
    handlers.onConnected();
    publishRoster();
  });
  call.on('participant-joined', publishRoster);
  call.on('participant-updated', publishRoster);
  call.on('participant-left', publishRoster);
  call.on('active-speaker-change', (event: { activeSpeaker?: { peerId?: string } } | undefined) => {
    speakingId = String(event?.activeSpeaker?.peerId || '');
    publishRoster();
  });
  call.on('network-connection', (event: { event?: string } | undefined) => {
    const name = String(event?.event || '');
    if (name === 'interrupted' || name === 'reconnecting') handlers.onReconnecting();
    if (name === 'connected') handlers.onConnected();
  });
  call.on('app-message', (event: { data?: unknown; fromId?: string } | undefined) => {
    handlers.onAppMessage?.(event?.data, String(event?.fromId || ''));
  });
  call.on('left-meeting', () => handlers.onLeft());
  call.on('error', (event: { errorMsg?: string } | undefined) => {
    handlers.onError(event?.errorMsg || 'The backup audio line disconnected.');
  });

  await call.join({
    url: credentials.url,
    token: credentials.token,
    startVideoOff: true,
  });
  try {
    call.setLocalVideo(false);
  } catch {
    /* camera stays off */
  }
  await call.setLocalAudio(false);
  publishRoster();
  return call;
}

export async function leaveDailyAudio(call: DailyCall | null | undefined): Promise<void> {
  if (!call) return;
  try {
    await call.leave();
  } catch {
    /* already gone */
  }
  try {
    call.destroy();
  } catch {
    /* already destroyed */
  }
}
