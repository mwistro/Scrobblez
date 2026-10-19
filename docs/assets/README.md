# Showcase assets

- `cli-demo.png`: a browser-rendered terminal preview of the CLI's actual offline demo output.
- `demo.txt`: the unedited stdout captured from `node dist/main.js --demo` after building.
- `demo.html`: the standalone terminal presentation used for the PNG. Open it locally to inspect the full preview.

All Last.fm responses, credentials and interactive answers in this run are fixtures. No live API requests or account changes were made. The PNG is a styled presentation of the transcript, not a screenshot of a live Last.fm session.

To reproduce the CLI output, run `npm ci` followed by `npm run demo` from the repository root. The existing root `banner.png` is reused unchanged.
