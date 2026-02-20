export type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

export type ProfileData = {
  user: {
    id: string;
    credits: number;
    materialA: number;
    materialB: number;
    officeLevel: number;
    lastLoginAt: string;
  };
  offlineReward: {
    elapsedAppliedSeconds: number;
    rewardGranted: number;
    baseRatePerSec: number;
    capSeconds: number;
  };
};

export type OfferCard = {
  slotIndex: number;
  templateId: string;
  name: string;
  grade: number;
  roleTag: string;
  recruitCostCredits: number;
  traitLine: string;
  expiresAt: string;
};

export type MercenaryView = {
  id: string;
  templateId: string;
  name: string;
  grade: number;
  roleTag: string;
  level: number;
  exp: number;
  promotionRoute?: string | null;
  promotionBonus: number;
  isDispatched: boolean;
  power: number;
  traitLine: string;
};

export type LocationRow = {
  locationId: string;
  name: string;
  difficulty: number;
  dispatchSeconds: number;
  baseCreditReward: number;
  baseExpReward: number;
  materialAReward: number;
  materialBReward: number;
};

export type DispatchStatus = {
  id: string;
  locationId: string;
  endAt: string;
  status: string;
  remainsSeconds: number;
  claimable: boolean;
  successChance: number;
};

export type PromotionJob = {
  id: string;
  mercenaryId: string;
  route: string;
  gradeFrom: number;
  gradeTo: number;
  endAt: string;
  status: string;
};

export type Recipe = {
  recipeId: string;
  resultEquipType: string;
  resultGrade: number;
  statValue: number;
  costCredits: number;
  costMaterialA: number;
  costMaterialB: number;
  craftSeconds: number;
};

export type CraftJob = {
  id: string;
  recipeId: string;
  resultEquipType: string;
  resultGrade: number;
  resultStatValue: number;
  endAt: string;
  status: string;
};

export type Equipment = {
  id: string;
  type: string;
  grade: number;
  statValue: number;
  equippedMercId?: string | null;
  slotIndex?: number | null;
};
