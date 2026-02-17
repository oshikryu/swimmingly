'use client';

import { useEffect, useState } from 'react';

export default function HeaderTimestamp() {
  const [publishTime, setPublishTime] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const isStaticMode = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    process.env.NEXT_PUBLIC_BUILD_MODE === 'static'
  );

  useEffect(() => {
    setNow(new Date());

    if (!isStaticMode) {
      const timer = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(timer);
    }

    // In static mode, read buildTimestamp from static-data.json
    fetch('/swimmingly/static-data.json')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.buildTimestamp) {
          setPublishTime(data.buildTimestamp);
        }
      })
      .catch(() => {});
  }, [isStaticMode]);

  if (!now) return null;

  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="text-right">
      <p className="text-sm text-gray-500 dark:text-gray-400">{date}</p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{time}</p>
      {isStaticMode && publishTime && (
        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
          Published {formatRelativeTime(new Date(publishTime))}
        </p>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
