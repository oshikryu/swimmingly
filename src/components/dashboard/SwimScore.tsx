'use client';

import type { SwimScore as SwimScoreType, TidePhaseType } from '@/types/conditions';
import { SCORE_RANGES } from '@/config/thresholds';
import TidePhaseToggle from './TidePhaseToggle';

interface SwimScoreProps {
  score: SwimScoreType;
  tidePreference: TidePhaseType;
  onTidePreferenceChange: (preference: TidePhaseType) => void;
  isPreferenceLoaded: boolean;
}

export default function SwimScore({
  score,
  tidePreference,
  onTidePreferenceChange,
  isPreferenceLoaded
}: SwimScoreProps) {
  const { overallScore, rating, warnings, recommendations } = score;

  // Get color based on rating
  const scoreRange = SCORE_RANGES[rating];
  const color = scoreRange.color;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        Current Swim Score
      </h2>

      {/* Score Circle */}
      <div className="flex items-center justify-center mb-6">
        <div
          className="relative w-48 h-48 rounded-full flex items-center justify-center"
          style={{
            background: `conic-gradient(${color} ${overallScore}%, #e5e7eb ${overallScore}%)`,
          }}
        >
          <div className="absolute w-40 h-40 bg-white dark:bg-gray-800 rounded-full flex flex-col items-center justify-center">
            <div className="text-5xl font-bold" style={{ color }}>
              {overallScore}
            </div>
            <div className="text-lg font-semibold mt-1 text-gray-600 dark:text-gray-400 uppercase">
              {rating}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
            Recommendations
          </h3>
          <ul className="space-y-1">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="text-sm text-green-700 dark:text-green-400 flex items-start">
                <span className="mr-2">✓</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
            Warnings
          </h3>
          <ul className="space-y-1">
            {warnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-red-700 dark:text-red-400 flex items-start">
                <span className="mr-2">⚠</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tide Phase Preference Toggle */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <TidePhaseToggle
          preference={tidePreference}
          onChange={onTidePreferenceChange}
          isLoading={!isPreferenceLoaded}
        />
      </div>

      {/* Timestamp */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Last updated: {new Date(score.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
