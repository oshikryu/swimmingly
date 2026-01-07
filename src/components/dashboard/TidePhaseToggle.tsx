/**
 * Tide Phase Preference Toggle Component
 * Allows users to select their preferred tide phase for swim score calculation
 */

'use client';

import type { TidePhaseType } from '@/types/conditions';

interface TidePhaseToggleProps {
  preference: TidePhaseType;
  onChange: (phase: TidePhaseType) => void;
  isLoading?: boolean;
}

const TIDE_PHASES: Array<{
  value: TidePhaseType;
  label: string;
  description: string;
}> = [
  {
    value: 'slack',
    label: 'Slack',
    description: 'Minimal water movement between tides',
  },
  {
    value: 'flood',
    label: 'Flood',
    description: 'Incoming/rising tide',
  },
  {
    value: 'ebb',
    label: 'Ebb',
    description: 'Outgoing/falling tide',
  },
];

export default function TidePhaseToggle({ preference, onChange, isLoading = false }: TidePhaseToggleProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Preferred Tide Phase
        </h3>
        {isLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
        )}
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400">
        Select your preferred tide phase to personalize your swim score
      </p>

      <div className="space-y-2">
        {TIDE_PHASES.map((phase) => (
          <label
            key={phase.value}
            className={`
              flex items-start p-3 rounded-lg border-2 cursor-pointer transition-all
              ${
                preference === phase.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              type="radio"
              name="tide-phase"
              value={phase.value}
              checked={preference === phase.value}
              onChange={(e) => onChange(e.target.value as TidePhaseType)}
              disabled={isLoading}
              className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {phase.label}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {phase.description}
              </p>
            </div>
          </label>
        ))}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        Your preference is saved locally and will affect your swim score calculation
      </div>
    </div>
  );
}
