'use client';

import type { TidePhaseType } from '@/types/conditions';

interface TidePreferenceSliderProps {
  preference: TidePhaseType;
  onChange: (phase: TidePhaseType) => void;
  isLoading?: boolean;
}

const PHASES: TidePhaseType[] = ['ebb', 'slack', 'flood'];
const PHASE_LABELS: Record<TidePhaseType, string> = {
  ebb: 'Ebb',
  slack: 'Slack',
  flood: 'Flood',
};
const PHASE_DESCRIPTIONS: Record<TidePhaseType, string> = {
  ebb: 'Outgoing tide',
  slack: 'Minimal movement',
  flood: 'Incoming tide',
};

export default function TidePreferenceSlider({ preference, onChange, isLoading = false }: TidePreferenceSliderProps) {
  const currentIndex = PHASES.indexOf(preference);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    onChange(PHASES[idx]);
  };

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

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {PHASE_DESCRIPTIONS[preference]}
      </p>

      <div className={`${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={currentIndex}
          onChange={handleChange}
          className="tide-slider w-full"
          disabled={isLoading}
        />
        <div className="flex justify-between mt-1">
          {PHASES.map((phase, idx) => (
            <span
              key={phase}
              className={`text-xs font-medium cursor-pointer select-none ${
                idx === currentIndex
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
              onClick={() => !isLoading && onChange(phase)}
            >
              {PHASE_LABELS[phase]}
            </span>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        Your preference is saved locally and affects your swim score
      </div>
    </div>
  );
}
