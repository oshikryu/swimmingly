export default function DataNotes() {
  return (
    <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4 rounded">
      <div className="flex">
        <div className="flex-shrink-0">
          <span className="text-blue-400">ℹ️</span>
        </div>
        <div className="ml-3">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
            Understanding the data
          </p>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>
              Wave height shown is &ldquo;significant&rdquo; height (average of the tallest ⅓ of waves) —
              expect occasional peaks 30-70% higher.
            </li>
            <li>
              Wave period matters more than height alone — what matters is the ratio between them.
              A period:height ratio of 2:1 or greater feels comfortable, 3:1 or greater feels smooth and
              rolling; below 2:1 feels steep and jarring, even at the same height.
            </li>
            <li>
              Spring tides (near new/full moon) bring the biggest swings between high and low tide and
              stronger currents. Neap tides (near quarter moons) bring smaller swings and gentler currents.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
