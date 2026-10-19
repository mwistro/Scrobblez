import { Response } from 'node-fetch';

// Exercise CLI failure reporting using the offline transport only.
const originalJson = Response.prototype.json;
Response.prototype.json = async function () {
  const data = await originalJson.call(this);
  if (!data.scrobbles) return data;
  switch (process.env.SCROBBLEZ_TEST_SCENARIO) {
    case 'ignored':
      data.scrobbles['@attr'].accepted = String(Number(data.scrobbles['@attr'].accepted) - 1);
      data.scrobbles['@attr'].ignored = '1';
      return data;
    case 'error':
      return { error: 9, message: 'Simulated invalid session' };
    case 'malformed':
      return { scrobbles: {} };
    default:
      return data;
  }
};
