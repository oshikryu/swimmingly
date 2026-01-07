# Quick Setup Guide

## Development Setup

### 1. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Testing the Application

The application will work immediately without any database setup. It fetches data directly from:
- NOAA APIs (tides, weather, waves) - **No API key required**
- SF PUC Open Data (sewer overflows) - **No API key required**

**Note**: The water quality API integration uses placeholder data. You'll need to integrate with the actual CA Beach Watch API or SF Bay water quality monitoring API for real bacteria count data.

### 3. Optional: Set Up Database

For storing historical data and improving performance:

```bash
# Install PostgreSQL locally or use a cloud provider
# Update DATABASE_URL in .env.local

# Generate Prisma client
npx prisma generate

# Create database tables
npx prisma db push

# View database in Prisma Studio
npx prisma studio
```

### 4. Optional: Add Mapbox for Maps

For the interactive map feature (future enhancement):

1. Sign up at [mapbox.com](https://mapbox.com) (free tier available)
2. Get your API keys
3. Add to `.env.local`:
   ```
   MAPBOX_PUBLIC_KEY="pk.your_key_here"
   MAPBOX_SECRET_KEY="sk.your_key_here"
   ```

## Testing API Endpoints

### Current Conditions
```bash
curl http://localhost:3000/api/conditions
```

### Tide Predictions (next 48 hours)
```bash
curl http://localhost:3000/api/tides?hours=48
```

### Weather Forecast
```bash
curl http://localhost:3000/api/weather
```

### Wave Data
```bash
curl http://localhost:3000/api/waves
```

## Common Issues

### Port 3000 Already in Use
```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run dev
```

### NOAA API Rate Limiting
The NOAA APIs are free but have rate limits. If you encounter rate limiting:
- Implement Redis caching (see `.env.example`)
- Increase cache TTLs in API routes
- Add exponential backoff in API clients

### TypeScript Errors
```bash
# Check for errors without building
npm run lint
npx tsc --noEmit
```

## Next Features to Build

1. **Forecast Timeline**: Show optimal swim windows in the next 48 hours
2. **Interactive Map**: Display swimming routes on a Mapbox map
3. **Historical Charts**: Show best times to swim based on historical data
4. **Notifications**: Email/SMS alerts when conditions are excellent
5. **User Preferences**: Customize thresholds based on experience level

## File Overview

### Most Important Files
- `src/lib/api/noaa.ts` - Fetches tide, weather, wave data
- `src/lib/algorithms/swim-score.ts` - Calculates swim safety score
- `src/app/api/conditions/route.ts` - Main API that orchestrates all data
- `src/components/dashboard/CurrentConditions.tsx` - Main UI component
- `src/config/thresholds.ts` - Safety thresholds and scoring weights

### Configuration
- `src/config/aquatic-park.ts` - Location coordinates and NOAA station IDs
- `src/config/routes.ts` - Predefined swimming routes (GeoJSON)
- `src/config/thresholds.ts` - Safety thresholds for scoring

### Data Flow
```
NOAA/SFPUC APIs → API Routes → Calculate Score → Cache → UI Components → User
                      ↓
                  PostgreSQL (optional)
```

## Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Docker
```bash
# Build image
docker build -t swimmingly .

# Run container
docker run -p 3000:3000 swimmingly
```

## Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Share with other Aquatic Park swimmers!

## Safety Reminder

This app is for informational purposes only. Always assess conditions personally before swimming and follow local safety guidelines.
