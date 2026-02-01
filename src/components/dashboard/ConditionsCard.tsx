'use client';

export interface ThresholdSegment {
  label: string;
  value: string;
  status: 'good' | 'warning' | 'danger' | 'info';
}

interface ConditionsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  threshold?: string;
  thresholds?: ThresholdSegment[];
  status?: 'good' | 'warning' | 'danger' | 'info';
  details?: string[];
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
  const statusColors = {
    good: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
    warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    danger: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  };

  const textColors = {
    good: 'text-green-800 dark:text-green-200',
    warning: 'text-yellow-800 dark:text-yellow-200',
    danger: 'text-red-800 dark:text-red-200',
    info: 'text-blue-800 dark:text-blue-200',
  };

  const thresholdTextColors = {
    good: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    danger: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </h3>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>

      <div className={`text-3xl font-bold ${textColors[status]}`}>
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
            <span key={idx} className={thresholdTextColors[t.status]}>
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
          {details.map((detail, idx) => {
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

            return (
              <li key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                {detail}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
