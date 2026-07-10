'use client';

import { useState } from 'react';
import type { ScoreWeights } from '@/types/conditions';

interface FactorScores {
  waterQuality: number;
  tideAndCurrent: number;
  waves: number;
  weather: number;
}

interface ScoreWeightSlidersProps {
  weights: ScoreWeights;
  onChange: (weights: ScoreWeights) => void;
  onReset: () => void;
  isCustom: boolean;
  factorScores: FactorScores;
}

const FACTOR_LABELS: Record<keyof ScoreWeights, string> = {
  waterQuality: 'Water Quality',
  tideAndCurrent: 'Tide & Current',
  waves: 'Waves',
  weather: 'Wind',
};

const FACTOR_ORDER: (keyof ScoreWeights)[] = [
  'waterQuality',
  'tideAndCurrent',
  'waves',
  'weather',
];

/**
 * Redistribute weights proportionally when one slider changes.
 * The changed factor gets its new value; the remaining factors adjust
 * proportionally to their current values to maintain a sum of 100.
 * Rounding correction is applied to the largest remaining factor.
 */
function redistributeWeights(
  current: ScoreWeights,
  changedKey: keyof ScoreWeights,
  newValue: number
): ScoreWeights {
  const otherKeys = FACTOR_ORDER.filter(k => k !== changedKey);
  const otherSum = otherKeys.reduce((s, k) => s + current[k], 0);
  const remaining = 100 - newValue;

  const result = { ...current, [changedKey]: newValue };

  if (otherSum === 0) {
    // All other sliders are 0, distribute evenly
    const each = Math.floor(remaining / otherKeys.length);
    let leftover = remaining - each * otherKeys.length;
    for (const k of otherKeys) {
      result[k] = each + (leftover > 0 ? 5 : 0);
      if (leftover > 0) leftover -= 5;
    }
  } else {
    // Proportional redistribution
    let distributed = 0;
    let largestKey = otherKeys[0];
    let largestVal = 0;

    for (const k of otherKeys) {
      const proportion = current[k] / otherSum;
      const raw = remaining * proportion;
      // Snap to nearest 5
      const snapped = Math.round(raw / 5) * 5;
      result[k] = Math.max(0, Math.min(100, snapped));
      distributed += result[k];
      if (current[k] > largestVal) {
        largestVal = current[k];
        largestKey = k;
      }
    }

    // Apply rounding correction to the largest remaining factor
    const diff = 100 - (newValue + distributed);
    if (diff !== 0) {
      result[largestKey] = Math.max(0, Math.min(100, result[largestKey] + diff));
    }
  }

  return result;
}

export default function ScoreWeightSliders({
  weights,
  onChange,
  onReset,
  isCustom,
  factorScores,
}: ScoreWeightSlidersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSliderChange = (key: keyof ScoreWeights, value: number) => {
    const newWeights = redistributeWeights(weights, key, value);
    onChange(newWeights);
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <span>Customize Score Weights</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="space-y-4 pt-2">
          {FACTOR_ORDER.map(key => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">
                  {FACTOR_LABELS[key]}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{weights[key]}%</span>
                  {' '}
                  <span className="text-gray-400 dark:text-gray-500">
                    (score: {factorScores[key]})
                  </span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[key]}
                onChange={e => handleSliderChange(key, parseInt(e.target.value, 10))}
                className="weight-slider w-full"
              />
            </div>
          ))}

          {isCustom && (
            <button
              onClick={onReset}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
            >
              Reset to Defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}
