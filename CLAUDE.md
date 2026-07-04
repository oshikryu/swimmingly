# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swimmingly is a Next.js web application that provides real-time swim condition assessments for Aquatic Park in San Francisco Bay. It aggregates data from multiple sources (NOAA, SF Open Data, CDEC, etc.) and calculates a comprehensive swim score based on water quality, tides, currents, waves, weather, and upstream dam releases.

## Development Commands

```bash
# Development
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build (dynamic with API routes)
npm start            # Start production server
npm run lint         # Run ESLint

# Static Export (GitHub Pages)
npm run generate-static-data  # Fetch data and write to public/static-data.json
npm run build:static          # Build static version with pre-fetched data
npx serve out                 # Test static build locally

# Type checking
npx tsc --noEmit     # Check TypeScript without emitting files
```

## Architecture

### Data Flow

The application follows this data pipeline:

1. **API Clients** (`src/lib/api/`) fetch data from external sources
2. **API Routes** (`src/app/api/`) orchestrate data fetching and aggregation
3. **Swim Score Algorithm** (`src/lib/algorithms/swim-score.ts`) calculates conditions
4. **React Components** (`src/components/`) display data to users
5. **Client-side Caching** (`src/hooks/`) reduces API calls via localStorage

### Main API Orchestration

The `/api/conditions` endpoint (`src/app/api/conditions/route.ts`) is the central orchestrator:

- Fetches data from multiple sources in parallel using `Promise.allSettled()`
- Implements fallback strategies for missing data sources (e.g., OpenWaterLog → NOAA for waves)
- Gracefully handles failures with fallback values
- Requires tide data (critical), but other data sources are optional
- Returns comprehensive `CurrentConditions` object with all environmental factors

### Swim Score Algorithm

Located in `src/lib/algorithms/swim-score.ts`, this is the core scoring logic:

**Weighted Factors** (must sum to 100%):
- Water Quality: 30% (highest priority - safety first)
- Tide & Current: 25%
- Waves: 20%
- Weather: 15%
- Dam Releases: 10%

**Score Ranges**:
- 80-100: Excellent
- 60-79: Good
- 40-59: Fair (experienced swimmers)
- 20-39: Poor (not recommended)
- 0-19: Dangerous (do not swim)

**Dam Release Time-Lag Modeling**: Uses 48-hour historical flow data with weighted averaging (60% last 24h, 40% older 24h) to account for the 24-48 hour transit time from upstream dams to SF Bay.

All thresholds are configured in `src/config/thresholds.ts` and can be adjusted based on local conditions or swimmer experience levels.

### Data Sources & API Clients

Each external data source has a dedicated client in `src/lib/api/`:

- **`noaa.ts`**: Tide predictions, weather forecasts, wave buoy data, current measurements
- **`beachwatch.ts`**: SF Beach Water Quality Monitoring (primary water quality source)
  - Locations: BAY#211_SL (Aquatic Park) and BAY#210.1_SL (Hyde Street Pier)
  - Uses most recent data from either location
- **`cdec.ts`**: Dam release data from California Data Exchange Center
  - Monitors: Shasta, Oroville, Folsom, Pardee, Camanche dams
  - Fetches 48 hours of hourly flow data for time-lag modeling
- **`open-meteo.ts`**: Weather backup (wind speed, gusts, temperature)
- **`openwaterlog.ts`**: Primary wave data source, falls back to NOAA buoy if unavailable

Station IDs and coordinates are centralized in `src/config/aquatic-park.ts`.

### Client-side Caching Strategy

Custom React hooks in `src/hooks/` implement localStorage-based caching:

- **`useConditionsCache.ts`**: Caches full conditions data (5-minute TTL)

This reduces API calls and improves UX by showing cached data while fetching updates.

### Configuration Files

- **`src/config/aquatic-park.ts`**: Location coordinates, NOAA station IDs, buoy IDs
- **`src/config/thresholds.ts`**: Safety thresholds and score weights

## Key Implementation Details

### Handling Missing Data

The conditions API uses fallback strategies throughout:

```typescript
// Example: Calculate current from tide if actual current data unavailable
const currentWithFallback = currentData || calculateCurrentFromTide(tideData, now);
```

The swim score algorithm handles `null`/`undefined` values gracefully:
- Missing data results in moderate scores (not excellent, not dangerous)
- Issues are tracked in each factor's `issues` array for transparency

### Wave Data Fallback Strategy

Wave data uses a two-tier fallback:
1. Primary: OpenWaterLog (more accurate for Aquatic Park)
2. Fallback: NOAA Buoy 46237 (offshore San Francisco)

Implementation in `/api/conditions/route.ts`:

```typescript
const fetchWaveDataWithFallback = async () => {
  try {
    const owlData = await fetchOpenWaterLogWaveData();
    if (owlData) return owlData;
  } catch (error) {
    console.warn('OpenWaterLog failed, falling back to NOAA buoy');
  }
  return fetchWaveData(); // NOAA fallback
};
```

### Hybrid Wind Data Strategy

Prefers Open-Meteo wind data (more accurate) combined with NOAA temperature/conditions:

```typescript
// Use Open-Meteo for wind, NOAA for temperature and conditions
if (weatherData && windDataResult) {
  weatherWithFallback.windSpeedMph = windDataResult.windSpeedMph;
  weatherWithFallback.source = 'NOAA-NWS+open-meteo-wind';
}
```

### TypeScript Path Aliases

The project uses `@/` as an alias for `src/`:

```typescript
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import { TIDE_STATION_ID } from '@/config/aquatic-park';
```

## Environment Variables

Required for full functionality (see `.env.example`):

```env
REDIS_URL="redis://localhost:6379"

# Required for map features (get free keys from mapbox.com)
MAPBOX_PUBLIC_KEY="pk.your_key_here"
MAPBOX_SECRET_KEY="sk.your_key_here"
```

**Note**: The app is fully functional without any environment variables for basic development. All data APIs are public and require no authentication.

## Testing API Endpoints

```bash
# Current conditions
curl "http://localhost:3000/api/conditions"

# Tide predictions for next 48 hours
curl "http://localhost:3000/api/tides?hours=48"

# Weather forecast
curl "http://localhost:3000/api/weather"

# Wave data
curl "http://localhost:3000/api/waves"
```

## Common Patterns

### Adding a New Data Source

1. Create API client in `src/lib/api/your-source.ts`
2. Define TypeScript types in `src/types/conditions.ts`
3. Add fetch call in `src/app/api/conditions/route.ts` parallel promise array
4. Update swim score algorithm in `src/lib/algorithms/swim-score.ts` to incorporate new data
5. Update `SCORE_WEIGHTS` in `src/config/thresholds.ts` (must sum to 100)

### Modifying Safety Thresholds

All thresholds are in `src/config/thresholds.ts`. Update values there rather than hardcoding throughout the codebase.

## GitHub Pages Deployment

The app supports dual deployment: a dynamic server with API routes AND a static snapshot for GitHub Pages.

### Architecture

- **Main Server**: Runs with full API routes, real-time data fetching
- **GitHub Pages**: Static snapshot with pre-fetched data, updated every 20 minutes by integrated scheduler
- **Build Mode Detection**: `NEXT_PUBLIC_BUILD_MODE` env var controls static vs dynamic behavior

### Static Export Process

1. **Data Pre-fetching** (`src/lib/static/fetchStaticData.ts`):
   - Calls API functions directly (no HTTP overhead)
   - Aggregates data from all sources
   - Returns JSON-serializable data

2. **Static Data Generation** (`src/lib/static/generateStaticData.ts`):
   - CLI script that writes data to `public/static-data.json`
   - Includes build timestamp and metadata
   - Run automatically by `build:static` script

3. **Dual-Mode Components**:
   - `CurrentConditions.tsx` detects static mode via `process.env.NEXT_PUBLIC_BUILD_MODE`
   - In static mode: fetches from `/static-data.json` instead of `/api/conditions`
   - Disables auto-refresh in static mode
   - `page.tsx` shows banner: "Static Snapshot - updated every 20 minutes"

4. **Build Process**:
   ```bash
   npm run build:static
   # Runs: generate-static-data → next build → export-static.sh
   # Output: out/ directory with HTML/CSS/JS + static-data.json
   ```

5. **Manual Export** (`scripts/export-static.sh`):
   - Workaround for Next.js 15 + API routes compatibility
   - Copies files from `.next/server/app/` to `out/`
   - Includes static assets and pre-fetched data

### Automatic Updates (Opt-in alongside Dev Server)

**Default behavior**: `npm run dev` runs **only** the Next.js dev server. The static site scheduler is opt-in, not automatic.

**How It Works** (when opted in via `dev:with-scheduler`):
- Two processes start:
  1. Next.js dev server (port 3333)
  2. Static site update scheduler (background)
- Scheduler automatically updates GitHub Pages every 20 minutes
- Both stop together when you Ctrl+C

**Setup**:
```bash
# 1. Configure environment variables (create .env.local)
cp .env.example .env.local

# 2. Edit with your GitHub repo
vim .env.local
# Set: GITHUB_REPO="git@github.com:YOUR_USERNAME/swimmingly.git"

# 3. Start dev server with scheduler
npm run dev:with-scheduler

# You'll see both processes running:
# [server]    ▲ Next.js 15.x.x
# [scheduler] 🚀 Static Site Update Scheduler Started
```

**Available Commands**:
```bash
npm run dev              # Run ONLY dev server (default, no updates)
npm run dev:server       # Alias for dev
npm run dev:scheduler    # Run ONLY scheduler (requires server running)
npm run dev:no-updates   # Alias for dev:server
npm run dev:with-scheduler # Run dev server + auto-updates together
```

**Configuration** (via environment variables in `.env.local`):
```bash
ENABLE_STATIC_UPDATES="true"              # Toggle on/off
STATIC_UPDATE_SCHEDULE="*/20 * * * *"     # Cron expression
GITHUB_REPO="git@github.com:user/repo.git"
GITHUB_BRANCH="gh-pages"
RUN_IMMEDIATELY="false"                   # Run update on startup
```

**Script**: `scripts/static-update-scheduler.ts` (Node.js scheduler)

**Flow**:
1. Check if API is available (`http://localhost:3000/api/conditions`)
2. Fetch fresh data and write to `public/static-data.json`
3. Run `npm run build:static` to generate new static build
4. Push `out/` directory to `gh-pages` branch
5. GitHub Pages auto-deploys from `gh-pages` branch


### GitHub Pages Configuration

1. In GitHub repository settings → Pages:
   - Source: Deploy from branch
   - Branch: `gh-pages` / root
   - Save

2. Optional: Add custom domain in settings

3. Static site will be available at: `https://username.github.io/swimmingly`

### Configuration Files

- **`.env.static`**: Environment variables for static builds
  - `BUILD_MODE=static`
  - `NEXT_PUBLIC_BUILD_MODE=static`
  - `NEXT_PUBLIC_MAIN_SITE_URL` (link shown in static banner)

- **`next.config.ts`**: Conditional static export
  ```typescript
  ...(process.env.BUILD_MODE === 'static' && {
    output: 'export',
    images: { unoptimized: true },
  })
  ```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/static/fetchStaticData.ts` | Core data fetching logic (calls API functions directly) |
| `src/lib/static/generateStaticData.ts` | CLI script that generates static-data.json |
| `scripts/static-update-scheduler.ts` | **Node.js scheduler (runs with dev server)** |
| `scripts/export-static.sh` | Manual export from .next/ to out/ directory |
| `.env.static` | Static build environment variables |
| `.env.local` | Development environment variables (including scheduler config) |

### Deployment Workflow

```
npm run dev:with-scheduler
    ├─ Next.js Dev Server (localhost:3333)
    └─ Node.js Scheduler (background)
           ↓ every 20 minutes
       Check API availability
           ↓
       Fetch /api/conditions
           ↓
       Generate static-data.json
           ↓
       npm run build:static
           ↓
       Build Static Site (out/)
           ↓
       git push to gh-pages
           ↓
       GitHub Pages auto-deploy
           ↓
       Static Site Live (username.github.io/swimmingly)

Ctrl+C → Both processes stop together
```

### Testing Locally

```bash
# Build static version
npm run build:static

# Serve locally
npx serve out

# Visit http://localhost:3000
# Should see:
# - Static banner at top
# - Pre-fetched data (not loading spinner)
# - No auto-refresh
# - Last updated timestamp
```

### Troubleshooting

**Issue**: Scheduler not starting with dev server
- **Solution**: The scheduler is opt-in now — use `npm run dev:with-scheduler` (plain `npm run dev` no longer starts it)
- **Check**: Look for `[scheduler]` output in console

**Issue**: Scheduler shows "API not available"
- **Solution**: Wait for dev server to fully start (it takes a few seconds)
- **Check**: Visit `http://localhost:3000/api/conditions` manually

**Issue**: Updates not pushing to GitHub
- **Solution**: Set up SSH keys for GitHub or configure HTTPS authentication
- **Check**: Verify `GITHUB_REPO` in `.env.local` is correct

**Issue**: Want to disable automatic updates during development
- **Solution**: Nothing to do — `npm run dev` no longer runs the scheduler by default. Only `npm run dev:with-scheduler` starts it.

**Issue**: Want different update frequency
- **Solution**: Change `STATIC_UPDATE_SCHEDULE` in `.env.local`
- **Examples**:
  - Every 5 minutes: `*/5 * * * *`
  - Every 30 minutes: `*/30 * * * *`
  - Every hour: `0 * * * *`

**Issue**: `out/` directory not created after build
- **Solution**: The `build:static` script now includes manual export step

**Issue**: Static site shows loading spinner forever
- **Solution**: Check if `static-data.json` was copied to `out/` directory

## Important Caveats

- **This project was "heavily vibe coded"** (per README) - code may prioritize working functionality over perfect architecture
- NOAA APIs are free but rate-limited - implement caching (Redis/localStorage) for production
- Water quality data sources can be unreliable - always show data freshness timestamps to users
- Dam release time-lag modeling uses rough estimates (24-48 hours) - actual transit times vary by water flow and dam location
- **Static site on GitHub Pages**: Shows snapshot data updated every 20 minutes, not real-time. Main server provides live data.
