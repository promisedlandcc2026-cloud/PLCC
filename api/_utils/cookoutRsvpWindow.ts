/** Public Cookout / fellowship RSVP close window — driven by Fellowship Event Kit config. */
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  getFellowshipEventConfig,
  isFellowshipRsvpClosed,
} from './fellowshipEventConfig.js';

const defaultCfg = getFellowshipEventConfig(DEFAULT_FELLOWSHIP_EVENT_ID);

export const COOKOUT_RSVP_CLOSE_AT = defaultCfg.rsvpCloseAt;
export const COOKOUT_RSVP_CLOSE_AT_MS = Date.parse(COOKOUT_RSVP_CLOSE_AT);

export const COOKOUT_RSVP_CLOSED_MESSAGE =
  'Online signups for the Fellowship Cookout are closed. If you still plan to come, please contact the church office.';

export function isCookoutRsvpClosed(nowMs: number = Date.now()): boolean {
  return isFellowshipRsvpClosed(defaultCfg, nowMs);
}

export function isEventRsvpClosed(eventId?: string | null, nowMs: number = Date.now()): boolean {
  return isFellowshipRsvpClosed(getFellowshipEventConfig(eventId), nowMs);
}

export function closedMessageForEvent(eventId?: string | null): string {
  const cfg = getFellowshipEventConfig(eventId);
  return `Online signups for ${cfg.name} are closed. If you still plan to come, please contact the church office.`;
}
