import crypto from 'node:crypto';

/** Last.fm requires ASCII key order and excludes format from the signature. */
export function signParams(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter((key) => key !== 'format' && key !== 'api_sig').sort();
  const input = keys.map((key) => `${key}${params[key]}`).join('') + secret;
  return crypto.createHash('md5').update(input).digest('hex');
}

/** A successful HTTP request does not imply that every scrobble was accepted. */
export function readScrobbleCounts(data: unknown, expected: number) {
  const attr = (data as { scrobbles?: { '@attr'?: Record<string, unknown> } } | null)
    ?.scrobbles?.['@attr'];
  const parse = (value: unknown): number => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) {
      throw new Error('Invalid scrobble counts in API response. Acceptance is unknown.');
    }
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid scrobble counts in API response. Acceptance is unknown.');
    }
    return count;
  };
  const accepted = parse(attr?.accepted);
  const ignored = parse(attr?.ignored);
  if (accepted + ignored !== expected) {
    throw new Error('Unexpected scrobble counts in API response. Acceptance is unknown.');
  }
  return { accepted, ignored };
}
