# Swimmingly - Aquatic Park Swim Planner
(Warning: this was heavily vibe coded)

A Next.js web application that helps swimmers determine optimal swimming times and routes at Aquatic Park in San Francisco Bay by aggregating real-time data on tides, currents, weather, waves, and water quality.

<img width="1310" height="1176" alt="Screenshot 2026-01-12 at 10 57 44" src="https://github.com/user-attachments/assets/000eac2f-458a-4c67-a2a6-1846069c54a6" />



## Features

- **Real-time Conditions Dashboard**: Current swim score and environmental conditions
- **Intelligent Swim Scoring**: Weighted algorithm considering:
  - Water Quality (30%) - Bacteria levels and sewer overflow events
  - Tides & Currents (25%) - Optimal timing for slack tide with customizable preferences
  - Waves (20%) - Swell height and period
  - Weather (15%) - Wind, temperature, precipitation
  - Dam Releases (10%) - 48-hour historical flow data accounting for time lag
- **48-Hour Dam Release Tracking**: Monitors upstream dam releases that affect bay currents
- **Safety First**: Prominent warnings for poor water quality and dangerous conditions
- **Auto-refresh**: Updates every 5 minutes with fresh data
- **Customizable Tide Preferences**: Set your preferred tide phase (slack/flood/ebb)

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM (TimescaleDB ready for time-series data)
- **Styling**: Tailwind CSS
- **Data Sources**:
  - NOAA Tides & Currents API
  - NOAA National Weather Service API
  - NOAA NDBC (Buoy data)
  - Open-Meteo (Weather backup)
  - CDEC - California Data Exchange Center (Dam releases)
  - SF Beach Water Quality Monitoring (Primary water quality source - locations BAY#211_SL & BAY#210.1_SL)
  - CA Water Quality Portal (Water quality fallback)
  - SF Open Data (Sewer overflow alerts)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (optional for development)
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   cd /Users/ryuta-m4/projects/swimmingly
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
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
swimmingly/
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── api/           # API routes
│   │   │   ├── conditions/  # Main conditions endpoint
│   │   │   ├── tides/       # Tide predictions
│   │   │   ├── weather/     # Weather data
│   │   │   └── waves/       # Wave/swell data
│   │   └── page.tsx       # Main dashboard page
│   ├── components/        # React components
│   │   └── dashboard/     # Dashboard-specific components
│   ├── lib/              # Core utilities
│   │   ├── api/          # External API clients (NOAA, SFPUC, etc.)
│   │   ├── algorithms/   # Swim score calculation
│   │   └── db.ts         # Database client
│   ├── config/           # Configuration files
│   │   ├── aquatic-park.ts  # Location & station IDs
│   │   ├── routes.ts        # Swimming route definitions
│   │   └── thresholds.ts    # Safety thresholds
│   └── types/            # TypeScript type definitions
├── prisma/
│   └── schema.prisma     # Database schema
└── public/               # Static assets
```

## API Endpoints

### `GET /api/conditions`

Returns current conditions including swim score, tide, weather, waves, water quality, and dam releases.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tidePhasePreference` | `slack` \| `flood` \| `ebb` | `slack` | Preferred tide phase for score calculation |

**Example Request:**
```bash
curl "http://localhost:3000/api/conditions?tidePhasePreference=slack"
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
  "dataFreshness": {
    "tide": "2026-01-15T22:12:00.000Z",
    "weather": "2026-01-15T22:20:05.245Z",
    "waves": "2026-01-15T20:00:00.000Z",
    "waterQuality": "2026-01-12T08:00:00.000Z",
    "sso": "2026-01-15T22:20:05.245Z",
    "damReleases": "2026-01-15T22:20:03.732Z"
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
curl "http://localhost:3000/api/tides?hours=24"
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

Returns current weather and 72-hour forecast from NOAA/Open-Meteo.

**Example Request:**
```bash
curl "http://localhost:3000/api/weather"
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
    "visibilityMiles": 10,
    "conditions": "Partly Cloudy",
    "source": "NOAA-NWS"
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

Returns current wave and swell data from OpenWaterLog or NOAA buoy (fallback).

**Example Request:**
```bash
curl "http://localhost:3000/api/waves"
```

**Response:**
```json
{
  "current": {
    "timestamp": "2026-01-15T20:00:00.000Z",
    "waveHeightFeet": 0.6,
    "swellPeriodSeconds": 12,
    "swellDirection": 285,
    "source": "OpenWaterLog"
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
  "error": "Error message describing what went wrong"
}
```

| Status Code | Description |
|-------------|-------------|
| `500` | Internal server error (API fetch failed) |
| `503` | Service unavailable (data source unavailable) |

## Swim Score Algorithm

The swim score (0-100) is calculated using weighted factors. The algorithm is implemented in `src/lib/algorithms/swim-score.ts`.

### Formula

```
overallScore = (waterQuality × 0.30) + (tideAndCurrent × 0.25) + (waves × 0.20) + (weather × 0.15) + (damReleases × 0.10)
```

### Factor Weights

| Factor | Weight | Priority |
|--------|--------|----------|
| Water Quality | 30% | Highest - Safety first |
| Tide & Current | 25% | Affects difficulty and safety |
| Waves | 20% | Affects comfort and safety |
| Weather | 15% | Affects comfort |
| Dam Releases | 10% | Affects bay currents |

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

### 2. Tide & Current Score (25%)

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

### 4. Weather Score (15%)

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

### 5. Dam Releases Score (10%)

Evaluates upstream dam releases with time-lag modeling.

**Scoring Logic:**

| Weighted Flow (CFS) | Score | Level |
|---------------------|-------|-------|
| < 30,000 | 100 | Low |
| 30,000 - 50,000 | 75 | Moderate |
| 50,000 - 80,000 | 65 | Elevated |
| 80,000 - 100,000 | 30 | High |
| > 100,000 | 10 | Extreme |

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
  "score": 100,
  "totalFlowCFS": 27505,
  "releaseLevel": "low | moderate | high | extreme",
  "topContributor": "Shasta Dam",
  "issues": []
}
```

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
- "Excellent/Good/Fair conditions for swimming"

**Warnings (negative):**
- "Do not swim - dangerous water quality"
- "Water quality warning in effect"
- "Recent sewer overflow - use caution"
- "Strong currents - experienced swimmers only"
- "Dangerous wave conditions"
- "Strong winds present"
- "Extreme dam releases - very strong currents expected"

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

All thresholds are configured in `src/config/thresholds.ts`:

| Category | Threshold | Values |
|----------|-----------|--------|
| Bacteria (Enterococcus) | Safe / Advisory / Dangerous | < 104 / < 500 / > 1000 MPN/100ml |
| Bacteria (Coliform) | Safe / Advisory / Dangerous | < 200 / < 1000 / > 2000 MPN/100ml |
| Waves | Calm / Safe / Moderate / Rough | < 2 / < 3 / < 5 / < 8 ft |
| Wind | Calm / Light / Moderate / Strong | < 5 / < 10 / < 15 / < 20 mph |
| Current | Slack / Slow / Moderate / Strong | < 0.3 / < 0.5 / < 1.0 / < 1.5 kts |
| Dam Releases | Low / Moderate / High / Extreme | < 30k / < 50k / < 80k / > 100k CFS |
| SSO | Caution / Warning | 3 days / 7 days |
| Water Temp | Cold / Cool / Moderate / Comfortable | < 55 / < 60 / < 65 / > 70 °F |

## Development Roadmap

### Current Status ✅
- [x] Project setup with Next.js, TypeScript, Tailwind
- [x] NOAA API client (tides, weather, waves)
- [x] SF Open Data API client (sewer overflows)
- [x] CA Water Quality Portal integration
- [x] CDEC API client (dam releases with 48-hour historical data)
- [x] Open-Meteo weather backup integration
- [x] Swim score algorithm with customizable tide preferences
- [x] Current conditions dashboard
- [x] Real-time data fetching with localStorage caching
- [x] 48-hour dam release tracking with time-lag modeling

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

- **NOAA Tides & Currents**: Tide predictions for Station 9414290 (San Francisco) and current data from Station 9414290
- **NOAA National Weather Service**: Point forecast and observations for Aquatic Park
- **NOAA NDBC**: Wave data from Buoy 46237 (San Francisco offshore) and Buoy 46026 (backup)
- **Open-Meteo**: Weather data backup (wind speed, direction, gusts, air temperature)
- **CDEC (California Data Exchange Center)**: 48 hours of hourly dam release data from Shasta, Oroville, Folsom, Pardee, and Camanche dams
- **SF Beach Water Quality Monitoring** (Primary): Real-time Enterococcus measurements for Aquatic Park (BAY#211_SL) and Hyde Street Pier (BAY#210.1_SL) via SF Gov Open Data API - uses most recent data from either location
- **CA Water Quality Portal** (Fallback): Historical water quality monitoring when SF data unavailable
- **SF Open Data**: Sewer overflow alerts and incident tracking

## Contributing

This is a personal project for Aquatic Park swimmers. Contributions, suggestions, and bug reports are welcome!

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

For questions or suggestions about swimming conditions at Aquatic Park, feel free to open an issue.

---

**Happy Swimming! 🏊‍♂️🌊**
