export const ECONOMY_CONFIG = {
  offline: {
    capSeconds: 8 * 60 * 60,
    baseRatePerSec: 1,
  },
  gradeMultiplier: {
    1: 1.0,
    2: 1.3,
    3: 1.6,
  } as Record<number, number>,
  levelPowerScale: 0.05,
  dispatchChanceCap: 0.95,
  maxPartySize: 3,
  offerDefaultCount: 4,
} as const;
