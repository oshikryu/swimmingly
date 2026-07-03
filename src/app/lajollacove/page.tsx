import type { Metadata } from 'next';
import Link from 'next/link';
import CurrentConditions from '@/components/dashboard/CurrentConditions';
import HeaderTimestamp from '@/components/HeaderTimestamp';

export const metadata: Metadata = {
  title: 'Swimmingly - La Jolla Cove Swim Planner',
  description: 'Determine optimal swimming times at La Jolla Cove in San Diego',
};

const LA_JOLLA_COVE_UI_CONFIG = {
  apiPath: '/api/lajollacove/conditions',
  cacheKeyPrefix: 'lajollacove',
  tideStationId: '9410230',
  waterTempSourceUrl: 'https://tidesandcurrents.noaa.gov/met.html?id=9410230',
  sdBeachInfoSiteId: '105',
};

export default function LaJollaCove() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                Swimmingly
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                La Jolla Cove, San Diego
              </p>
              <Link
                href="/"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
              >
                ← Aquatic Park, San Francisco Bay
              </Link>
            </div>
            <HeaderTimestamp />
          </div>
        </div>
      </header>

      {/* Static Mode Banner */}
      {process.env.NEXT_PUBLIC_BUILD_MODE === 'static' && (
        <div className="bg-blue-100 dark:bg-blue-900/30 border-b-2 border-blue-300 dark:border-blue-700 py-3">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-blue-800 dark:text-blue-200">
              📸 <strong>Static Snapshot</strong> - This is a cached version updated every 15 minutes.{' '}
              {process.env.NEXT_PUBLIC_MAIN_SITE_URL && (
                <>
                  For live data, visit{' '}
                  <a
                    href={process.env.NEXT_PUBLIC_MAIN_SITE_URL}
                    className="underline hover:text-blue-600 dark:hover:text-blue-300 font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    the main site
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CurrentConditions location={LA_JOLLA_COVE_UI_CONFIG} />

        {/* Disclaimer */}
        <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-400">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>Disclaimer:</strong> This tool provides informational data only and should not be used as the sole basis for swimming decisions. Always assess conditions personally, swim with a buddy, and follow local safety guidelines. Open water swimming carries inherent risks.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Data sources: NOAA (tides, waves, water temp, wind) • San Diego County DEHQ (bacteria) • Open-Meteo (wind, rainfall)
          </p>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-1">
            {process.env.NEXT_PUBLIC_BUILD_MODE === 'static'
              ? 'Static snapshot — updated every 15 minutes'
              : 'Auto-refreshes every 5 minutes • API cached for 5 minutes'}
          </p>
        </div>
      </footer>
    </div>
  );
}
