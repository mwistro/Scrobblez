import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { readScrobbleCounts, signParams } from '../dist/protocol.js';

test('signatures use ASCII key ordering and exclude transport fields', () => {
  const params = { 'artist[2]': 'C', format: 'json', 'artist[10]': 'B', 'artist[0]': 'A', api_sig: 'old' };
  const expected = crypto.createHash('md5').update('artist[0]Aartist[10]Bartist[2]Csecret').digest('hex');
  assert.equal(signParams(params, 'secret'), expected);
  assert.equal(params.format, 'json');
});

test('accepted and ignored scrobbles stay distinct, including string API counts', () => {
  assert.deepEqual(readScrobbleCounts({ scrobbles: { '@attr': { accepted: '48', ignored: '2' } } }, 50),
    { accepted: 48, ignored: 2 });
  assert.deepEqual(readScrobbleCounts({ scrobbles: { '@attr': { accepted: 0, ignored: 5 } } }, 5),
    { accepted: 0, ignored: 5 });
});

test('missing, malformed and inconsistent counts cannot report success', () => {
  for (const data of [null, {}, { error: 9 },
    ...[{}, { accepted: '', ignored: 1 }, { accepted: -1, ignored: 2 },
      { accepted: 0.5, ignored: 0.5 }, { accepted: '1x', ignored: 0 },
      { accepted: true, ignored: 0 }, { accepted: 2, ignored: 0 }]
      .map((attr) => ({ scrobbles: { '@attr': attr } }))]) {
    assert.throws(() => readScrobbleCounts(data, 1), /counts/);
  }
});
