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

### `/api/conditions`
Returns current conditions including swim score, tide, weather, waves, and water quality.

**Response:**
```json
{
  "timestamp": "2024-01-06T12:00:00Z",
  "score": {
    "overallScore": 78,
    "rating": "good",
    "factors": { ... },
    "recommendations": [...],
    "warnings": [...]
  },
  "tide": { ... },
  "weather": { ... },
  "waves": { ... },
  "waterQuality": { ... }
}
```

### `/api/tides?hours=48`
Returns tide predictions for the next N hours.

### `/api/weather`
Returns current weather and 72-hour forecast.

### `/api/waves`
Returns current wave and swell data from NOAA buoy.

## Swim Score Algorithm

The swim score (0-100) is calculated using weighted factors:

1. **Water Quality (30%)**
   - Bacteria levels (Enterococcus)
   - Recent sewer overflows
   - Days since last SSO event

2. **Tide & Current (25%)**
   - Tide phase (customizable preference: slack/flood/ebb)
   - Current speed (measured or estimated from tide rate)
   - Rate of tide change

3. **Waves (20%)**
   - Wave height
   - Swell period
   - Swell direction

4. **Weather (15%)**
   - Wind speed and gusts
   - Air temperature
   - Precipitation

5. **Dam Releases (10%)**
   - 48-hour historical flow data from major upstream dams
   - Weighted averaging (60% last 24h, 40% older 24h) to account for time lag
   - Dam releases take 24-48 hours to reach SF Bay
   - Monitors: Shasta, Oroville, Folsom, Pardee, Camanche dams

**Score Ranges:**
- 80-100: Excellent conditions
- 60-79: Good conditions
- 40-59: Fair (experienced swimmers)
- 20-39: Poor (not recommended)
- 0-19: Dangerous (do not swim)

### Dam Release Time-Lag Modeling

The app includes sophisticated modeling of upstream dam releases and their delayed impact on SF Bay currents:

- **Transit Time**: Water released from dams takes 24-48 hours to reach SF Bay
  - Shasta Dam (Sacramento River): 2-5 days
  - Oroville Dam (Feather River): 2-4 days
  - Folsom Dam (American River): 1-3 days

- **48-Hour Historical Window**: Fetches hourly flow data to capture releases currently affecting bay conditions

- **Weighted Scoring**: Recent releases (last 24h) weighted 60%, older releases (24-48h ago) weighted 40%

- **Peak Detection**: Identifies maximum flow in 48h window (at 80% weight) to catch intense but brief releases

- **Trend Analysis**: Compares first 12 hours vs last 12 hours to determine if releases are increasing, stable, or decreasing

This provides swimmers with accurate assessments based on what's actually happening in the bay right now, not just what dams are releasing at this moment.

## Safety Thresholds

All thresholds are configured in `src/config/thresholds.ts`:

- **Bacteria**: Safe < 104 MPN/100ml, Advisory < 500, Dangerous > 500
- **Waves**: Calm < 2 ft, Safe < 3 ft, Moderate < 5 ft, Rough < 8 ft
- **Wind**: Calm < 5 mph, Light < 10 mph, Moderate < 15 mph, Strong < 20 mph
- **Current**: Slack < 0.3 kts, Slow < 0.5 kts, Moderate < 1.0 kts, Strong > 1.0 kts
- **Dam Releases**: Low < 30k CFS, Moderate < 50k CFS, High < 80k CFS, Extreme > 100k CFS
- **SSO**: Caution period = 3 days, Warning period = 7 days

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
