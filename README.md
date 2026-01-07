# Swimmingly - Aquatic Park Swim Planner

A Next.js web application that helps swimmers determine optimal swimming times and routes at Aquatic Park in San Francisco Bay by aggregating real-time data on tides, currents, weather, waves, and water quality.

## Features

- **Real-time Conditions Dashboard**: Current swim score and environmental conditions
- **Intelligent Swim Scoring**: Weighted algorithm considering:
  - Water Quality (30%) - Bacteria levels and sewer overflow events
  - Tides & Currents (25%) - Optimal timing for slack tide
  - Waves (20%) - Swell height and period
  - Weather (15%) - Wind, temperature, visibility
  - Visibility (10%) - Safety factor
- **Safety First**: Prominent warnings for poor water quality and dangerous conditions
- **Auto-refresh**: Updates every 5 minutes with fresh data

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM (TimescaleDB ready for time-series data)
- **Styling**: Tailwind CSS
- **Data Sources**:
  - NOAA Tides & Currents API
  - NOAA National Weather Service API
  - NOAA NDBC (Buoy data)
  - SF PUC (Sewer overflow alerts)
  - CA Beach Watch (Water quality)

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
   - Tide phase (slack = best)
   - Current speed
   - Rate of tide change

3. **Waves (20%)**
   - Wave height
   - Swell period
   - Swell direction

4. **Weather (15%)**
   - Wind speed and gusts
   - Air temperature
   - Precipitation

5. **Visibility (10%)**
   - Visual range
   - Safety factor

**Score Ranges:**
- 80-100: Excellent conditions
- 60-79: Good conditions
- 40-59: Fair (experienced swimmers)
- 20-39: Poor (not recommended)
- 0-19: Dangerous (do not swim)

## Safety Thresholds

All thresholds are configured in `src/config/thresholds.ts`:

- **Bacteria**: Safe < 104 MPN/100ml, Advisory < 500, Dangerous > 500
- **Waves**: Calm < 2 ft, Safe < 3 ft, Moderate < 5 ft, Rough < 8 ft
- **Wind**: Calm < 5 mph, Light < 10 mph, Moderate < 15 mph, Strong < 20 mph
- **Current**: Slack < 0.3 kts, Slow < 0.5 kts, Moderate < 1.0 kts, Strong > 1.0 kts
- **SSO**: Caution period = 3 days, Warning period = 7 days

## Development Roadmap

### Current Status ✅
- [x] Project setup with Next.js, TypeScript, Tailwind
- [x] NOAA API client (tides, weather, waves)
- [x] SF PUC API client (sewer overflows)
- [x] Water quality API integration
- [x] Swim score algorithm
- [x] Current conditions dashboard
- [x] Real-time data fetching

### Next Steps 🚀

1. **Forecast View** (Phase 6)
   - 48-hour forecast timeline
   - Optimal swim window detection
   - Hour-by-hour predictions

2. **Interactive Map** (Phase 5)
   - Mapbox integration
   - Swimming route visualization
   - Current flow arrows
   - Route difficulty based on conditions

3. **Historical Analysis** (Phase 7)
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

- **NOAA Tides & Currents**: Tide predictions for Station 9414290 (San Francisco)
- **NOAA National Weather Service**: Point forecast for Aquatic Park coordinates
- **NOAA NDBC**: Wave data from Buoy 46026 (San Francisco Bay)
- **SF Public Utilities Commission**: Sewer overflow alerts via SF Open Data
- **CA Beach Watch**: Water quality monitoring (placeholder - needs API key)

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
