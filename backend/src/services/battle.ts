import crypto from "node:crypto";
import type { Equipment, Mercenary } from "@prisma/client";
import {
  dataRegistry,
  type CombatSkillRow,
  type CombatUnitRow,
  type FieldStageEncounterRow,
  type FieldStageRuleRow,
  type LocationRow,
  type MonsterDropRow,
  weightedPick,
} from "../data/registry.js";
import { prisma } from "../plugins/prisma.js";
import { calcEquipBonus, levelUpWithExp } from "./game.js";

type Side = "ALLY" | "ENEMY";
type BattleStatus = "IN_PROGRESS" | "RETREAT";
type BattlePhase = "EXPLORE" | "BATTLE" | "LOOT";
type StageType = "BATTLE" | "EXPLORE" | "BOSS" | "HIDDEN";

type RuntimeStats = {
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
  attackRangeType: "melee" | "ranged";
  damageType: "physical" | "magic" | "chaos";
};

type RuntimeCombatant = {
  runtimeId: string;
  side: Side;
  name: string;
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
  sourceType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE";
  sourceId: string;
  mercenaryId?: string;
  hp: number;
  mana: number;
  stats: RuntimeStats;
  skills: CombatSkillRow[];
};

type PendingDrop = {
  itemId: string;
  itemName: string;
  equipType: "weapon" | "armor" | "accessory" | "extra";
  grade: number;
  statValue: number;
};

type CombatEvent = {
  seq: number;
  kind: "hit" | "heal" | "miss" | "skill" | "drop" | "counter";
  attackerId?: string;
  attackerName?: string;
  attackerSide?: Side;
  targetId?: string;
  targetName?: string;
  targetSide?: Side;
  value?: number;
  text: string;
};

type BattleSession = {
  id: string;
  userId: string;
  location: LocationRow;
  stageRule: FieldStageRuleRow;
  partyIds: string[];
  allies: RuntimeCombatant[];
  enemies: RuntimeCombatant[];
  initialAllies: RuntimeCombatant[];
  phase: BattlePhase;
  status: BattleStatus;
  paused: boolean;
  gaugePercent: number;
  updatedAtMs: number;
  startedAtMs: number;
  resultApplied: boolean;
  logs: string[];
  combatEvents: CombatEvent[];
  combatSeq: number;
  stageNo: number;
  currentStageType: StageType;
  clearCount: number;
  retryCount: number;
  totalKills: number;
  killByEnemyId: Record<string, number>;
  pendingDrops: PendingDrop[];
  totalDrops: PendingDrop[];
  stageReward: { credits: number; exp: number; materialA: number; materialB: number };
  totalReward: { credits: number; exp: number; materialA: number; materialB: number };
  attackBuffPct: number;
  defenseBuffPct: number;
  buffBattleStagesLeft: number;
  turnSideNext: Side;
  allyTurnCursor: number;
  enemyTurnCursor: number;
  actionTurn: number;
};

export type BattleStateView = {
  id: string;
  status: BattleStatus;
  paused: boolean;
  phase: BattlePhase;
  gaugePercent: number;
  locationId: string;
  locationName: string;
  locationImageUrl: string;
  waveIndex: number;
  stageType: StageType;
  allies: Array<{
    id: string;
    entityId?: string;
    name: string;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    alive: boolean;
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
  }>;
  enemies: Array<{
    id: string;
    entityId?: string;
    name: string;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    alive: boolean;
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
  }>;
  logs: string[];
  reward: { credits: number; exp: number; materialA: number; materialB: number };
  retryCount: number;
  clearCount: number;
  actionTurn: number;
  droppedItems: Array<{ itemId: string; itemName: string; equipType: string; grade: number; statValue: number }>;
  combatEvents: CombatEvent[];
  report: {
    elapsedSeconds: number;
    clearCount: number;
    retryCount: number;
    gainedExp: number;
    gainedCredits: number;
    materialA: number;
    materialB: number;
    totalKills: number;
    killsByEnemy: Array<{ enemyId: string; enemyName: string; spriteUrl: string; count: number }>;
    expPerSecond: number;
  };
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function alive(list: RuntimeCombatant[]): RuntimeCombatant[] {
  return list.filter((u) => u.hp > 0);
}

function pickLowestHp(list: RuntimeCombatant[]): RuntimeCombatant | undefined {
  const a = alive(list);
  if (a.length < 1) return undefined;
  return a.sort((x, y) => x.hp / x.stats.maxHp - y.hp / y.stats.maxHp)[0];
}

function pushEvent(session: BattleSession, event: Omit<CombatEvent, "seq">): void {
  session.combatSeq += 1;
  session.combatEvents.push({ seq: session.combatSeq, ...event });
  if (session.combatEvents.length > 160) {
    session.combatEvents = session.combatEvents.slice(-160);
  }
}

class BattleService {
  private sessions = new Map<string, BattleSession>();
  private sessionIdsByUser = new Map<string, Set<string>>();

  private async reconcileDispatchState(userId: string): Promise<void> {
    const ids = this.sessionIdsByUser.get(userId);
    const activePartyIds = new Set<string>();
    if (ids) {
      for (const id of ids) {
        const session = this.sessions.get(id);
        if (!session || session.userId !== userId) continue;
        if (session.status !== "IN_PROGRESS") continue;
        for (const pid of session.partyIds) activePartyIds.add(pid);
      }
    }
    await prisma.mercenary.updateMany({ where: { userId }, data: { isDispatched: false } });
    if (activePartyIds.size > 0) {
      await prisma.mercenary.updateMany({
        where: { userId, id: { in: Array.from(activePartyIds) } },
        data: { isDispatched: true },
      });
    }
  }

  async startBattle(userId: string, locationId: string, partyIds: string[]): Promise<BattleStateView> {
    await this.reconcileDispatchState(userId);
    const location = dataRegistry.getLocation(locationId);
    if (!location.isOpen) throw new Error("LOCATION_NOT_OPEN");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.officeLevel < location.difficulty) throw new Error("LOCATION_LOCKED_BY_LEVEL");

    const mercs = await prisma.mercenary.findMany({ where: { userId, id: { in: partyIds } } });
    if (mercs.length !== partyIds.length) throw new Error("INVALID_PARTY_MEMBERS");
    if (mercs.some((m) => m.isDispatched)) throw new Error("MERC_ALREADY_DISPATCHED");
    if (partyIds.length > 4) throw new Error("PARTY_LIMIT_EXCEEDED");

    const equips = await prisma.equipment.findMany({ where: { userId, equippedMercId: { in: partyIds } } });
    await prisma.mercenary.updateMany({ where: { userId, id: { in: partyIds } }, data: { isDispatched: true } });

    const allies = mercs.map((m) => this.toMercCombatant(m, equips.filter((e) => e.equippedMercId === m.id)));
    const id = crypto.randomBytes(8).toString("hex");
    const session: BattleSession = {
      id,
      userId,
      location,
      stageRule: dataRegistry.getFieldStageRule(locationId),
      partyIds: [...partyIds],
      allies,
      enemies: [],
      initialAllies: allies.map((a) => this.cloneCombatant(a)),
      phase: "EXPLORE",
      status: "IN_PROGRESS",
      paused: false,
      gaugePercent: 0,
      updatedAtMs: Date.now(),
      startedAtMs: Date.now(),
      resultApplied: false,
      logs: [`${location.name} 파견 시작`],
      combatEvents: [],
      combatSeq: 0,
      stageNo: 0,
      currentStageType: "EXPLORE",
      clearCount: 0,
      retryCount: 0,
      totalKills: 0,
      killByEnemyId: {},
      pendingDrops: [],
      totalDrops: [],
      stageReward: { credits: 0, exp: 0, materialA: 0, materialB: 0 },
      totalReward: { credits: 0, exp: 0, materialA: 0, materialB: 0 },
      attackBuffPct: 0,
      defenseBuffPct: 0,
      buffBattleStagesLeft: 0,
      turnSideNext: "ALLY",
      allyTurnCursor: 0,
      enemyTurnCursor: 0,
      actionTurn: 0,
    };
    this.sessions.set(id, session);
    if (!this.sessionIdsByUser.has(userId)) this.sessionIdsByUser.set(userId, new Set());
    this.sessionIdsByUser.get(userId)!.add(id);
    return this.toView(session);
  }

  async getCurrent(userId: string): Promise<BattleStateView | null> {
    const list = await this.listByUser(userId);
    return list[0] ?? null;
  }

  async listByUser(userId: string): Promise<BattleStateView[]> {
    const ids = this.sessionIdsByUser.get(userId);
    if (!ids || ids.size < 1) {
      await this.reconcileDispatchState(userId);
      return [];
    }
    const out: BattleStateView[] = [];
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (!session) continue;
      await this.advance(session);
      out.push(this.toView(session));
    }
    out.sort((a, b) => (a.status === "IN_PROGRESS" && b.status !== "IN_PROGRESS" ? -1 : 1));
    return out;
  }

  async getState(userId: string, sessionId: string): Promise<BattleStateView> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    await this.advance(session);
    return this.toView(session);
  }

  async setPaused(userId: string, sessionId: string, paused?: boolean): Promise<BattleStateView> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    if (session.status !== "IN_PROGRESS") throw new Error("BATTLE_NOT_ACTIVE");

    const nextPaused = typeof paused === "boolean" ? paused : !session.paused;
    if (session.paused !== nextPaused) {
      session.paused = nextPaused;
      session.updatedAtMs = Date.now();
      session.logs.push(nextPaused ? "PAUSED" : "RESUMED");
    }

    return this.toView(session);
  }

  async retreat(userId: string, sessionId: string): Promise<BattleStateView> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    if (session.status === "IN_PROGRESS") {
      session.status = "RETREAT";
      session.logs.push("철수");
    }
    await this.applyResult(session);
    return this.toView(session);
  }

  async close(userId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    if (session.status === "IN_PROGRESS") session.status = "RETREAT";
    await this.applyResult(session);
    this.sessions.delete(session.id);
    const ids = this.sessionIdsByUser.get(userId);
    if (ids) {
      ids.delete(session.id);
      if (ids.size < 1) this.sessionIdsByUser.delete(userId);
    }
  }

  private phaseSeconds(session: BattleSession): number {
    if (session.phase === "EXPLORE") return dataRegistry.getDefineValue("exploreSeconds", 1.5);
    if (session.phase === "BATTLE") return dataRegistry.getDefineValue("turnSeconds", 2);
    return dataRegistry.getDefineValue("lootSeconds", 0.8);
  }

  private toStats(base: CombatUnitRow): RuntimeStats {
    return {
      maxHp: base.maxHp,
      maxMana: base.maxMana,
      stamina: base.stamina,
      agility: base.agility,
      intelligence: base.intelligence,
      strength: base.strength,
      attack: base.attack,
      defense: base.defense,
      evasion: base.evasion,
      critChance: base.critChance,
      critDamage: base.critDamage,
      lifeSteal: base.lifeSteal,
      counter: base.counter,
      hpRegen: base.hpRegen,
      thornPhysical: base.thornPhysical,
      thornMagical: base.thornMagical,
      expGain: base.expGain,
      healPower: base.healPower,
      attackRangeType: base.attackRangeType,
      damageType: base.damageType,
    };
  }

  private applyPassives(stats: RuntimeStats, skills: CombatSkillRow[]): RuntimeStats {
    const next = { ...stats };
    for (const s of skills.filter((k) => k.kind === "passive")) {
      switch (s.effectType) {
        case "attack_pct":
          next.attack *= 1 + s.value1;
          break;
        case "defense_pct":
          next.defense *= 1 + s.value1;
          break;
        case "evasion_pct":
          next.evasion += s.value1;
          break;
        case "crit_pct":
          next.critChance += s.value1;
          break;
        case "life_steal_pct":
          next.lifeSteal += s.value1;
          break;
        case "heal_power_pct":
          next.healPower *= 1 + s.value1;
          break;
        case "hp_regen_flat":
          next.hpRegen += s.value1;
          break;
        case "thorn_magical_flat":
          next.thornMagical += s.value1;
          break;
        default:
          break;
      }
    }
    return next;
  }

  private applyTalent(stats: RuntimeStats, talentTag?: string | null): RuntimeStats {
    const talent = dataRegistry.getTalent(talentTag);
    if (!talent) return stats;
    const next = { ...stats };
    next.maxHp = Math.max(1, Math.floor(next.maxHp * (1 + talent.hpPct)));
    next.stamina = Math.max(1, Math.floor(next.stamina * (1 + talent.staminaPct)));
    next.agility = Math.max(1, Math.floor(next.agility * (1 + talent.agilityPct)));
    next.intelligence = Math.max(1, Math.floor(next.intelligence * (1 + talent.intelligencePct)));
    next.strength = Math.max(1, Math.floor(next.strength * (1 + talent.strengthPct)));
    next.attack = Math.max(1, Math.floor(next.attack * (1 + talent.attackPct)));
    next.defense = Math.max(1, Math.floor(next.defense * (1 + talent.defensePct)));
    return next;
  }

  private toMercCombatant(merc: Mercenary, equipments: Equipment[]): RuntimeCombatant {
    const base =
      dataRegistry.getCombatUnitOrNull("MERC_TEMPLATE", merc.templateId) ??
      dataRegistry.combatUnits.find((u) => u.entityType === "MERC_TEMPLATE");
    if (!base) throw new Error("MERC_COMBAT_UNIT_MISSING");
    const skills = dataRegistry.getCombatSkills("MERC_TEMPLATE", base.entityId);
    const stats = this.toStats(base);
    const equipBonus = calcEquipBonus(equipments);
    stats.attack = Math.floor(stats.attack * (1 + equipBonus));
    stats.defense = Math.floor(stats.defense * (1 + equipBonus * 0.7));
    stats.maxHp = Math.floor(stats.maxHp * (1 + merc.level * 0.06 + merc.promotionBonus));
    stats.maxMana = Math.floor(stats.maxMana * (1 + merc.level * 0.02));
    stats.attack = Math.floor(stats.attack * (1 + merc.level * 0.04 + merc.promotionBonus));
    stats.defense = Math.floor(stats.defense * (1 + merc.level * 0.03 + merc.promotionBonus));
    const adjusted = this.applyPassives(this.applyTalent(stats, merc.talentTag), skills);
    return {
      runtimeId: crypto.randomBytes(5).toString("hex"),
      side: "ALLY",
      name: base.name,
      spriteUrl: base.spriteUrl,
      spriteIdle: base.spriteIdle,
      spriteAttack: base.spriteAttack,
      spriteFrameWidth: base.spriteFrameWidth,
      spriteFrameHeight: base.spriteFrameHeight,
      spriteIdleFrames: base.spriteIdleFrames,
      spriteAttackFrames: base.spriteAttackFrames,
      spriteIdleFps: base.spriteIdleFps,
      spriteAttackFps: base.spriteAttackFps,
      spritePivotX: base.spritePivotX,
      spritePivotY: base.spritePivotY,
      spriteIdleIndexList: base.spriteIdleIndexList,
      spriteAttackIndexList: base.spriteAttackIndexList,
      spriteAtlasKey: base.spriteAtlasKey,
      sourceType: "MERC_TEMPLATE",
      sourceId: base.entityId,
      mercenaryId: merc.id,
      hp: Math.floor(adjusted.maxHp),
      mana: 0,
      stats: adjusted,
      skills,
    };
  }

  private spawnMonsters(session: BattleSession, stageType: StageType): RuntimeCombatant[] {
    const encounterRows = dataRegistry.getFieldStageEncounters(session.location.locationId, stageType === "EXPLORE" ? "BATTLE" : stageType);
    if (encounterRows.length < 1) {
      const fallback = dataRegistry.getLocationWaves(session.location.locationId).filter((w) => w.waveIndex === 1);
      return fallback.flatMap((w) => this.spawnMonstersFromRow(w.monsterTemplateId, w.count));
    }
    const grouped = new Map<string, { weight: number; rows: FieldStageEncounterRow[] }>();
    for (const row of encounterRows) {
      if (!grouped.has(row.encounterId)) grouped.set(row.encounterId, { weight: row.weight, rows: [] });
      grouped.get(row.encounterId)!.rows.push(row);
    }
    const picked = weightedPick(Array.from(grouped.values()), (x) => x.weight);
    return picked.rows.flatMap((r) => this.spawnMonstersFromRow(r.monsterTemplateId, r.count));
  }

  private spawnMonstersFromRow(monsterTemplateId: string, count: number): RuntimeCombatant[] {
    const out: RuntimeCombatant[] = [];
    for (let i = 0; i < count; i += 1) {
      const base = dataRegistry.getCombatUnit("MONSTER_TEMPLATE", monsterTemplateId);
      const skills = dataRegistry.getCombatSkills("MONSTER_TEMPLATE", monsterTemplateId);
      const adjusted = this.applyPassives(this.toStats(base), skills);
      out.push({
        runtimeId: crypto.randomBytes(5).toString("hex"),
        side: "ENEMY",
        name: base.name,
        spriteUrl: base.spriteUrl,
        spriteIdle: base.spriteIdle,
        spriteAttack: base.spriteAttack,
        spriteFrameWidth: base.spriteFrameWidth,
        spriteFrameHeight: base.spriteFrameHeight,
        spriteIdleFrames: base.spriteIdleFrames,
        spriteAttackFrames: base.spriteAttackFrames,
        spriteIdleFps: base.spriteIdleFps,
        spriteAttackFps: base.spriteAttackFps,
        spritePivotX: base.spritePivotX,
        spritePivotY: base.spritePivotY,
        spriteIdleIndexList: base.spriteIdleIndexList,
        spriteAttackIndexList: base.spriteAttackIndexList,
        spriteAtlasKey: base.spriteAtlasKey,
        sourceType: "MONSTER_TEMPLATE",
        sourceId: monsterTemplateId,
        hp: Math.floor(adjusted.maxHp),
        mana: 0,
        stats: adjusted,
        skills,
      });
    }
    return out;
  }

  private chooseNextStageType(session: BattleSession): StageType {
    const r = session.stageRule;
    const nextClear = session.clearCount + 1;
    if (r.bossEveryStageClears > 0 && nextClear % r.bossEveryStageClears === 0) return "BOSS";
    if (r.hiddenEveryStageClears > 0 && nextClear % r.hiddenEveryStageClears === 0 && Math.random() < clamp(r.hiddenEnterChance, 0, 1)) {
      return "HIDDEN";
    }
    const total = Math.max(0.0001, r.battleStageWeight + r.exploreStageWeight);
    return Math.random() < r.battleStageWeight / total ? "BATTLE" : "EXPLORE";
  }

  private applyExploreStage(session: BattleSession): void {
    const roll = Math.random();
    if (roll < 0.33) {
      for (const ally of session.allies) {
        if (ally.hp <= 0) continue;
        const heal = Math.max(1, Math.floor(ally.stats.maxHp * 0.25));
        ally.hp = Math.min(ally.stats.maxHp, ally.hp + heal);
        pushEvent(session, {
          kind: "heal",
          targetId: ally.runtimeId,
          targetName: ally.name,
          targetSide: "ALLY",
          value: heal,
          text: `explore heal ${ally.name} +${heal}`,
        });
      }
      session.logs.push("탐색 스테이지: 체력 회복");
      return;
    }
    if (roll < 0.66) {
      session.attackBuffPct = 0.18;
      session.defenseBuffPct = 0.18;
      session.buffBattleStagesLeft = Math.max(session.buffBattleStagesLeft, 2);
      session.logs.push("탐색 스테이지: 전투 버프 획득 (2 전투 스테이지)");
      return;
    }
    const bonusCredits = Math.max(1, Math.floor(session.location.baseCreditReward * 0.6));
    const bonusA = Math.max(0, Math.floor(session.location.materialAReward * 0.4));
    const bonusB = Math.max(0, Math.floor(session.location.materialBReward * 0.4));
    session.stageReward = { credits: bonusCredits, exp: 0, materialA: bonusA, materialB: bonusB };
    session.totalReward.credits += bonusCredits;
    session.totalReward.materialA += bonusA;
    session.totalReward.materialB += bonusB;
    session.logs.push(`탐색 스테이지: 보급 획득 C${bonusCredits} A${bonusA} B${bonusB}`);
  }

  private effectiveAttack(actor: RuntimeCombatant, session: BattleSession): number {
    if (actor.side !== "ALLY" || session.buffBattleStagesLeft < 1) return actor.stats.attack;
    return actor.stats.attack * (1 + session.attackBuffPct);
  }

  private effectiveDefense(target: RuntimeCombatant, session: BattleSession): number {
    if (target.side !== "ALLY" || session.buffBattleStagesLeft < 1) return target.stats.defense;
    return target.stats.defense * (1 + session.defenseBuffPct);
  }

  private dealDamage(session: BattleSession, attacker: RuntimeCombatant, defender: RuntimeCombatant, multiplier: number, allowCounter: boolean): number {
    if (attacker.hp <= 0 || defender.hp <= 0) return 0;
    if (Math.random() < clamp(defender.stats.evasion, 0, 0.75)) {
      session.logs.push(`${attacker.name} 공격을 ${defender.name} 회피`);
      pushEvent(session, {
        kind: "miss",
        attackerId: attacker.runtimeId,
        attackerName: attacker.name,
        attackerSide: attacker.side,
        targetId: defender.runtimeId,
        targetName: defender.name,
        targetSide: defender.side,
        text: `${attacker.name} -> ${defender.name} miss`,
      });
      return 0;
    }

    let coreAttack = this.effectiveAttack(attacker, session);
    if (attacker.stats.damageType === "physical") coreAttack += attacker.stats.strength * 0.7;
    if (attacker.stats.damageType === "magic") coreAttack += attacker.stats.intelligence * 0.9;
    if (attacker.stats.damageType === "chaos") coreAttack += (attacker.stats.strength + attacker.stats.intelligence) * 0.45;
    let damage = coreAttack * multiplier;
    damage *= 100 / (100 + this.effectiveDefense(defender, session));

    const crit = Math.random() < clamp(attacker.stats.critChance, 0, 0.95);
    if (crit) damage *= clamp(attacker.stats.critDamage, 1, 3.5);
    const final = Math.max(1, Math.floor(damage));
    const beforeHp = defender.hp;
    defender.hp = Math.max(0, defender.hp - final);
    session.logs.push(`${attacker.name} -> ${defender.name} ${final} 피해${crit ? " (치명타)" : ""}`);
    pushEvent(session, {
      kind: "hit",
      attackerId: attacker.runtimeId,
      attackerName: attacker.name,
      attackerSide: attacker.side,
      targetId: defender.runtimeId,
      targetName: defender.name,
      targetSide: defender.side,
      value: final,
      text: `${attacker.name} -> ${defender.name} ${final}`,
    });

    if (attacker.stats.lifeSteal > 0) {
      const healed = Math.floor(final * clamp(attacker.stats.lifeSteal, 0, 0.8));
      if (healed > 0) {
        attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + healed);
        session.logs.push(`${attacker.name} 흡혈 +${healed}`);
        pushEvent(session, {
          kind: "heal",
          targetId: attacker.runtimeId,
          targetName: attacker.name,
          targetSide: attacker.side,
          value: healed,
          text: `${attacker.name} heal +${healed}`,
        });
      }
    }

    if (attacker.stats.attackRangeType === "melee") {
      const thorn = attacker.stats.damageType === "magic" ? defender.stats.thornMagical : defender.stats.thornPhysical;
      if (thorn > 0) {
        const reflected = Math.max(1, Math.floor(thorn));
        attacker.hp = Math.max(0, attacker.hp - reflected);
        pushEvent(session, {
          kind: "hit",
          attackerId: defender.runtimeId,
          attackerName: defender.name,
          attackerSide: defender.side,
          targetId: attacker.runtimeId,
          targetName: attacker.name,
          targetSide: attacker.side,
          value: reflected,
          text: `${defender.name} thorn ${reflected}`,
        });
      }
    }

    if (beforeHp > 0 && defender.hp <= 0) {
      if (defender.side === "ENEMY") {
        session.totalKills += 1;
        if (defender.sourceType === "MONSTER_TEMPLATE") {
          session.killByEnemyId[defender.sourceId] = (session.killByEnemyId[defender.sourceId] ?? 0) + 1;
        }
      }
      this.rollDrop(session, defender);
    }

    if (allowCounter && defender.hp > 0 && Math.random() < clamp(defender.stats.counter, 0, 0.7)) {
      pushEvent(session, {
        kind: "counter",
        attackerId: defender.runtimeId,
        attackerName: defender.name,
        attackerSide: defender.side,
        targetId: attacker.runtimeId,
        targetName: attacker.name,
        targetSide: attacker.side,
        text: `${defender.name} counter`,
      });
      this.dealDamage(session, defender, attacker, 0.6, false);
    }
    return final;
  }

  private rollDrop(session: BattleSession, dead: RuntimeCombatant): void {
    if (dead.side !== "ENEMY" || dead.sourceType !== "MONSTER_TEMPLATE") return;
    const drops: MonsterDropRow[] = dataRegistry.getMonsterDrops(dead.sourceId);
    for (const d of drops) {
      if (Math.random() <= clamp(d.dropRate, 0, 1)) {
        const drop: PendingDrop = {
          itemId: d.itemId,
          itemName: d.itemName,
          equipType: d.equipType,
          grade: d.grade,
          statValue: d.statValue,
        };
        session.pendingDrops.push(drop);
        session.totalDrops.push(drop);
        pushEvent(session, { kind: "drop", targetName: dead.name, targetSide: dead.side, text: `${d.itemName} drop` });
      }
    }
  }

  private actorStep(session: BattleSession, actor: RuntimeCombatant): void {
    if (actor.hp <= 0) return;
    const manaRegen =
      actor.stats.maxMana * dataRegistry.getDefineValue("manaRegenBasePct", 0.1) +
      actor.stats.intelligence * dataRegistry.getDefineValue("manaRegenIntPct", 0.1);
    actor.mana = Math.min(actor.stats.maxMana, actor.mana + manaRegen);
    actor.hp = Math.min(actor.stats.maxHp, actor.hp + Math.max(0, actor.stats.hpRegen));

    const enemyList = actor.side === "ALLY" ? session.enemies : session.allies;
    const allyList = actor.side === "ALLY" ? session.allies : session.enemies;
    const target = pickLowestHp(enemyList);
    if (!target) return;

    const activeThreshold = actor.stats.maxMana * dataRegistry.getDefineValue("activeManaThresholdPct", 1);
    const active = actor.skills.find((s) => s.kind === "active");
    if (active && actor.mana >= activeThreshold) {
      actor.mana = 0;
      if (active.effectType === "heal_lowest") {
        const ally = pickLowestHp(allyList);
        if (ally) {
          const amount = Math.max(1, Math.floor(actor.stats.maxHp * active.value1 * actor.stats.healPower));
          ally.hp = Math.min(ally.stats.maxHp, ally.hp + amount);
          pushEvent(session, {
            kind: "skill",
            attackerId: actor.runtimeId,
            attackerName: actor.name,
            attackerSide: actor.side,
            targetId: ally.runtimeId,
            targetName: ally.name,
            targetSide: ally.side,
            value: amount,
            text: `${actor.name} ${active.skillName}`,
          });
          return;
        }
      }
      if (active.effectType === "aoe_damage") {
        pushEvent(session, { kind: "skill", attackerId: actor.runtimeId, attackerName: actor.name, attackerSide: actor.side, text: `${actor.name} ${active.skillName}` });
        for (const enemy of alive(enemyList)) this.dealDamage(session, actor, enemy, active.value1, true);
        return;
      }
      pushEvent(session, {
        kind: "skill",
        attackerId: actor.runtimeId,
        attackerName: actor.name,
        attackerSide: actor.side,
        targetId: target.runtimeId,
        targetName: target.name,
        targetSide: target.side,
        text: `${actor.name} ${active.skillName}`,
      });
      this.dealDamage(session, actor, target, active.value1, true);
      return;
    }
    this.dealDamage(session, actor, target, 1, true);
  }

  private averageAgility(list: RuntimeCombatant[]): number {
    const units = alive(list);
    if (units.length < 1) return 0;
    const sum = units.reduce((acc, unit) => acc + Math.max(0, unit.stats.agility), 0);
    return sum / units.length;
  }

  private resetTurnStateForBattle(session: BattleSession): void {
    session.allyTurnCursor = 0;
    session.enemyTurnCursor = 0;
    const allyAvg = this.averageAgility(session.allies);
    const enemyAvg = this.averageAgility(session.enemies);
    session.turnSideNext = allyAvg >= enemyAvg ? "ALLY" : "ENEMY";
  }

  private nextActorFromSide(session: BattleSession, side: Side): RuntimeCombatant | null {
    const team = side === "ALLY" ? session.allies : session.enemies;
    if (team.length < 1) return null;

    let idx = side === "ALLY" ? session.allyTurnCursor : session.enemyTurnCursor;
    idx = ((idx % team.length) + team.length) % team.length;

    for (let i = 0; i < team.length; i += 1) {
      const actor = team[idx];
      idx = (idx + 1) % team.length;
      if (actor.hp <= 0) continue;
      if (side === "ALLY") session.allyTurnCursor = idx;
      else session.enemyTurnCursor = idx;
      return actor;
    }
    return null;
  }

  private async processTurn(session: BattleSession): Promise<void> {
    if (alive(session.allies).length < 1 || alive(session.enemies).length < 1) return;

    const plannedSide = session.turnSideNext;
    const altSide: Side = plannedSide === "ALLY" ? "ENEMY" : "ALLY";
    const actor = this.nextActorFromSide(session, plannedSide) ?? this.nextActorFromSide(session, altSide);
    if (!actor) return;

    session.actionTurn += 1;
    session.logs.push(`TURN ${session.actionTurn}: [${actor.side}] ${actor.name}`);
    this.actorStep(session, actor);

    if (alive(session.allies).length > 0 && alive(session.enemies).length > 0) {
      session.turnSideNext = actor.side === "ALLY" ? "ENEMY" : "ALLY";
    }

    const keep = Math.max(8, Math.floor(dataRegistry.getDefineValue("logKeepCount", 30)));
    session.logs = session.logs.slice(-keep);
  }

  private stageRewardFactor(stageType: StageType): number {
    if (stageType === "BOSS") return 3;
    if (stageType === "HIDDEN") return 1.4;
    if (stageType === "BATTLE") return 1;
    return 0;
  }

  private async resolveExplorePhase(session: BattleSession): Promise<void> {
    const nextStage = this.chooseNextStageType(session);
    session.currentStageType = nextStage;
    session.stageNo += 1;
    session.stageReward = { credits: 0, exp: 0, materialA: 0, materialB: 0 };
    if (nextStage === "EXPLORE") {
      this.applyExploreStage(session);
      if (session.stageReward.credits || session.stageReward.materialA || session.stageReward.materialB) {
        await prisma.user.update({
          where: { id: session.userId },
          data: {
            credits: { increment: session.stageReward.credits },
            materialA: { increment: session.stageReward.materialA },
            materialB: { increment: session.stageReward.materialB },
          },
        });
      }
      session.clearCount += 1;
      session.logs.push(`STAGE ${session.stageNo} 탐색 완료`);
      return;
    }

    const factor = this.stageRewardFactor(nextStage);
    session.stageReward = {
      credits: Math.max(1, Math.floor(session.location.baseCreditReward * factor)),
      exp: Math.max(1, Math.floor(session.location.baseExpReward * factor)),
      materialA: Math.max(0, Math.floor(session.location.materialAReward * factor)),
      materialB: Math.max(0, Math.floor(session.location.materialBReward * factor)),
    };
    session.enemies = this.spawnMonsters(session, nextStage);
    this.resetTurnStateForBattle(session);
    session.phase = "BATTLE";
    session.logs.push(`STAGE ${session.stageNo} ${nextStage} 시작`);
  }

  private async resolveBattleOutcome(session: BattleSession): Promise<void> {
    if (alive(session.allies).length < 1) {
      session.retryCount += 1;
      session.logs.push("전멸 - 탐색부터 재시작");
      session.allies = session.initialAllies.map((a) => this.cloneCombatant(a));
      session.enemies = [];
      session.pendingDrops = [];
      this.resetTurnStateForBattle(session);
      session.phase = "EXPLORE";
      return;
    }
    if (alive(session.enemies).length < 1) {
      session.phase = "LOOT";
    }
  }

  private async resolveLoot(session: BattleSession): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: {
          credits: { increment: session.stageReward.credits },
          materialA: { increment: session.stageReward.materialA },
          materialB: { increment: session.stageReward.materialB },
        },
      });

      for (const drop of session.pendingDrops) {
        await tx.equipment.create({
          data: {
            userId: session.userId,
            type: drop.equipType,
            grade: drop.grade,
            statValue: drop.statValue,
          },
        });
      }

      const mercs = await tx.mercenary.findMany({ where: { userId: session.userId, id: { in: session.partyIds } } });
      for (const merc of mercs) {
        const unit =
          dataRegistry.getCombatUnitOrNull("MERC_TEMPLATE", merc.templateId) ??
          dataRegistry.combatUnits.find((u) => u.entityType === "MERC_TEMPLATE");
        const gained = Math.max(1, Math.floor(session.stageReward.exp * (unit?.expGain ?? 1)));
        const next = levelUpWithExp(merc.level, merc.exp, gained);
        await tx.mercenary.update({ where: { id: merc.id }, data: { level: next.level, exp: next.exp } });
      }
    });

    session.totalReward.credits += session.stageReward.credits;
    session.totalReward.exp += session.stageReward.exp;
    session.totalReward.materialA += session.stageReward.materialA;
    session.totalReward.materialB += session.stageReward.materialB;
    session.pendingDrops = [];
    session.clearCount += 1;
    session.enemies = [];
    this.resetTurnStateForBattle(session);
    session.phase = "EXPLORE";
    if (session.buffBattleStagesLeft > 0) session.buffBattleStagesLeft -= 1;
    session.logs.push(`STAGE ${session.stageNo} 완료`);
  }

  private async advance(session: BattleSession): Promise<void> {
    if (session.status !== "IN_PROGRESS") return;
    const now = Date.now();
    if (session.paused) {
      session.updatedAtMs = now;
      return;
    }
    const phaseMs = this.phaseSeconds(session) * 1000;
    const elapsedMs = Math.max(0, now - session.updatedAtMs);
    if (phaseMs <= 0) {
      session.updatedAtMs = now;
      return;
    }
    session.gaugePercent = clamp(session.gaugePercent + (elapsedMs / phaseMs) * 100, 0, 100);
    if (session.gaugePercent < 100) {
      session.updatedAtMs = now;
      return;
    }
    session.gaugePercent = 0;
    if (session.phase === "EXPLORE") {
      await this.resolveExplorePhase(session);
    } else if (session.phase === "BATTLE") {
      await this.processTurn(session);
      await this.resolveBattleOutcome(session);
    } else {
      await this.resolveLoot(session);
    }
    session.updatedAtMs = now;
  }

  private async applyResult(session: BattleSession): Promise<void> {
    if (session.resultApplied) return;
    session.resultApplied = true;
    await prisma.mercenary.updateMany({ where: { userId: session.userId, id: { in: session.partyIds } }, data: { isDispatched: false } });
  }

  private cloneCombatant(src: RuntimeCombatant): RuntimeCombatant {
    return {
      ...src,
      stats: { ...src.stats },
      skills: [...src.skills],
      hp: src.stats.maxHp,
      mana: 0,
      runtimeId: crypto.randomBytes(5).toString("hex"),
    };
  }

  private toView(session: BattleSession): BattleStateView {
    const toFighter = (u: RuntimeCombatant) => ({
      id: u.runtimeId,
      entityId: u.sourceId,
      name: u.name,
      spriteUrl: u.spriteUrl,
      spriteIdle: u.spriteIdle,
      spriteAttack: u.spriteAttack,
      spriteFrameWidth: u.spriteFrameWidth,
      spriteFrameHeight: u.spriteFrameHeight,
      spriteIdleFrames: u.spriteIdleFrames,
      spriteAttackFrames: u.spriteAttackFrames,
      spriteIdleFps: u.spriteIdleFps,
      spriteAttackFps: u.spriteAttackFps,
      spritePivotX: u.spritePivotX,
      spritePivotY: u.spritePivotY,
      spriteIdleIndexList: u.spriteIdleIndexList,
      spriteAttackIndexList: u.spriteAttackIndexList,
      spriteAtlasKey: u.spriteAtlasKey,
      hp: Math.max(0, Math.floor(u.hp)),
      maxHp: Math.floor(u.stats.maxHp),
      mana: Math.floor(u.mana),
      maxMana: Math.floor(u.stats.maxMana),
      alive: u.hp > 0,
    });
    const killsByEnemy = Object.entries(session.killByEnemyId)
      .map(([enemyId, count]) => {
        const unit = dataRegistry.getCombatUnitOrNull("MONSTER_TEMPLATE", enemyId);
        return {
          enemyId,
          enemyName: unit?.name ?? enemyId,
          spriteUrl: unit?.spriteUrl ?? "mon_goblin.svg",
          count,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      id: session.id,
      status: session.status,
      paused: session.paused,
      phase: session.phase,
      gaugePercent: clamp(session.gaugePercent, 0, 100),
      locationId: session.location.locationId,
      locationName: session.location.name,
      locationImageUrl: session.location.imageUrl,
      waveIndex: Math.max(1, session.stageNo),
      stageType: session.currentStageType,
      allies: session.allies.map(toFighter),
      enemies: session.enemies.map(toFighter),
      logs: [...session.logs],
      reward: { ...session.totalReward },
      retryCount: session.retryCount,
      clearCount: session.clearCount,
      actionTurn: session.actionTurn,
      droppedItems: [...session.totalDrops],
      combatEvents: [...session.combatEvents],
      report: {
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - session.startedAtMs) / 1000)),
        clearCount: session.clearCount,
        retryCount: session.retryCount,
        gainedExp: session.totalReward.exp,
        gainedCredits: session.totalReward.credits,
        materialA: session.totalReward.materialA,
        materialB: session.totalReward.materialB,
        totalKills: session.totalKills,
        killsByEnemy,
        expPerSecond: Number((session.totalReward.exp / Math.max(1, Math.floor((Date.now() - session.startedAtMs) / 1000))).toFixed(2)),
      },
    };
  }
}

export const battleService = new BattleService();
