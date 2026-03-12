# Sports Command Center

## What the local server does
The Node server at port `3000` now handles all of this:
1. NCAA API proxy (`/api/...`) to avoid CORS errors
2. Dashboard hosting (`/`)
3. Phone settings page (`/settings`)
4. Saved override storage (`server/settings.overrides.json`)

## Run steps (recommended)
1. Install Node.js LTS if needed.
2. In this project folder, run:
   - `npm run start:proxy`
3. Keep that terminal open.
4. Open dashboard:
   - `http://localhost:3000/`
5. Open settings page:
   - `http://localhost:3000/settings`

## Phone control on Raspberry Pi
When running on Pi:
1. Start server on Pi with `npm run start:proxy`
2. Find Pi IP (example `192.168.1.50`)
3. On phone (same Wi-Fi), open:
   - Dashboard: `http://192.168.1.50:3000/`
   - Settings: `http://192.168.1.50:3000/settings`
4. Save settings on phone
5. Refresh TV dashboard page to apply changes

## Notes about overrides
- Default values still come from `src/js/config.js`
- Phone changes are saved as overrides in `server/settings.overrides.json`
- Reset overrides from `/settings` to return to defaults

## Quick checks
- Health: `http://localhost:3000/health`
- Settings API: `http://localhost:3000/settings/config`
