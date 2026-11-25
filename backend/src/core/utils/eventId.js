/**
 * The festival a request is for (the tenant, events.event_id).
 *
 * One name everywhere (API review A7): the X-Event-Id header, else `eventId` in the query (downloads, public
 * pages), else `eventId` in the body. Returns a positive integer or null. Never falls back to a fixed festival:
 * a request without one is refused (requireEventId, 400) instead of reading or changing festival 1 or 40 by
 * accident (API review A2).
 *
 * The old X-Edition-Id / X-Festival-Id headers and editionId / festivalId query names are no longer read. On
 * the public registration endpoints `festivalId` means the film_festivals id, a different number, which those
 * handlers read themselves.
 */

const EVENT_REQUIRED_MESSAGE = 'Choose a festival first.';

function getEventId(req) {
  const raw = req?.headers?.['x-event-id'] || req?.query?.eventId
    || (req?.body && typeof req.body === 'object' ? req.body.eventId : undefined);
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { getEventId, EVENT_REQUIRED_MESSAGE };
