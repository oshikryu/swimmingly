'use client';

import { useEffect, useState } from 'react';

export default function HeaderTimestamp() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isStaticMode = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    process.env.NEXT_PUBLIC_BUILD_MODE === 'static'
  );

  useEffect(() => {
    const handleConditionsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.timestamp) {
        setLastUpdated(new Date(detail.timestamp));
      }
    };

    window.addEventListener('conditions-updated', handleConditionsUpdated);

    return () => {
      window.removeEventListener('conditions-updated', handleConditionsUpdated);
    };
  }, []);

  if (!lastUpdated) return null;

  const date = lastUpdated.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const time = lastUpdated.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="text-right">
      <p className="text-sm text-gray-500 dark:text-gray-400">{date}</p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{time}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        Last updated
      </p>
    </div>
  );
}
