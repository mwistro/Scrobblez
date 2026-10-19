import { Response } from 'node-fetch';
import type fetch from 'node-fetch';

// Deliberately self-contained: this transport cannot make network requests.
export const demoRequest: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const params = init?.body instanceof URLSearchParams ? init.body : url.searchParams;
  switch (params.get('method')) {
    case 'auth.getToken':
      return new Response(JSON.stringify({ token: 'demo-token' }));
    case 'auth.getSession':
      return new Response(JSON.stringify({ session: { key: 'demo-session', name: 'demo-listener' } }));
    case 'track.scrobble': {
      const count = [...params.keys()].filter((key) => /^track\[\d+\]$/.test(key)).length;
      return new Response(JSON.stringify({
        scrobbles: { '@attr': { accepted: String(count), ignored: '0' }, scrobble: [] },
      }));
    }
    default:
      throw new Error('Unsupported request in offline demo.');
  }
};

const answers = ['', 'Midnight City - M83', '55', 'n'];
export async function demoAnswer(question: string): Promise<string> {
  const answer = answers.shift();
  if (answer === undefined) throw new Error('Offline demo has no more scripted answers.');
  console.log((question + answer).trimEnd());
  return answer;
}
