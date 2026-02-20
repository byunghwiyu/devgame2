import path from "node:path";
import { asFloat, asInt, parseCsvFile } from "../utils/csv.js";

export type CharacterTemplate = {
  templateId: string;
  name: string;
  grade: number;
  roleTag: string;
  baseStat: number;
  recruitCostCredits: number;
  recruitWeight: number;
  traitLine: string;
  upgradePathA: string;
  upgradePathB: string;
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
      upgradePathA: r.upgradePathA,
      upgradePathB: r.upgradePathB,
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

    this.validate();
    this.loaded = true;

    console.log(`[DataRegistry] loaded characters=${this.characters.length}, officeLevels=${this.officeLevels.length}, locations=${this.locations.length}, recipes=${this.recipes.length}`);
  }

  private validate(): void {
    const set = new Set<string>();
    for (const c of this.characters) {
      if (!c.templateId) throw new Error("characters.csv templateId empty");
      if (set.has(c.templateId)) throw new Error(`characters.csv duplicated templateId: ${c.templateId}`);
      set.add(c.templateId);
    }

    if (!this.officeLevels.every((o) => Number.isFinite(o.offerCount) && o.offerCount > 0)) {
      throw new Error("office_level.csv invalid offerCount");
    }

    if (this.locations.length < 1) {
      throw new Error("locations.csv must have at least one row");
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
