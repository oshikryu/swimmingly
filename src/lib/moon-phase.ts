import type { MoonPhaseData } from '@/types/conditions';

// Known new moon reference: January 6, 2000 at 18:14 UTC
// Julian Day Number: 2451550.259
const REFERENCE_NEW_MOON_JDN = 2451550.259;
const SYNODIC_MONTH = 29.53059; // days

function dateToJDN(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

const PHASE_MAP: Array<{ name: string; emoji: string }> = [
  { name: 'New Moon',        emoji: '🌑' }, // 0.000–0.063
  { name: 'Waxing Crescent', emoji: '🌒' }, // 0.063–0.188
  { name: 'First Quarter',   emoji: '🌓' }, // 0.188–0.313
  { name: 'Waxing Gibbous',  emoji: '🌔' }, // 0.313–0.438
  { name: 'Full Moon',       emoji: '🌕' }, // 0.438–0.563
  { name: 'Waning Gibbous',  emoji: '🌖' }, // 0.563–0.688
  { name: 'Last Quarter',    emoji: '🌗' }, // 0.688–0.813
  { name: 'Waning Crescent', emoji: '🌘' }, // 0.813–0.938
];

export function calculateMoonPhase(date: Date): MoonPhaseData {
  const jdn = dateToJDN(date);
  let cyclePosition = (jdn - REFERENCE_NEW_MOON_JDN) % SYNODIC_MONTH;
  if (cyclePosition < 0) cyclePosition += SYNODIC_MONTH;
  const phase = cyclePosition / SYNODIC_MONTH; // 0.0–1.0

  // 8 equal segments of 0.125 each; index based on which octant phase falls in
  const segmentIndex = Math.min(7, Math.floor(phase * 8));
  const { name: phaseName, emoji: phaseEmoji } = PHASE_MAP[segmentIndex];

  // Illumination: 0% at new moon, 100% at full moon
  const illuminationPercent = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100);

  // Spring tide: within ±2 days of new moon (phase ~0) or full moon (phase ~0.5)
  // ±2 days / 29.53 days = ±0.068 of the cycle
  const isSpringTide = phase < 0.068 || (phase > 0.466 && phase < 0.534) || phase > 0.932;

  // Neap tide: within ±2 days of first quarter (phase ~0.25) or last quarter (phase ~0.75)
  const isNeapTide = (phase > 0.216 && phase < 0.284) || (phase > 0.716 && phase < 0.784);

  return {
    phase,
    phaseName,
    phaseEmoji,
    isSpringTide,
    isNeapTide,
    illuminationPercent,
  };
}
