# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swimmingly is a Next.js web application that provides real-time swim condition assessments for Aquatic Park in San Francisco Bay. It aggregates data from multiple sources (NOAA, SF Open Data, CDEC, etc.) and calculates a comprehensive swim score based on water quality, tides, currents, waves, weather, and upstream dam releases.

## Development Commands

```bash
# Development
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint

# Database (optional - app works without database)
npx prisma generate  # Generate Prisma client
npx prisma db push   # Sync schema to database
npx prisma studio    # Open Prisma Studio GUI

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
- Supports customizable tide preferences via query parameter: `?tidePhasePreference=slack|flood|ebb`
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

**Customizable Tide Preferences**: Users can prefer slack, flood, or ebb tides. The algorithm adjusts scoring to favor the preferred tide phase while still penalizing strong currents.

**Dam Release Time-Lag Modeling**: Uses 48-hour historical flow data with weighted averaging (60% last 24h, 40% older 24h) to account for the 24-48 hour transit time from upstream dams to SF Bay.

All thresholds are configured in `src/config/thresholds.ts` and can be adjusted based on local conditions or swimmer experience levels.

### Data Sources & API Clients

Each external data source has a dedicated client in `src/lib/api/`:

- **`noaa.ts`**: Tide predictions, weather forecasts, wave buoy data, current measurements
- **`beachwatch.ts`**: SF Beach Water Quality Monitoring (primary water quality source)
  - Locations: BAY#211_SL (Aquatic Park) and BAY#210.1_SL (Hyde Street Pier)
  - Uses most recent data from either location
- **`sfpuc.ts`**: Sewer overflow events from SF Open Data
- **`cdec.ts`**: Dam release data from California Data Exchange Center
  - Monitors: Shasta, Oroville, Folsom, Pardee, Camanche dams
  - Fetches 48 hours of hourly flow data for time-lag modeling
- **`open-meteo.ts`**: Weather backup (wind speed, gusts, temperature)
- **`openwaterlog.ts`**: Primary wave data source, falls back to NOAA buoy if unavailable

Station IDs and coordinates are centralized in `src/config/aquatic-park.ts`.

### Database Schema (Optional)

The Prisma schema (`prisma/schema.prisma`) is designed for TimescaleDB time-series optimization. Key models:

- **Time-series data**: `TideData`, `CurrentData`, `WeatherData`, `WaveData`, `WaterQuality`, `SSOEvent`
- **Calculated scores**: `SwimScore` (stores historical score calculations)
- **Aggregates**: `HourlyAggregate`, `DailySummary` (for historical analysis)
- **Routes**: `SwimmingRoute` (predefined swimming routes with GeoJSON)

**Important**: Database is optional for development. The app works entirely via direct API calls without database setup.

### Client-side Caching Strategy

Custom React hooks in `src/hooks/` implement localStorage-based caching:

- **`useConditionsCache.ts`**: Caches full conditions data (5-minute TTL)
- **`useWaveDataCache.ts`**: Caches wave-specific data
- **`useTidePreference.ts`**: Persists user's tide phase preference

This reduces API calls and improves UX by showing cached data while fetching updates.

### Configuration Files

- **`src/config/aquatic-park.ts`**: Location coordinates, NOAA station IDs, buoy IDs
- **`src/config/routes.ts`**: Predefined swimming routes (GeoJSON LineStrings)
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
# Optional - app works without database
DATABASE_URL="postgresql://user:password@localhost:5432/swimmingly"
REDIS_URL="redis://localhost:6379"

# Required for map features (get free keys from mapbox.com)
MAPBOX_PUBLIC_KEY="pk.your_key_here"
MAPBOX_SECRET_KEY="sk.your_key_here"
```

**Note**: The app is fully functional without any environment variables for basic development. All data APIs are public and require no authentication.

## Testing API Endpoints

```bash
# Current conditions (with custom tide preference)
curl "http://localhost:3000/api/conditions?tidePhasePreference=slack"

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

### Working with Time-Series Data

The Prisma schema uses TimescaleDB-optimized indexes:
- All time-series models have `@@index([timestamp])`
- Use `HourlyAggregate` and `DailySummary` for historical analysis
- Consider implementing TimescaleDB continuous aggregates for production

## Important Caveats

- **This project was "heavily vibe coded"** (per README) - code may prioritize working functionality over perfect architecture
- Database is optional for development but recommended for production to reduce API calls and store historical data
- NOAA APIs are free but rate-limited - implement caching (Redis/localStorage) for production
- Water quality data sources can be unreliable - always show data freshness timestamps to users
- Dam release time-lag modeling uses rough estimates (24-48 hours) - actual transit times vary by water flow and dam location
