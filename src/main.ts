import crypto from 'crypto';
import fetch from 'node-fetch';
import open from 'open';
import readline from 'readline';
import dotenv from 'dotenv';
import {
  GetSessionResponse,
  GetTokenResponse,
  ScrobbleResponse,
  ErrorResponse,
} from './types';

// Load environment variables
dotenv.config();

// Load interfaces
type LastFmResponse =
  | GetTokenResponse
  | GetSessionResponse
  | ScrobbleResponse
  | ErrorResponse;

// Get API credentials from .env
const apiKey = process.env.LASTFM_API_KEY!;
const shared_secret = process.env.LASTFM_SHARED_SECRET!;
console.log('APIKEY ', apiKey)
console.log('SHARED ', shared_secret)

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
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to build the api_sign
function signParams(params: Record<string, string>, secret: string): string {
  const paramsToSign = { ...params };
  delete paramsToSign.format;

  const sortedKeys = Object.keys(paramsToSign).sort();
  const baseString =
    sortedKeys.map((key) => `${key}${paramsToSign[key]}`).join('') + secret;
  const hashedString = crypto
    .createHash('md5')
    .update(baseString)
    .digest('hex');
  return hashedString;
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
      console.error(
        'API response (getSession):',
        JSON.stringify(data, null, 2)
      );
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

      completedScrobbles += currentBatchSize;

      const progressPercent = Math.floor(
        (completedScrobbles / totalScrobbles) * 100
      );
      console.log(
        `🎧 Progress: ${completedScrobbles}/${totalScrobbles} scrobbles (${progressPercent}%)`
      );
    } catch (error) {
      console.error(`❌ An error ocurred while scrobbling: ${error}`);
    }
  }

  console.log(
    `\n✅ Scrobble completed successfully! ${totalScrobbles} scrobbles of "${track}" by "${artist}" have been logged.`
  );
}

// Main func
async function main() {
  const rl = createReadlineInterface();
  let continueScrobbling = true;

  try {
    console.log('🔑Starting the authentication process...');
    const token = await getRequestToken(apiKey, shared_secret);

    const authUrlLink = `http://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
    console.log(
      '🔗Open this URL in your browser and authorize the app:\n',
      authUrlLink
    );
    await open(authUrlLink);

    console.log('\n⏳ Waiting for authorization...');
    console.log(
      'Please authorize the application in the browser that was opened.'
    );

    await askQuestion(
      rl,
      '\n⚠️  After authorizing in the browser, press ENTER to continue: '
    );

    console.log('\n🔄 Getting the session key...');
    const sessionKey = await getSession(apiKey, shared_secret, token);

    while (continueScrobbling) {
      const musicInfo = await askQuestion(rl, '\n📝 Enter the song name: ');

      let track, artist;

      if (musicInfo.includes(' - ')) {
        [track, artist] = musicInfo.split(' - ').map((s) => s.trim());
      } else if (musicInfo.includes('-')) {
        [track, artist] = musicInfo.split('-').map((s) => s.trim());
      } else {
        track = musicInfo;
        artist = await askQuestion(rl, '📝 Enter the artist name: ');
      }

      const scrobblesInput = await askQuestion(
        rl,
        '📊 How many scrobbles would you like? (Recommended daily maximum: 2000):'
      );
      let totalScrobbles = parseInt(scrobblesInput, 10) || 1;

      if (isNaN(totalScrobbles) || totalScrobbles <= 0) {
        console.log('❌ Invalid number. Using 1 as default.');
        totalScrobbles = 1;
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
    console.error(`\n❌ An error occurred: ${error}`);
    console.log(
      '\n💡 If the error is related to authentication, try running the program again and make sure to authorize the app in your browser before pressing enter.'
    );
  } finally {
    rl.close();
  }
}

main();
