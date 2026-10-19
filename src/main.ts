import realFetch from 'node-fetch';
import open from 'open';
import readline from 'readline';
import dotenv from 'dotenv';
import type {
  GetSessionResponse,
  GetTokenResponse,
  ScrobbleResponse,
  ErrorResponse,
} from './types.js';
import { signParams, readScrobbleCounts } from './protocol.js';
import { demoRequest, demoAnswer } from './demo.js';

// Load environment variables
const isDemo = process.argv.includes('--demo');
const fetch = isDemo ? demoRequest : realFetch;
if (!isDemo) dotenv.config();

// Load interfaces
type LastFmResponse =
  | GetTokenResponse
  | GetSessionResponse
  | ScrobbleResponse
  | ErrorResponse;

// Get API credentials from .env
const apiKey = isDemo ? 'demo-api-key' : process.env.LASTFM_API_KEY!;
const shared_secret = isDemo ? 'demo-secret' : process.env.LASTFM_SHARED_SECRET!;

// Check if environment variables are set
if (!apiKey || !shared_secret) {
  console.error(
    '❌ Error: API credentials not found in environment variables.'
  );
  console.error(
    'Please create a .env file with LASTFM_API_KEY and LASTFM_SHARED_SECRET.'
  );
  process.exit(1);
}

// CLI input & output config
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Function to ask the user in the CLI
function askQuestion(
  rl: readline.Interface,
  question: string
): Promise<string> {
  if (isDemo) return demoAnswer(question);
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to check errors
function hasError(data: LastFmResponse): data is ErrorResponse {
  return 'error' in data && typeof data.error === 'number';
}

// Function to get the token
async function getRequestToken(
  apiKey: string,
  secret: string
): Promise<string> {
  const params = {
    method: 'auth.getToken',
    api_key: apiKey,
    format: 'json',
  };

  const api_sig = signParams(params, secret);
  const urlParams = new URLSearchParams({ ...params, api_sig });

  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${urlParams}`);
    const data = (await res.json()) as GetTokenResponse;

    if (hasError(data)) {
      throw new Error(
        `Last.fm API error: ${data.message || 'Unknown error'} (code: ${
          data.error
        })`
      );
    }

    if (!data.token) {
      throw new Error('Token not found in API response');
    }

    return data.token;
  } catch (error) {
    console.error('❌ Error obtaining request token:', error);
    throw new Error(
      'Failed to obtain authentication token. Please check your internet connection.'
    );
  }
}

// Function to get the session
async function getSession(
  apiKey: string,
  secret: string,
  token: string
): Promise<string> {
  const params = {
    method: 'auth.getSession',
    api_key: apiKey,
    token: token,
    format: 'json',
  };

  const api_sig = signParams(params, secret);
  const urlParams = new URLSearchParams({ ...params, api_sig });

  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${urlParams}`);
    const data = (await res.json()) as GetSessionResponse;

    if (hasError(data)) {
      throw new Error(
        `Last.fm API error: ${data.message || 'Unknown error'} (code: ${
          data.error
        })`
      );
    }

    if (!data.session || !data.session.key) {
      throw new Error(
        'Session key not found in API response. Please make sure you authorized the app in the browser.'
      );
    }

    console.log('✅ Authentication successful!');
    return data.session.key;
  } catch (error) {
    console.error('❌ Error obtaining session:', error);
    throw new Error(
      'Failed to obtain session. Please make sure to authorize the app in the browser before continuing.'
    );
  }
}

// Function to scrobble
async function scrobbleTracks(
  apiKey: string,
  secret: string,
  sessionKey: string,
  artist: string,
  track: string,
  totalScrobbles: number
) {
  const batchSize = 50;
  let completedScrobbles = 0;
  let acceptedScrobbles = 0;
  let ignoredScrobbles = 0;

  console.log(`\n🎵 Starting scrobble of "${track}" by "${artist}"`);
  console.log(`📊 Total scrobbles to perform: ${totalScrobbles}\n`);

  for (let i = 0; i < totalScrobbles; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, totalScrobbles - i);
    const bodyParams: Record<string, string> = {
      method: 'track.scrobble',
      api_key: apiKey,
      sk: sessionKey,
      format: 'json',
    };

    for (let j = 0; j < currentBatchSize; j++) {
      const index = j;
      const timestamp = Math.floor(Date.now() / 1000 - (i + j + 1) * 300);

      bodyParams[`artist[${index}]`] = artist;
      bodyParams[`track[${index}]`] = track;
      bodyParams[`timestamp[${index}]`] = timestamp.toString();
    }

    const api_sig = signParams(bodyParams, secret);
    const body = new URLSearchParams({ ...bodyParams, api_sig });

    try {
      const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const data = (await res.json()) as ScrobbleResponse;

      if (hasError(data)) {
        throw new Error(
          `Last.fm API error: ${data.message || 'Unknown error'} (code: ${
            data.error
          })`
        );
      }

      const counts = readScrobbleCounts(data, currentBatchSize);
      acceptedScrobbles += counts.accepted;
      ignoredScrobbles += counts.ignored;
      completedScrobbles += currentBatchSize;

      const progressPercent = Math.floor(
        (completedScrobbles / totalScrobbles) * 100
      );
      console.log(
        `🎧 Progress: ${completedScrobbles}/${totalScrobbles} processed (${progressPercent}%) | accepted: ${acceptedScrobbles}, ignored: ${ignoredScrobbles}`
      );
    } catch (error) {
      throw new Error(`Batch stopped after ${completedScrobbles} confirmed responses (${acceptedScrobbles} accepted, ${ignoredScrobbles} ignored). Check your Last.fm history before retrying. ${error}`);
    }
  }

  console.log(`\nCompleted: ${acceptedScrobbles} accepted, ${ignoredScrobbles} ignored.`);
  if (ignoredScrobbles > 0) process.exitCode = 1;
}

// Main func
async function main() {
  const rl = createReadlineInterface();
  let continueScrobbling = true;

  try {
    if (isDemo) console.log('SCROBBLEZ / OFFLINE DEMO\nSimulated responses. No network requests, browser or account changes.\n');
    console.log('🔑 Starting the authentication process...');
    const token = await getRequestToken(apiKey, shared_secret);

    const authUrlLink = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
    if (isDemo) {
      console.log('Browser authorization simulated for this demo.');
    } else {
      console.log('Open this URL in your browser and authorize the app:\n', authUrlLink);
      await open(authUrlLink);
      console.log('Please authorize the application in the browser that was opened.');
    }

    await askQuestion(
      rl,
      '\n⚠️  After authorizing in the browser, press ENTER to continue: '
    );

    console.log('\n🔄 Getting the session key...');
    const sessionKey = await getSession(apiKey, shared_secret, token);

    while (continueScrobbling) {
      const musicInfo = await askQuestion(rl, '\n📝 Enter the song name: ');

      let track, artist;

      const separator = musicInfo.indexOf(' - ');
      if (separator >= 0) {
        track = musicInfo.slice(0, separator).trim();
        artist = musicInfo.slice(separator + 3).trim();
      } else {
        track = musicInfo.trim();
        artist = (await askQuestion(rl, 'Artist name: ')).trim();
      }
      if (!track || !artist) {
        console.log('Both track and artist are required. Please try again.');
        continue;
      }

      const scrobblesInput = (await askQuestion(rl, 'Number of scrobbles: ')).trim();
      const totalScrobbles = Number(scrobblesInput);
      if (!/^\d+$/.test(scrobblesInput) || !Number.isSafeInteger(totalScrobbles) || totalScrobbles <= 0) {
        console.log('Enter a positive whole number. No scrobbles were sent.');
        continue;
      }

      await scrobbleTracks(
        apiKey,
        shared_secret,
        sessionKey,
        artist,
        track,
        totalScrobbles
      );

      const continueAnswer = await askQuestion(
        rl,
        '\n🔄 Would you like to scrobble more? (y/n): '
      );
      continueScrobbling =
        continueAnswer.toLowerCase() === 'y' ||
        continueAnswer.toLowerCase() === 'yes';
    }

    console.log('\n👋 Thank you for using Scrobblez! See you next time!');
  } catch (error) {
    process.exitCode = 1;
    console.error(`\n❌ An error occurred: ${error}`);
    console.log(
      '\n💡 If the error is related to authentication, try running the program again and make sure to authorize the app in your browser before pressing enter.'
    );
  } finally {
    rl.close();
  }
}

main();
