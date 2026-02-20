import crypto from "node:crypto";
import type { Equipment, Mercenary } from "@prisma/client";
import { ECONOMY_CONFIG } from "../config/economy.js";
import { dataRegistry, weightedPick } from "../data/registry.js";

export function calcMercPower(merc: Mercenary, baseStat: number, equipBonus: number): number {
  const gradeMul = ECONOMY_CONFIG.gradeMultiplier[merc.grade] ?? 1;
  const p =
    baseStat *
    (1 + merc.level * ECONOMY_CONFIG.levelPowerScale) *
    gradeMul *
    (1 + merc.promotionBonus) *
    (1 + equipBonus);
  return Math.max(1, Math.floor(p));
}

export function calcEquipBonus(equipments: Equipment[]): number {
  const total = equipments.reduce((s, e) => s + e.statValue, 0);
  return total / 100;
}

export function calcDispatchChance(partyPower: number, difficulty: number): number {
  const chance = partyPower / (difficulty * 100);
  return Math.min(ECONOMY_CONFIG.dispatchChanceCap, Math.max(0.05, chance));
}

export function levelUpWithExp(level: number, exp: number, earnedExp: number): { level: number; exp: number } {
  let currentLevel = level;
  let currentExp = exp + earnedExp;

  while (true) {
    const need = dataRegistry.getExpToNext(currentLevel);
    if (currentExp < need) break;
    if (need >= Number.MAX_SAFE_INTEGER / 2) break;
    currentExp -= need;
    currentLevel += 1;
  }

  return { level: currentLevel, exp: currentExp };
}

export function makeSeed(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function createOfferTemplateId(minGrade: number, maxGrade: number): string {
  const candidates = dataRegistry.characters.filter((c) => c.grade >= minGrade && c.grade <= maxGrade);
  if (candidates.length < 1) {
    throw new Error(`no character candidate for grade range ${minGrade}-${maxGrade}`);
  }
  return weightedPick(candidates, (r) => r.recruitWeight).templateId;
}
