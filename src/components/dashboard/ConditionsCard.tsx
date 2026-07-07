'use client';

import { STATUS_PALETTE, isEmphasized, type CardStatus } from '@/lib/status-colors';

export interface ThresholdSegment {
  label: string;
  value: string;
  status: CardStatus;
}

export type DetailItem = string | { text: string; status?: CardStatus };

interface ConditionsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  threshold?: string;
  thresholds?: ThresholdSegment[];
  status?: CardStatus;
  details?: DetailItem[];
  icon?: string;
}

export default function ConditionsCard({
  title,
  value,
  unit,
  secondaryValue,
  secondaryUnit,
  threshold,
  thresholds,
  status = 'info',
  details,
  icon,
}: ConditionsCardProps) {
  return (
    <div className={`rounded-lg border-2 p-4 ${STATUS_PALETTE[status].card}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </h3>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>

      <div className={`text-3xl font-bold ${STATUS_PALETTE[status].text}`}>
        {value}
        {unit && <span className="text-xl ml-1">{unit}</span>}
        {secondaryValue !== undefined && (
          <>
            <span className="text-xl mx-2 text-gray-400">|</span>
            {secondaryValue}
            {secondaryUnit && <span className="text-xl ml-1">{secondaryUnit}</span>}
          </>
        )}
      </div>

      {thresholds && thresholds.length > 0 && (
        <div className="mt-1 text-xs flex flex-wrap gap-x-1">
          {thresholds.map((t, idx) => (
            <span
              key={idx}
              className={`${STATUS_PALETTE[t.status].badge}${isEmphasized(t.status) ? ' font-semibold' : ''}`}
            >
              {t.label} {t.value}{idx < thresholds.length - 1 ? ',' : ''}
            </span>
          ))}
        </div>
      )}
      {threshold && !thresholds && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {threshold}
        </div>
      )}

      {details && details.length > 0 && (
        <ul className="mt-3 space-y-1">
          {details.map((item, idx) => {
            const detail = typeof item === 'string' ? item : item.text;
            const itemStatus = typeof item === 'string' ? undefined : item.status;

            // Check if detail contains a URL (starts with 🔗 and has https://)
            const urlMatch = detail.match(/🔗\s*(https?:\/\/[^\s]+)/);

            if (urlMatch) {
              const url = urlMatch[1];
              return (
                <li key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                  🔗{' '}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {url}
                  </a>
                </li>
              );
            }

            const colorClass = itemStatus ? STATUS_PALETTE[itemStatus].badge : 'text-gray-600 dark:text-gray-400';
            const weightClass = isEmphasized(itemStatus) ? ' font-semibold' : '';

            return (
              <li key={idx} className={`text-xs ${colorClass}${weightClass}`}>
                {detail}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
