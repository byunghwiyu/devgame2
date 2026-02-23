import path from "node:path";
import { asFloat, asInt, parseCsvFile } from "../utils/csv.js";

function normalizeImagePath(v: string, fallbackDir: "mercs" | "monsters"): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const withRoot = raw.startsWith("/") ? raw : `/assets/illustrations/${fallbackDir}/${raw}`;
  const hasExt = /\.[a-z0-9]+$/i.test(withRoot);
  return hasExt ? withRoot : `${withRoot}.png`;
}


export type CharacterTemplate = {
  templateId: string;
  name: string;
  grade: number;
  roleTag: string;
  baseStat: number;
  recruitCostCredits: number;
  recruitWeight: number;
  traitLine: string;
  imageUrl: string;
};

export type OfficeLevelRow = {
  officeLevel: number;
  offerResetSeconds: number;
  minGrade: number;
  maxGrade: number;
  offerCount: number;
  rerollCostCredits: number;
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

export type CombatUnitRow = {
  entityType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE";
  entityId: string;
  name: string;
  attackRangeType: "melee" | "ranged";
  damageType: "physical" | "magic" | "chaos";
  maxHp: number;
  maxMana: number;
  stamina: number;
  agility: number;
  intelligence: number;
  strength: number;
  attack: number;
  defense: number;
  evasion: number;
  critChance: number;
  critDamage: number;
  lifeSteal: number;
  counter: number;
  hpRegen: number;
  thornPhysical: number;
  thornMagical: number;
  expGain: number;
  healPower: number;
  spriteUrl: string;
  spriteIdle?: string;
  spriteAttack?: string;
  spriteFrameWidth?: number;
  spriteFrameHeight?: number;
  spriteIdleFrames?: number;
  spriteAttackFrames?: number;
  spriteIdleFps?: number;
  spriteAttackFps?: number;
  spritePivotX?: number;
  spritePivotY?: number;
  spriteIdleIndexList?: number[];
  spriteAttackIndexList?: number[];
  spriteAtlasKey?: string;
};

export type CombatSkillRow = {
  ownerType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE";
  ownerId: string;
  skillId: string;
  skillName: string;
  kind: "passive" | "active";
  effectType:
    | "attack_pct"
    | "defense_pct"
    | "evasion_pct"
    | "crit_pct"
    | "life_steal_pct"
    | "heal_power_pct"
    | "hp_regen_flat"
    | "thorn_magical_flat"
    | "damage"
    | "aoe_damage"
    | "heal_lowest";
  value1: number;
};

export type LocationWaveRow = {
  locationId: string;
  waveIndex: number;
  monsterTemplateId: string;
  count: number;
};

export type FieldStageRuleRow = {
  locationId: string;
  battleStageWeight: number;
  exploreStageWeight: number;
  bossEveryStageClears: number;
  hiddenEveryStageClears: number;
  hiddenEnterChance: number;
};

export type FieldStageEncounterRow = {
  locationId: string;
  stageType: "BATTLE" | "BOSS" | "HIDDEN";
  encounterId: string;
  weight: number;
  monsterTemplateId: string;
  count: number;
};

export type DefineRow = {
  key: string;
  value: number;
  description: string;
};

export type MonsterDropRow = {
  monsterTemplateId: string;
  itemId: string;
  itemName: string;
  dropRate: number;
  equipType: "weapon" | "armor" | "accessory" | "extra";
  grade: number;
  statValue: number;
};

export type TalentRow = {
  talentTag: string;
  name: string;
  description: string;
  rollWeight: number;
  hpPct: number;
  staminaPct: number;
  agilityPct: number;
  intelligencePct: number;
  strengthPct: number;
  attackPct: number;
  defensePct: number;
};

export type LevelCurveRow = { level: number; expToNext: number };

export type PromotionRule = {
  gradeFrom: number;
  gradeTo: number;
  requiredLevel: number;
  timeSeconds: number;
  costCredits: number;
  route: "A" | "B";
  multiplierBonus: number;
};

export type RecipeRow = {
  recipeId: string;
  resultEquipType: "weapon" | "armor" | "accessory" | "extra";
  resultGrade: number;
  statValue: number;
  costCredits: number;
  costMaterialA: number;
  costMaterialB: number;
  craftSeconds: number;
};

class DataRegistry {
  characters: CharacterTemplate[] = [];
  officeLevels: OfficeLevelRow[] = [];
  locations: LocationRow[] = [];
  levelCurve: LevelCurveRow[] = [];
  promotionRules: PromotionRule[] = [];
  recipes: RecipeRow[] = [];
  combatUnits: CombatUnitRow[] = [];
  combatSkills: CombatSkillRow[] = [];
  locationWaves: LocationWaveRow[] = [];
  fieldStageRules: FieldStageRuleRow[] = [];
  fieldStageEncounters: FieldStageEncounterRow[] = [];
  defineTable: DefineRow[] = [];
  monsterDrops: MonsterDropRow[] = [];
  talents: TalentRow[] = [];

  private loaded = false;

  loadAll(): void {
    const dataDir = path.join(process.cwd(), "..", "data");

    this.characters = parseCsvFile(path.join(dataDir, "characters.csv")).map((r) => ({
      templateId: r.templateId,
      name: r.name,
      grade: asInt(r.grade),
      roleTag: r.roleTag,
      baseStat: asInt(r.baseStat),
      recruitCostCredits: asInt(r.recruitCostCredits),
      recruitWeight: asInt(r.recruitWeight),
      traitLine: r.traitLine,
      imageUrl: normalizeImagePath(r.imageUrl ?? "", "mercs"),
    }));

    this.officeLevels = parseCsvFile(path.join(dataDir, "office_level.csv")).map((r) => ({
      officeLevel: asInt(r.officeLevel),
      offerResetSeconds: asInt(r.offerResetSeconds),
      minGrade: asInt(r.minGrade),
      maxGrade: asInt(r.maxGrade),
      offerCount: asInt(r.offerCount),
      rerollCostCredits: asInt(r.rerollCostCredits),
    }));

    this.locations = parseCsvFile(path.join(dataDir, "locations.csv")).map((r) => ({
      locationId: r.locationId,
      name: r.name,
      difficulty: asInt(r.difficulty),
      dispatchSeconds: asInt(r.dispatchSeconds),
      baseCreditReward: asInt(r.baseCreditReward),
      baseExpReward: asInt(r.baseExpReward),
      materialAReward: asInt(r.materialAReward),
      materialBReward: asInt(r.materialBReward),
      description: r.description ?? "",
      imageUrl: r.imageUrl ?? "",
      monsters: String(r.monsters ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
      isOpen: String(r.isOpen ?? "1") !== "0",
    }));

    this.levelCurve = parseCsvFile(path.join(dataDir, "level_curve.csv")).map((r) => ({
      level: asInt(r.level),
      expToNext: asInt(r.expToNext),
    }));

    this.promotionRules = parseCsvFile(path.join(dataDir, "promotion_rules.csv")).map((r) => ({
      gradeFrom: asInt(r.gradeFrom),
      gradeTo: asInt(r.gradeTo),
      requiredLevel: asInt(r.requiredLevel),
      timeSeconds: asInt(r.timeSeconds),
      costCredits: asInt(r.costCredits),
      route: (r.route as "A" | "B") || "A",
      multiplierBonus: asFloat(r.multiplierBonus),
    }));

    this.recipes = parseCsvFile(path.join(dataDir, "recipes.csv")).map((r) => ({
      recipeId: r.recipeId,
      resultEquipType: (r.resultEquipType as RecipeRow["resultEquipType"]) || "weapon",
      resultGrade: asInt(r.resultGrade),
      statValue: asInt(r.statValue),
      costCredits: asInt(r.costCredits),
      costMaterialA: asInt(r.costMaterialA),
      costMaterialB: asInt(r.costMaterialB),
      craftSeconds: asInt(r.craftSeconds),
    }));

    this.combatUnits = parseCsvFile(path.join(dataDir, "combat_units.csv")).map((r) => ({
      entityType: r.entityType === "MONSTER_TEMPLATE" ? "MONSTER_TEMPLATE" : "MERC_TEMPLATE",
      entityId: r.entityId,
      name: r.name,
      attackRangeType: r.attackRangeType === "ranged" ? "ranged" : "melee",
      damageType: r.damageType === "magic" ? "magic" : r.damageType === "chaos" ? "chaos" : "physical",
      maxHp: asInt(r.maxHp),
      maxMana: asInt(r.maxMana),
      stamina: asInt(r.stamina),
      agility: asInt(r.agility),
      intelligence: asInt(r.intelligence),
      strength: asInt(r.strength),
      attack: asInt(r.attack),
      defense: asInt(r.defense),
      evasion: asFloat(r.evasion),
      critChance: asFloat(r.critChance),
      critDamage: asFloat(r.critDamage),
      lifeSteal: asFloat(r.lifeSteal),
      counter: asFloat(r.counter),
      hpRegen: asFloat(r.hpRegen),
      thornPhysical: asFloat(r.thornPhysical),
      thornMagical: asFloat(r.thornMagical),
      expGain: asFloat(r.expGain || "1"),
      healPower: asFloat(r.healPower || "1"),
      spriteUrl: normalizeImagePath(r.spriteUrl ?? "", r.entityType === "MONSTER_TEMPLATE" ? "monsters" : "mercs"),
      spriteIdle: String(r.spriteIdle ?? "").trim() || undefined,
      spriteAttack: String(r.spriteAttack ?? "").trim() || undefined,
      spriteFrameWidth: asInt(r.spriteFrameWidth || "0") || undefined,
      spriteFrameHeight: asInt(r.spriteFrameHeight || "0") || undefined,
      spriteIdleFrames: asInt(r.spriteIdleFrames || "0") || undefined,
      spriteAttackFrames: asInt(r.spriteAttackFrames || "0") || undefined,
      spriteIdleFps: asInt(r.spriteIdleFps || "0") || undefined,
      spriteAttackFps: asInt(r.spriteAttackFps || "0") || undefined,
      spritePivotX: String(r.spritePivotX ?? "").trim() === "" ? undefined : asFloat(r.spritePivotX),
      spritePivotY: String(r.spritePivotY ?? "").trim() === "" ? undefined : asFloat(r.spritePivotY),
      spriteIdleIndexList: String(r.spriteIdleIndexList ?? "")
        .split("|")
        .map((v) => asInt(v))
        .filter((v) => Number.isFinite(v) && v >= 0),
      spriteAttackIndexList: String(r.spriteAttackIndexList ?? "")
        .split("|")
        .map((v) => asInt(v))
        .filter((v) => Number.isFinite(v) && v >= 0),
      spriteAtlasKey: String(r.spriteAtlasKey ?? "").trim() || undefined,
    }));

    this.combatSkills = parseCsvFile(path.join(dataDir, "combat_skills.csv")).map((r) => ({
      ownerType: r.ownerType === "MONSTER_TEMPLATE" ? "MONSTER_TEMPLATE" : "MERC_TEMPLATE",
      ownerId: r.ownerId,
      skillId: r.skillId,
      skillName: r.skillName,
      kind: r.kind === "active" ? "active" : "passive",
      effectType: (r.effectType as CombatSkillRow["effectType"]) || "damage",
      value1: asFloat(r.value1),
    }));

    this.locationWaves = parseCsvFile(path.join(dataDir, "location_waves.csv")).map((r) => ({
      locationId: r.locationId,
      waveIndex: asInt(r.waveIndex),
      monsterTemplateId: r.monsterTemplateId,
      count: asInt(r.count),
    }));

    this.fieldStageRules = parseCsvFile(path.join(dataDir, "field_stage_rules.csv")).map((r) => ({
      locationId: r.locationId,
      battleStageWeight: asFloat(r.battleStageWeight || "0.8"),
      exploreStageWeight: asFloat(r.exploreStageWeight || "0.2"),
      bossEveryStageClears: asInt(r.bossEveryStageClears || "100"),
      hiddenEveryStageClears: asInt(r.hiddenEveryStageClears || "20"),
      hiddenEnterChance: asFloat(r.hiddenEnterChance || "0.2"),
    }));

    this.fieldStageEncounters = parseCsvFile(path.join(dataDir, "field_stage_encounters.csv")).map((r) => ({
      locationId: r.locationId,
      stageType: (r.stageType as FieldStageEncounterRow["stageType"]) || "BATTLE",
      encounterId: r.encounterId,
      weight: asFloat(r.weight || "1"),
      monsterTemplateId: r.monsterTemplateId,
      count: asInt(r.count || "1"),
    }));

    this.defineTable = parseCsvFile(path.join(dataDir, "define_table.csv")).map((r) => ({
      key: r.key,
      value: asFloat(r.value),
      description: r.description ?? "",
    }));

    this.monsterDrops = parseCsvFile(path.join(dataDir, "monster_drops.csv")).map((r) => ({
      monsterTemplateId: r.monsterTemplateId,
      itemId: r.itemId,
      itemName: r.itemName,
      dropRate: asFloat(r.dropRate),
      equipType: (r.equipType as MonsterDropRow["equipType"]) || "weapon",
      grade: asInt(r.grade),
      statValue: asInt(r.statValue),
    }));

    this.talents = parseCsvFile(path.join(dataDir, "talents.csv")).map((r) => ({
      talentTag: r.talentTag,
      name: r.name,
      description: r.description ?? "",
      rollWeight: asFloat(r.rollWeight || "1"),
      hpPct: asFloat(r.hpPct || "0"),
      staminaPct: asFloat(r.staminaPct || "0"),
      agilityPct: asFloat(r.agilityPct || "0"),
      intelligencePct: asFloat(r.intelligencePct || "0"),
      strengthPct: asFloat(r.strengthPct || "0"),
      attackPct: asFloat(r.attackPct || "0"),
      defensePct: asFloat(r.defensePct || "0"),
    }));

    this.validate();
    this.loaded = true;

    console.log(
      `[DataRegistry] loaded characters=${this.characters.length}, officeLevels=${this.officeLevels.length}, locations=${this.locations.length}, recipes=${this.recipes.length}, combatUnits=${this.combatUnits.length}, combatSkills=${this.combatSkills.length}, waves=${this.locationWaves.length}`,
    );
  }

  private validate(): void {
    const set = new Set<string>();
    for (const c of this.characters) {
      if (!c.templateId) throw new Error("characters.csv templateId empty");
      if (set.has(c.templateId)) throw new Error(`characters.csv duplicated templateId: ${c.templateId}`);
      if (!c.imageUrl) throw new Error(`characters.csv imageUrl empty: ${c.templateId}`);
      set.add(c.templateId);
    }

    if (!this.officeLevels.every((o) => Number.isFinite(o.offerCount) && o.offerCount > 0)) {
      throw new Error("office_level.csv invalid offerCount");
    }

    if (this.locations.length < 1) {
      throw new Error("locations.csv must have at least one row");
    }
    if (this.locations.some((l) => !l.imageUrl)) {
      throw new Error("locations.csv imageUrl is required");
    }
    if (this.combatUnits.length < 1) throw new Error("combat_units.csv must have rows");
    if (this.combatUnits.some((u) => !u.spriteUrl)) throw new Error("combat_units.csv spriteUrl is required");
    if (this.locationWaves.length < 1) throw new Error("location_waves.csv must have rows");
    if (this.fieldStageRules.length < 1) throw new Error("field_stage_rules.csv must have rows");
    if (this.fieldStageEncounters.length < 1) throw new Error("field_stage_encounters.csv must have rows");
    if (this.monsterDrops.length < 1) throw new Error("monster_drops.csv must have rows");
    if (this.defineTable.length < 1) throw new Error("define_table.csv must have rows");
    if (this.talents.length < 1) throw new Error("talents.csv must have rows");
    const talentSet = new Set<string>();
    for (const t of this.talents) {
      if (!t.talentTag) throw new Error("talents.csv talentTag empty");
      if (talentSet.has(t.talentTag)) throw new Error(`talents.csv duplicated talentTag: ${t.talentTag}`);
      talentSet.add(t.talentTag);
    }
  }

  ensureLoaded(): void {
    if (!this.loaded) this.loadAll();
  }

  getOfficeLevel(level: number): OfficeLevelRow {
    this.ensureLoaded();
    return this.officeLevels.find((r) => r.officeLevel === level) ?? this.officeLevels[0];
  }

  getTemplate(templateId: string): CharacterTemplate {
    this.ensureLoaded();
    const found = this.characters.find((c) => c.templateId === templateId);
    if (!found) throw new Error(`unknown template: ${templateId}`);
    return found;
  }

  getTemplateOrNull(templateId: string): CharacterTemplate | null {
    this.ensureLoaded();
    return this.characters.find((c) => c.templateId === templateId) ?? null;
  }

  getRecipe(recipeId: string): RecipeRow {
    this.ensureLoaded();
    const found = this.recipes.find((r) => r.recipeId === recipeId);
    if (!found) throw new Error(`unknown recipe: ${recipeId}`);
    return found;
  }

  getLocation(locationId: string): LocationRow {
    this.ensureLoaded();
    const found = this.locations.find((r) => r.locationId === locationId);
    if (!found) throw new Error(`unknown location: ${locationId}`);
    return found;
  }

  getCombatUnit(entityType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE", entityId: string): CombatUnitRow {
    this.ensureLoaded();
    const found = this.combatUnits.find((r) => r.entityType === entityType && r.entityId === entityId);
    if (!found) throw new Error(`unknown combat unit: ${entityType}:${entityId}`);
    return found;
  }

  getCombatUnitOrNull(entityType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE", entityId: string): CombatUnitRow | null {
    this.ensureLoaded();
    return this.combatUnits.find((r) => r.entityType === entityType && r.entityId === entityId) ?? null;
  }

  getCombatSkills(ownerType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE", ownerId: string): CombatSkillRow[] {
    this.ensureLoaded();
    return this.combatSkills.filter((r) => r.ownerType === ownerType && r.ownerId === ownerId);
  }

  getLocationWaves(locationId: string): LocationWaveRow[] {
    this.ensureLoaded();
    return this.locationWaves.filter((r) => r.locationId === locationId).sort((a, b) => a.waveIndex - b.waveIndex);
  }

  getFieldStageRule(locationId: string): FieldStageRuleRow {
    this.ensureLoaded();
    return (
      this.fieldStageRules.find((r) => r.locationId === locationId) ??
      this.fieldStageRules[0]
    );
  }

  getFieldStageEncounters(locationId: string, stageType: FieldStageEncounterRow["stageType"]): FieldStageEncounterRow[] {
    this.ensureLoaded();
    return this.fieldStageEncounters.filter((r) => r.locationId === locationId && r.stageType === stageType);
  }

  getDefineValue(key: string, fallback: number): number {
    this.ensureLoaded();
    return this.defineTable.find((r) => r.key === key)?.value ?? fallback;
  }

  getMonsterDrops(monsterTemplateId: string): MonsterDropRow[] {
    this.ensureLoaded();
    return this.monsterDrops.filter((r) => r.monsterTemplateId === monsterTemplateId);
  }

  getTalent(talentTag?: string | null): TalentRow | null {
    this.ensureLoaded();
    if (!talentTag) return null;
    return this.talents.find((t) => t.talentTag === talentTag) ?? null;
  }

  rollTalentTag(): string | null {
    this.ensureLoaded();
    if (this.talents.length < 1) return null;
    const chance = clamp01(this.getDefineValue("talentAssignChance", 0));
    if (Math.random() > chance) return null;
    return weightedPick(this.talents, (t) => t.rollWeight).talentTag;
  }

  getExpToNext(level: number): number {
    this.ensureLoaded();
    return this.levelCurve.find((r) => r.level === level)?.expToNext ?? Number.MAX_SAFE_INTEGER;
  }
}

export const dataRegistry = new DataRegistry();

export function weightedPick<T>(rows: T[], weightOf: (x: T) => number): T {
  const total = rows.reduce((s, r) => s + Math.max(0, weightOf(r)), 0);
  if (total <= 0) return rows[Math.floor(Math.random() * rows.length)];
  let roll = Math.random() * total;
  for (const row of rows) {
    roll -= Math.max(0, weightOf(row));
    if (roll <= 0) return row;
  }
  return rows[rows.length - 1];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}


