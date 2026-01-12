'use client';

interface ConditionsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  threshold?: string;
  status?: 'good' | 'warning' | 'danger' | 'info';
  details?: string[];
  icon?: string;
}

export default function ConditionsCard({
  title,
  value,
  unit,
  threshold,
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
      </div>

      {threshold && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {threshold}
        </div>
      )}

      {details && details.length > 0 && (
        <ul className="mt-3 space-y-1">
          {details.map((detail, idx) => (
            <li key={idx} className="text-xs text-gray-600 dark:text-gray-400">
              {detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
