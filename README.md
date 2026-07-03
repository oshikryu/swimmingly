# Swimmingly - Swim Planner

(Warning: this was heavily vibe coded)

A Next.js web application that helps swimmers determine optimal swimming times and routes by aggregating real-time data on tides, currents, weather, waves, and water quality. Supports two locations, each with its own dashboard and independently calibrated safety scoring:

- **Aquatic Park**, San Francisco Bay (`/`)
- **La Jolla Cove**, San Diego (`/lajollacove`)

## Live

| Deployment | URL | Notes |
|------------|-----|-------|
| Cloudflare Workers | https://swimmingly.ryushikiri.workers.dev | Live API + full app, always-on |
| Cloudflare Workers (La Jolla Cove) | https://swimmingly.ryushikiri.workers.dev/lajollacove | Second location dashboard |
| GitHub Pages | https://oshikryu.github.io/swimmingly | Static snapshot (Aquatic Park only), updated every 20 min |

## Features

- **Two independent locations**: Aquatic Park (SF Bay) and La Jolla Cove (San Diego), each with its own data sources, cache keys, tide preferences, and score-weight settings
- **Real-time Conditions Dashboard**: Current swim score and environmental conditions
- **Intelligent Swim Scoring**: Weighted algorithm considering:
  - Water Quality (30%) — bacteria levels, sewer overflow events, rainfall indicators, and water temperature
  - Tide & Current (32%) — optimal timing for slack tide with customizable preferences, moon-phase spring/neap signal
  - Waves (20%) — swell height and period
  - Weather (18%) — wind, temperature, precipitation, barometric pressure
- **Per-location safety thresholds**: Wave/current/wind thresholds can be overridden per location (`ThresholdsOverride` in `swim-score.ts`) — La Jolla Cove's are recalibrated for open-coast groundswell rather than Aquatic Park's sheltered-bay chop, so a "calm" day reads correctly at each location instead of using one location's assumptions everywhere
- **Safety First**: Prominent warnings for poor water quality and dangerous conditions
- **Auto-refresh**: Updates every 5 minutes with fresh data
- **Customizable Tide Preferences**: Set your preferred tide phase (slack/flood/ebb)

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Hosting**: Cloudflare Workers (via `@opennextjs/cloudflare`), GitHub Pages (static snapshot)
- **Database**: PostgreSQL with Prisma ORM (TimescaleDB ready for time-series data, optional)
- **Styling**: Tailwind CSS
- **Data Sources**: NOAA (tides, currents, weather, wave buoys, water temperature), Open-Meteo (wind, rainfall), SF Open Data & CA Water Quality Portal (Aquatic Park water quality, sewer overflows), San Diego County DEHQ & Swim Guide (La Jolla Cove water quality), CDEC (dam releases, Aquatic Park only). Full breakdown in [Data Sources](#data-sources) below.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (optional for development)
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/oshikryu/swimmingly.git
   cd swimmingly
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your configuration:
   ```env
   # Optional for development - the app will work without a database using API calls
   DATABASE_URL="postgresql://user:password@localhost:5432/swimmingly"
   REDIS_URL="redis://localhost:6379"

   # Required for map features (get free keys from mapbox.com)
   MAPBOX_PUBLIC_KEY="pk.your_key_here"
   MAPBOX_SECRET_KEY="sk.your_key_here"
   ```

4. **Initialize the database** (optional)
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3333](http://localhost:3333)

## Deployment

### Cloudflare Workers (recommended)

The full Next.js app — including all API routes — runs on Cloudflare Workers via [`@opennextjs/cloudflare`](https://github.com/opennextjs/opennextjs-cloudflare). No cold starts, no spin-down, 100k free requests/day.

```bash
# Login to Cloudflare (one-time)
npx wrangler login

# Build and deploy
npm run deploy:cf

# Preview locally before deploying
npm run preview:cf
```

The deploy script runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. Configuration lives in `wrangler.jsonc` and `open-next.config.ts`.

### GitHub Pages (static snapshot)

A static snapshot is generated and pushed to the `gh-pages` branch automatically every 20 minutes when the dev server is running. It pre-fetches all data at build time and serves a zero-JS-request page.

```bash
# Manual build and deploy
npm run build:static
npm run publish:static

# Or start dev server with auto-updates enabled
ENABLE_STATIC_UPDATES=true GITHUB_REPO="git@github.com:oshikryu/swimmingly.git" npm run dev
```

See `scripts/static-update-scheduler.ts` for the scheduler and CLAUDE.md for full static deployment details.

## Project Structure

```
swimmingly/
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── api/
│   │   │   ├── conditions/          # Aquatic Park conditions endpoint
│   │   │   ├── lajollacove/conditions/  # La Jolla Cove conditions endpoint
│   │   │   ├── tides/       # Tide predictions
│   │   │   ├── weather/     # Weather data
│   │   │   └── waves/       # Wave/swell data
│   │   ├── lajollacove/page.tsx  # La Jolla Cove dashboard page
│   │   └── page.tsx              # Aquatic Park dashboard page
│   ├── components/        # React components
│   │   └── dashboard/     # Dashboard-specific components (CurrentConditions takes a
│   │                      # `location` prop so both pages share one implementation)
│   ├── lib/              # Core utilities
│   │   ├── api/          # External API clients (NOAA, SFPUC, sdbeachinfo, swimguide, etc.)
│   │   ├── algorithms/   # Swim score calculation, incl. per-location threshold overrides
│   │   └── db.ts         # Database client
│   ├── config/           # Configuration files
│   │   ├── aquatic-park.ts   # Aquatic Park location & station IDs
│   │   ├── la-jolla-cove.ts  # La Jolla Cove location, station IDs & threshold overrides
│   │   ├── routes.ts         # Swimming route definitions
│   │   └── thresholds.ts     # Shared default safety thresholds
│   └── types/            # TypeScript type definitions
├── prisma/
│   └── schema.prisma     # Database schema
└── public/               # Static assets
```

## API Endpoints

La Jolla Cove has its own conditions endpoint, `GET /api/lajollacove/conditions`, which mirrors `/api/conditions` below (same query parameters, same response shape) but is wired to La Jolla Cove's data sources instead — see [Data Sources](#data-sources). It has no `damReleases` field (not applicable to San Diego) and its `waterQuality`/`waves` sources differ from Aquatic Park's.

### `GET /api/conditions`

Returns current conditions including swim score, tide, weather, waves, water quality, water temperature, rainfall, and dam releases.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tidePhasePreference` | `slack` \| `flood` \| `ebb` | `slack` | Preferred tide phase for score calculation |

**Example Request:**
```bash
curl "http://localhost:3333/api/conditions?tidePhasePreference=slack"
```

**Response:**
```json
{
  "timestamp": "2026-01-15T22:20:05.245Z",
  "score": {
    "timestamp": "2026-01-15T22:20:05.247Z",
    "overallScore": 84,
    "rating": "excellent",
    "factors": {
      "waterQuality": {
        "score": 100,
        "status": "safe",
        "bacteriaLevel": "safe",
        "recentSSO": false,
        "issues": []
      },
      "tideAndCurrent": {
        "score": 40,
        "phase": "ebb",
        "currentSpeed": 1.78,
        "tideHeight": 0.664,
        "favorable": false,
        "issues": ["Strong current (1.8 knots)"]
      },
      "waves": {
        "score": 100,
        "heightFeet": 0.6,
        "status": "calm",
        "issues": []
      },
      "weather": {
        "score": 95,
        "temperature": 60.6,
        "windSpeed": 8.5,
        "windCondition": "light",
        "issues": []
      },
      "damReleases": {
        "score": 100,
        "totalFlowCFS": 27505,
        "releaseLevel": "low",
        "topContributor": "Shasta Dam",
        "issues": []
      }
    },
    "recommendations": [
      "Calm water conditions",
      "Normal dam operations",
      "Excellent conditions for swimming"
    ],
    "warnings": ["Strong currents - experienced swimmers only"]
  },
  "tide": {
    "timestamp": "2026-01-15T22:12:00.000Z",
    "heightFeet": 0.664,
    "type": "normal",
    "source": "NOAA",
    "nextHigh": {
      "timestamp": "2026-01-16T07:13:00.000Z",
      "heightFeet": 4.533,
      "type": "high",
      "source": "NOAA"
    },
    "nextLow": {
      "timestamp": "2026-01-15T23:47:00.000Z",
      "heightFeet": -0.287,
      "type": "low",
      "source": "NOAA"
    },
    "currentPhase": "ebb",
    "changeRateFeetPerHour": 0.656
  },
  "current": {
    "timestamp": "2026-01-15T22:20:00.000Z",
    "speedKnots": 1.78,
    "direction": 257,
    "lat": 37.8065,
    "lon": -122.4216,
    "source": "NOAA"
  },
  "weather": {
    "timestamp": "2026-01-15T22:15:00.000Z",
    "temperatureF": 60.6,
    "windSpeedMph": 8.5,
    "windDirection": 12,
    "windGustMph": 9.4,
    "visibilityMiles": 10,
    "conditions": "unavailable",
    "source": "open-meteo"
  },
  "waves": {
    "timestamp": "2026-01-15T20:00:00.000Z",
    "waveHeightFeet": 0.6,
    "source": "OpenWaterLog"
  },
  "waterQuality": {
    "timestamp": "2026-01-12T08:00:00.000Z",
    "enterococcusCount": 41,
    "status": "safe",
    "source": "SF Beach Water Quality (Aquatic Park)",
    "stationId": "BAY#211_SL",
    "notes": "Sampled 3 days ago"
  },
  "recentSSOs": [],
  "damReleases": {
    "timestamp": "2026-01-15T22:20:03.732Z",
    "current": {
      "totalFlowCFS": 27505,
      "releaseLevel": "low"
    },
    "historical48h": {
      "averageFlowCFS": 25265.16,
      "peakFlowCFS": 29632,
      "peakTimestamp": "2026-01-14T02:00:00.000Z",
      "trendDirection": "stable",
      "last24hAverage": 25545.3,
      "last48hAverage": 25265.16,
      "dataPointsCount": 49
    },
    "dams": [
      {
        "name": "Shasta Dam",
        "stationId": "SHA",
        "current": {
          "flowCFS": 15317,
          "timestamp": "2026-01-15T08:00:00.000Z",
          "percentOfTotal": 55.69
        },
        "historical48h": {
          "averageFlowCFS": 13813.45,
          "peakFlowCFS": 15581,
          "dataPoints": 49
        }
      }
    ],
    "latestDataTimestamp": "2026-01-15T08:00:00.000Z",
    "source": "CDEC"
  },
  "waterTemperature": {
    "timestamp": "2026-01-15T22:00:00.000Z",
    "temperatureF": 54.3,
    "source": "seatemperature.info"
  },
  "rainfall": {
    "timestamp": "2026-01-15T22:20:05.245Z",
    "last24hInches": 0.0,
    "last48hInches": 0.0,
    "last72hInches": 0.0,
    "source": "open-meteo"
  },
  "dataFreshness": {
    "tide": "2026-01-15T22:12:00.000Z",
    "weather": "2026-01-15T22:20:05.245Z",
    "waves": "2026-01-15T20:00:00.000Z",
    "waterQuality": "2026-01-12T08:00:00.000Z",
    "waterTemperature": "2026-01-15T22:00:00.000Z",
    "sso": "2026-01-15T22:20:05.245Z",
    "damReleases": "2026-01-15T22:20:03.732Z",
    "rainfall": "2026-01-15T22:20:05.245Z"
  }
}
```

---

### `GET /api/tides`

Returns tide predictions for a specified time range.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hours` | `number` | `48` | Number of hours to forecast |

**Example Request:**
```bash
curl "http://localhost:3333/api/tides?hours=24"
```

**Response:**
```json
{
  "current": {
    "timestamp": "2026-01-15T22:12:00.000Z",
    "heightFeet": 0.664,
    "type": "normal",
    "source": "NOAA",
    "nextHigh": {
      "timestamp": "2026-01-16T07:13:00.000Z",
      "heightFeet": 4.533,
      "type": "high",
      "source": "NOAA"
    },
    "nextLow": {
      "timestamp": "2026-01-15T23:47:00.000Z",
      "heightFeet": -0.287,
      "type": "low",
      "source": "NOAA"
    },
    "currentPhase": "ebb",
    "changeRateFeetPerHour": 0.656
  },
  "predictions": [
    {
      "timestamp": "2026-01-15T23:00:00.000Z",
      "heightFeet": 0.123,
      "type": "normal",
      "source": "NOAA"
    },
    {
      "timestamp": "2026-01-15T23:47:00.000Z",
      "heightFeet": -0.287,
      "type": "low",
      "source": "NOAA"
    }
  ],
  "range": {
    "start": "2026-01-15T22:00:00.000Z",
    "end": "2026-01-16T22:00:00.000Z"
  }
}
```

---

### `GET /api/weather`

Returns current weather from Open-Meteo and 72-hour forecast from NOAA NWS.

**Example Request:**
```bash
curl "http://localhost:3333/api/weather"
```

**Response:**
```json
{
  "current": {
    "timestamp": "2026-01-15T22:15:00.000Z",
    "temperatureF": 60.6,
    "windSpeedMph": 8.5,
    "windDirection": 12,
    "windGustMph": 9.4,
    "conditions": "Partly Cloudy",
    "source": "open-meteo"
  },
  "forecast": [
    {
      "timestamp": "2026-01-15T23:00:00.000Z",
      "temperatureF": 58.2,
      "windSpeedMph": 6.0,
      "windDirection": 315,
      "conditions": "Clear",
      "source": "NOAA-NWS"
    }
  ],
  "timestamp": "2026-01-15T22:20:00.000Z"
}
```

---

### `GET /api/waves`

Returns current wave and swell data from NOAA buoy. (Note: the `/api/conditions` endpoint uses OpenWaterLog as the primary wave source with NOAA as fallback.)

**Example Request:**
```bash
curl "http://localhost:3333/api/waves"
```

**Response:**
```json
{
  "current": {
    "timestamp": "2026-01-15T20:00:00.000Z",
    "waveHeightFeet": 0.6,
    "swellPeriodSeconds": 12,
    "swellDirection": 285,
    "source": "NOAA-NDBC"
  },
  "timestamp": "2026-01-15T22:20:00.000Z"
}
```

**Error Response (503):**
```json
{
  "error": "No wave data available"
}
```

---

### Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong",
  "message": "Detailed error info (on 500 only)"
}
```

The `/api/conditions` endpoint includes a `details` object on 503 errors showing which data sources failed:

```json
{
  "error": "Unable to fetch critical tide data",
  "details": {
    "tide": "missing",
    "waves": "ok",
    "waterQuality": "ok"
  }
}
```

| Status Code | Description |
|-------------|-------------|
| `500` | Internal server error (API fetch failed) |
| `503` | Service unavailable (critical tide data unavailable) |

## Swim Score Algorithm

The swim score (0-100) is calculated using weighted factors. The algorithm is implemented in `src/lib/algorithms/swim-score.ts`. Dam releases are fetched and shown as informational data (Aquatic Park only) but are **not** part of the score — they're not a reliable enough signal on their own to weight into the swim score.

### Formula

```
overallScore = (waterQuality × 0.30) + (tideAndCurrent × 0.32) + (waves × 0.20) + (weather × 0.18)
```

### Factor Weights

| Factor | Weight | Priority |
|--------|--------|----------|
| Water Quality | 30% | Highest - Safety first (includes water temperature) |
| Tide & Current | 32% | Affects difficulty and safety (moon-phase spring/neap signal) |
| Waves | 20% | Affects comfort and safety |
| Weather | 18% | Wind, precipitation, and barometric pressure |

`calculateSwimScore()` also accepts an optional `customThresholds` override (`ThresholdsOverride` type) so a location can recalibrate any threshold category without changing the shared defaults in `src/config/thresholds.ts` — see [Per-location thresholds](#per-location-thresholds) below. With no override, behavior is identical to the shared defaults (used by Aquatic Park).

---

### 1. Water Quality Score (30%)

Evaluates bacteria levels and recent sewer overflow events.

**Scoring Logic:**

| Enterococcus (MPN/100ml) | Score | Status |
|--------------------------|-------|--------|
| ≤ 104 | 100 | Safe |
| 105 - 500 | 70 | Advisory |
| 501 - 1000 | 30 | Warning |
| > 1000 | 0 | Dangerous |

**SSO (Sewer Overflow) Adjustments:**
- Active SSO nearby: Score capped at 20, status = dangerous
- SSO within 3 days: Score capped at 60, status = advisory

**Rainfall Adjustments (72-hour accumulation):**

Rainfall acts as a real-time proxy for water quality degradation, since weekly bacteria testing may not capture post-rain spikes. Unlike bacteria readings and SSO events, rainfall only reduces the water quality **score** — it does not change the water quality **status**. This prevents the overall score safety caps from triggering on an indirect proxy indicator.

| Rainfall (inches / 72h) | Max WQ Score | Description |
|--------------------------|--------------|-------------|
| < 0.1 | — | No penalty |
| 0.1 - 0.5 | 60 | Bacteria levels may be elevated |
| 0.5 - 1.0 | 35 | Expect poor water quality |
| > 2.0 | 15 | Major runoff — expect dangerous conditions |

**Response Fields:**
```json
{
  "score": 100,
  "status": "safe | advisory | warning | dangerous",
  "bacteriaLevel": "safe | moderate | high | dangerous | unknown",
  "recentSSO": false,
  "daysSinceSSO": null,
  "issues": []
}
```

---

### 2. Tide & Current Score (32%)

Evaluates tide phase and current speed with customizable preferences.

**Tide Phase Preferences (customizable):**

| Phase | Default Score | Description |
|-------|---------------|-------------|
| Slack | 100 | Minimal water movement (best) |
| Flood | 85 | Incoming/rising tide |
| Ebb | 85 | Outgoing/falling tide |

**Current Speed Adjustments:**

| Change Rate (ft/hr) | Multiplier | Effect |
|---------------------|------------|--------|
| < 1.0 | 1.0× | Full phase score |
| 1.0 - 2.0 | 0.7× | Moderate reduction, cap at 70 |
| > 2.0 | 0.4× | Strong reduction, cap at 40 |

**Current Speed Caps:**

| Speed (knots) | Max Score | Status |
|---------------|-----------|--------|
| < 0.3 | 100 | Slack |
| 0.3 - 0.5 | 100 | Slow |
| 0.5 - 1.0 | 65 | Moderate |
| 1.0 - 1.5 | 40 | Strong |
| > 2.0 | 20 | Very Strong |

**Response Fields:**
```json
{
  "score": 85,
  "phase": "slack | flood | ebb",
  "currentSpeed": 0.5,
  "tideHeight": 2.3,
  "favorable": true,
  "issues": []
}
```

---

### 3. Wave Score (20%)

Evaluates wave height conditions.

**Scoring Logic:**

| Wave Height (ft) | Score | Status |
|------------------|-------|--------|
| < 2 | 100 | Calm |
| 2 - 3 | 85 | Calm |
| 3 - 5 | 60 | Moderate |
| 5 - 8 | 30 | Rough |
| > 8 | 10 | Dangerous |

**Response Fields:**
```json
{
  "score": 100,
  "heightFeet": 0.6,
  "status": "calm | moderate | rough | dangerous",
  "issues": []
}
```

---

### 4. Weather Score (18%)

Evaluates wind speed and precipitation.

**Wind Speed Scoring:**

| Wind Speed (mph) | Score | Condition |
|------------------|-------|-----------|
| < 5 | 100 | Calm |
| 5 - 10 | 95 | Light |
| 10 - 15 | 80 | Moderate |
| 15 - 20 | 60 | Moderate |
| 20 - 25 | 35 | Strong |
| > 25 | 15 | Strong |

**Precipitation Adjustment:**
- Rain or storm conditions: Score capped at 40

**Response Fields:**
```json
{
  "score": 95,
  "temperature": 60.6,
  "windSpeed": 8.5,
  "windCondition": "calm | light | moderate | strong",
  "issues": []
}
```

---

### Dam Releases (informational only, Aquatic Park only)

Upstream dam releases are fetched with time-lag modeling and included in the `/api/conditions` response (`damReleases` field), but they are **not** a scored factor — there's no reliable enough correlation to weight them into the swim score directly, so they're surfaced as context instead. Not applicable to La Jolla Cove (`/api/lajollacove/conditions` omits this field entirely — no upstream dam affects the San Diego coast).

**Time-Lag Weighted Flow Calculation:**
```
weightedAvgFlow = (last24hAverage × 0.6) + (last48hAverage × 0.4)
peakComponent = peakFlowCFS × 0.8
scoringFlow = max(weightedAvgFlow, peakComponent)
```

**Monitored Dams:**
- Shasta Dam (SHA) - Sacramento River
- Oroville Dam (ORO) - Feather River
- Folsom Dam (FOL) - American River
- Pardee Dam (PAR) - Mokelumne River
- Camanche Dam (CMN) - Mokelumne River

**Response Fields:**
```json
{
  "current": { "totalFlowCFS": 27505, "releaseLevel": "low" },
  "historical48h": { "averageFlowCFS": 25265.16, "peakFlowCFS": 29632, "trendDirection": "stable" },
  "dams": [{ "name": "Shasta Dam", "stationId": "SHA", "current": { "flowCFS": 15317, "percentOfTotal": 55.69 } }],
  "source": "CDEC"
}
```

---

### Overall Score Safety Caps

Certain critical danger conditions override the weighted average, capping the overall score regardless of other factors:

| Condition | Max Overall Score | Rating Cap |
|-----------|-------------------|------------|
| Dangerous water quality | 19 | Dangerous |
| Water quality warning | 39 | Poor |
| Very strong current (≥ 2.0 knots) | 39 | Poor |
| Strong current (≥ 1.5 knots) | 59 | Fair |
| Dangerous waves | 19 | Dangerous |
| Rough waves | 39 | Poor |

These caps ensure that a single life-threatening condition cannot be masked by high scores in other factors.

---

### Score Ranges

| Range | Rating | Color | Description |
|-------|--------|-------|-------------|
| 80-100 | Excellent | Green (#22c55e) | Ideal conditions |
| 60-79 | Good | Blue (#3b82f6) | Good conditions |
| 40-59 | Fair | Amber (#f59e0b) | Experienced swimmers only |
| 20-39 | Poor | Red (#ef4444) | Not recommended |
| 0-19 | Dangerous | Dark Red (#991b1b) | Do not swim |

---

### Recommendations & Warnings

The algorithm generates contextual advice based on factor scores:

**Recommendations (positive):**
- "Excellent time - slack tide"
- "Calm water conditions"
- "Normal dam operations"
- "Moderate dam releases - be aware of currents"
- "Excellent/Good/Fair conditions for swimming"

**Warnings (negative):**
- "Do not swim - dangerous water quality"
- "Water quality warning in effect"
- "Recent sewer overflow - use caution"
- "Heavy recent rainfall — avoid swimming for 72 hours"
- "Recent rainfall may have degraded water quality"
- "Strong currents - experienced swimmers only"
- "Dangerous wave conditions"
- "Rough seas - not recommended"
- "Strong winds present"
- "Extreme dam releases - very strong currents expected"
- "High dam releases - strong bay currents"
- "Poor conditions - not recommended"
- "Dangerous conditions - do not swim"

---

### Client-Side Recalculation (Static Site)

On GitHub Pages, the swim score is recalculated client-side when users change tide preferences:

1. Raw data (tide, current, weather, waves, waterQuality, damReleases) is fetched from `static-data.json`
2. User selects preferred tide phase (slack/flood/ebb)
3. `calculateSwimScore()` runs in the browser with custom tide preferences
4. Score updates instantly without server round-trip

---

### Dam Release Time-Lag Modeling

The app models upstream dam releases and their delayed impact on SF Bay:

**Transit Times:**
| Dam | River | Transit Time |
|-----|-------|--------------|
| Shasta | Sacramento | 2-5 days |
| Oroville | Feather | 2-4 days |
| Folsom | American | 1-3 days |

**Modeling Approach:**
- **48-Hour Window**: Fetches hourly flow data to capture releases currently affecting bay
- **Weighted Scoring**: Recent releases (last 24h) weighted 60%, older (24-48h) weighted 40%
- **Peak Detection**: Maximum flow at 80% weight catches intense but brief releases
- **Trend Analysis**: Compares first vs last 12 hours to determine increasing/stable/decreasing

## Safety Thresholds

Default thresholds (used by Aquatic Park) are configured in `src/config/thresholds.ts`:

| Category | Threshold | Values |
|----------|-----------|--------|
| Bacteria (Enterococcus) | Safe / Advisory / Dangerous | ≤ 104 / ≤ 500 / > 1000 MPN/100ml |
| Bacteria (Coliform) | Safe / Advisory / Dangerous | ≤ 10,000 / ≤ 50,000 / > 100,000 MPN/100ml |
| Waves | Calm / Safe / Moderate / Rough | < 0.5 / < 1.0 / < 1.5 / < 2.5 ft |
| Wind | Calm / Light / Moderate / Strong | < 10 / < 15 / < 22 / < 30 mph |
| Current | Slack / Slow / Moderate / Strong | < 0.3 / < 0.5 / < 1.0 / < 1.5 kts |
| Dam Releases (informational) | Low / Moderate / High / Extreme | < 30k / < 50k / < 80k / > 100k CFS |
| Rainfall (72h) | Light / Moderate / Heavy / Extreme | < 0.1 / < 0.5 / < 1.0 / > 2.0 in |
| SSO | Caution / Warning | 3 days / 7 days |
| Water Temp | Cold / Cool / Moderate / Comfortable | < 55 / < 60 / < 65 / ≥ 70 °F |
| Barometric Pressure | Very Low / Low / Standard / High / Very High | < 1000 / < 1005 / < 1013 / < 1020 / ≥ 1025 mb |

### Per-location thresholds

A location can override any subset of these via `ThresholdsOverride` (`src/lib/algorithms/swim-score.ts`), merged onto the defaults above at score time. La Jolla Cove overrides wave thresholds only (`src/config/la-jolla-cove.ts`) — open-coast groundswell reads very differently to a swimmer than Aquatic Park's sheltered-bay chop at the same buoy height:

| Category | Threshold | Aquatic Park (default) | La Jolla Cove (override) |
|----------|-----------|--------------------------|---------------------------|
| Waves | Calm / Safe / Moderate / Rough | < 0.5 / < 1.0 / < 1.5 / < 2.5 ft | < 1.5 / < 2.5 / < 3.5 / < 6.0 ft |

La Jolla Cove's values are backed by 45 days of live buoy history (median wave height 2.0-2.3 ft) and published safety guidance from La Jolla Cove Swim Club (3-4 ft = "potentially dangerous for beginners", 6-8 ft = "dangerous even for good swimmers").

## Development Roadmap

### Current Status ✅
- [x] Project setup with Next.js, TypeScript, Tailwind
- [x] NOAA API client (tides, weather, waves)
- [x] SF Open Data API client (sewer overflows)
- [x] CA Water Quality Portal integration
- [x] CDEC API client (dam releases with 48-hour historical data)
- [x] Open-Meteo weather integration (primary wind data + rainfall)
- [x] OpenWaterLog wave data (primary source, NOAA buoy fallback)
- [x] Swim score algorithm with customizable tide preferences
- [x] Current conditions dashboard
- [x] Real-time data fetching with localStorage caching
- [x] 48-hour dam release tracking with time-lag modeling
- [x] Water temperature monitoring (SeaTemperature.info)
- [x] Rainfall-based water quality proxy (72-hour accumulation)
- [x] Cloudflare Workers deployment (`@opennextjs/cloudflare`)
- [x] GitHub Pages static snapshot with auto-updates
- [x] Moon phase (spring/neap tide signal) and barometric pressure scoring
- [x] La Jolla Cove as a second, independent location at `/lajollacove`
- [x] Per-location safety threshold overrides (`ThresholdsOverride`)
- [x] San Diego County ddPCR + Swim Guide water quality integrations

### Next Steps 🚀

1. **Forecast View**
   - 48-hour forecast timeline
   - Optimal swim window detection
   - Hour-by-hour predictions

2. **Interactive Map**
   - Mapbox integration
   - Swimming route visualization
   - Current flow arrows
   - Route difficulty based on conditions

3. **Historical Analysis**
   - Best times to swim (by day/month)
   - Seasonal patterns
   - Trend visualization

4. **Database Integration**
   - Store historical data
   - TimescaleDB continuous aggregates
   - Faster historical queries

5. **Enhancements**
   - Email/SMS notifications for good conditions
   - User preferences (wetsuit/non-wetsuit swimmer)
   - Custom route creation
   - Share conditions link
   - Progressive Web App (offline support)

## Data Sources

All APIs are public and require no authentication, except where noted. NOAA requests use `time_zone=gmt` with UTC timestamps to ensure consistent behavior across server environments (including Cloudflare Workers).

### Aquatic Park

| Source | Data | Station / Endpoint |
|--------|------|--------------------|
| [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov) | Tide predictions, water level, currents | Station 9414290 (San Francisco) |
| [NOAA National Weather Service](https://api.weather.gov) | Forecast, hourly observations | Point forecast for Aquatic Park coords |
| [NOAA NDBC](https://www.ndbc.noaa.gov) | Wave height, swell period (fallback) | Buoy 46237 (SF offshore), Buoy 46026 (backup) |
| [Open-Meteo](https://open-meteo.com) | Wind speed/direction/gusts, temperature, 72h rainfall | Aquatic Park lat/lon |
| [OpenWaterLog](https://openwaterlog.com) | Wave data (primary — more accurate for Aquatic Park) | Aquatic Park station |
| [CDEC](https://cdec.water.ca.gov) | Dam releases (48h hourly, informational only) | SHA, ORO, FOL, PAR, CMN |
| [SF Gov Open Data](https://data.sfgov.org) | Enterococcus water quality (primary) | BAY#211_SL (Aquatic Park), BAY#210.1_SL (Hyde St Pier) |
| [CA Water Quality Portal](https://www.waterqualitydata.us) | Water quality (fallback) | Historical monitoring |
| [SF Open Data](https://data.sfgov.org) | Sewer overflow (SSO) alerts | SF Public Utilities Commission |
| [SeaTemperature.info](https://www.seatemperature.info) | Water temperature | San Francisco Bay |

### La Jolla Cove

| Source | Data | Station / Endpoint |
|--------|------|--------------------|
| [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov) | Tide predictions, water level, water temperature, wind, air temperature | Station 9410230 (La Jolla / Scripps Pier) |
| [NOAA NDBC](https://www.ndbc.noaa.gov) | Wave height, swell period (primary) | Buoy 46254 (Scripps Nearshore Waverider) |
| [NOAA NDBC](https://www.ndbc.noaa.gov) | Wave height, swell period (fallback) | LJPC1 (Scripps Pier C-MAN station) |
| [Open-Meteo](https://open-meteo.com) | Wind speed/direction/gusts, temperature, 72h rainfall | La Jolla Cove lat/lon |
| [San Diego County DEHQ (sdbeachinfo)](https://cosdapps.sandiegocounty.gov/sdbeachinfo/) | Enterococcus water quality via ddPCR (primary) | Site 105, station FM-070 — undocumented internal API, see `src/lib/api/sdbeachinfo.ts` |
| [Swim Guide](https://www.theswimguide.org/) | Water quality status (fallback) | Beach 1986 — parses embedded page state, see `src/lib/api/swimguide.ts` |
| [CA Water Quality Portal](https://www.waterqualitydata.us) | Water quality (last resort) | Historical monitoring |

No current-prediction station or dam-release source applies to La Jolla Cove — current speed is always estimated from the tide change rate, and `damReleases` is omitted from the response entirely.

**Note on undocumented integrations:** `sdbeachinfo.ts` and `swimguide.ts` don't call documented public APIs — they reverse-engineer data that's publicly displayed on each site's own beach-status page (a short session-bootstrap handshake for sdbeachinfo, parsing of embedded server-rendered page state for Swim Guide). Both fail safe (return `null`, never throw) and sit behind a fallback chain, since either could break if the source site changes its frontend. See each file's header comment for details and what to check if they stop working.

## Contributing

This is a personal project for Aquatic Park and La Jolla Cove swimmers. Contributions, suggestions, and bug reports are welcome!

## Disclaimer

**⚠️ Important Safety Notice**

This tool provides informational data only and should NOT be used as the sole basis for swimming decisions. Always:

- Assess conditions personally before entering the water
- Swim with a buddy
- Follow local safety guidelines and posted warnings
- Be aware of your swimming ability and limitations
- Understand that open water swimming carries inherent risks
- Check with local authorities for beach closures or advisories

The developers assume no liability for decisions made based on this application.

## License

MIT License - See LICENSE file for details

## Contact

For questions or suggestions about swimming conditions at Aquatic Park or La Jolla Cove, feel free to open an issue.

---

**Happy Swimming! 🏊‍♂️🌊**
