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
  talentTag?: string | null;
  talentName?: string | null;
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
  talentTag?: string | null;
  talentName?: string | null;
  talentDescription?: string | null;
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
  description: string;
  imageUrl: string;
  monsters: string[];
  isOpen: boolean;
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

export type BattleUnitView = {
  id: string;
  name: string;
  spriteUrl: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
};

export type BattleConfig = {
  maxPartySize: number;
  teamSlotCount: number;
};

export type BattleState = {
  id: string;
  status: "IN_PROGRESS" | "RETREAT";
  phase: "EXPLORE" | "BATTLE" | "LOOT";
  gaugePercent: number;
  locationId: string;
  locationName: string;
  locationImageUrl: string;
  waveIndex: number;
  allies: BattleUnitView[];
  enemies: BattleUnitView[];
  logs: string[];
  reward: {
    credits: number;
    exp: number;
    materialA: number;
    materialB: number;
  };
  retryCount: number;
  clearCount: number;
  droppedItems: Array<{
    itemId: string;
    itemName: string;
    equipType: string;
    grade: number;
    statValue: number;
  }>;
};
