import crypto from "node:crypto";
import type { Equipment, Mercenary } from "@prisma/client";
import { dataRegistry, type CombatSkillRow, type CombatUnitRow, type LocationRow, type MonsterDropRow } from "../data/registry.js";
import { prisma } from "../plugins/prisma.js";
import { calcEquipBonus, levelUpWithExp } from "./game.js";

type Side = "ALLY" | "ENEMY";
type BattleStatus = "IN_PROGRESS" | "RETREAT";
type BattlePhase = "EXPLORE" | "BATTLE" | "LOOT";

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
  sourceType: "MERC_TEMPLATE" | "MONSTER_TEMPLATE";
  sourceId: string;
  mercenaryId?: string;
  hp: number;
  mana: number;
  stats: RuntimeStats;
  skills: CombatSkillRow[];
};

type BattleWave = { waveIndex: number; units: Array<{ monsterTemplateId: string; count: number }> };

type PendingDrop = {
  itemId: string;
  itemName: string;
  equipType: "weapon" | "armor" | "accessory" | "extra";
  grade: number;
  statValue: number;
};

type BattleSession = {
  id: string;
  userId: string;
  location: LocationRow;
  partyIds: string[];
  allies: RuntimeCombatant[];
  enemies: RuntimeCombatant[];
  initialAllies: RuntimeCombatant[];
  waves: BattleWave[];
  waveCursor: number;
  phase: BattlePhase;
  gaugePercent: number;
  updatedAtMs: number;
  status: BattleStatus;
  logs: string[];
  resultApplied: boolean;
  retryCount: number;
  clearCount: number;
  rewardCredits: number;
  rewardExp: number;
  rewardMaterialA: number;
  rewardMaterialB: number;
  pendingDrops: PendingDrop[];
  totalDrops: PendingDrop[];
};

export type BattleStateView = {
  id: string;
  status: BattleStatus;
  phase: BattlePhase;
  gaugePercent: number;
  locationId: string;
  locationName: string;
  locationImageUrl: string;
  waveIndex: number;
  allies: Array<{ id: string; name: string; hp: number; maxHp: number; mana: number; maxMana: number; alive: boolean; spriteUrl: string }>;
  enemies: Array<{ id: string; name: string; hp: number; maxHp: number; mana: number; maxMana: number; alive: boolean; spriteUrl: string }>;
  logs: string[];
  reward: { credits: number; exp: number; materialA: number; materialB: number };
  retryCount: number;
  clearCount: number;
  droppedItems: Array<{ itemId: string; itemName: string; equipType: string; grade: number; statValue: number }>;
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

class BattleService {
  private sessions = new Map<string, BattleSession>();
  private sessionByUser = new Map<string, string>();

  async startBattle(userId: string, locationId: string, partyIds: string[]): Promise<BattleStateView> {
    if (this.sessionByUser.has(userId)) {
      const existing = this.sessions.get(this.sessionByUser.get(userId)!);
      if (existing && existing.status === "IN_PROGRESS") throw new Error("BATTLE_ALREADY_IN_PROGRESS");
    }

    const location = dataRegistry.getLocation(locationId);
    if (!location.isOpen) throw new Error("LOCATION_NOT_OPEN");

    const waves = this.buildWaves(locationId);
    if (waves.length < 1) throw new Error("LOCATION_WAVE_NOT_FOUND");

    const mercs = await prisma.mercenary.findMany({ where: { userId, id: { in: partyIds } } });
    if (mercs.length !== partyIds.length) throw new Error("INVALID_PARTY_MEMBERS");
    if (mercs.some((m) => m.isDispatched)) throw new Error("MERC_ALREADY_DISPATCHED");

    const equips = await prisma.equipment.findMany({ where: { userId, equippedMercId: { in: partyIds } } });
    await prisma.mercenary.updateMany({ where: { userId, id: { in: partyIds } }, data: { isDispatched: true } });

    const allies = mercs.map((m) => this.toMercCombatant(m, equips.filter((e) => e.equippedMercId === m.id)));
    const id = crypto.randomBytes(8).toString("hex");
    const session: BattleSession = {
      id,
      userId,
      location,
      partyIds: [...partyIds],
      allies,
      enemies: [],
      initialAllies: allies.map((a) => this.cloneCombatant(a)),
      waves,
      waveCursor: 0,
      phase: "EXPLORE",
      gaugePercent: 0,
      updatedAtMs: Date.now(),
      status: "IN_PROGRESS",
      logs: [`${location.name} 파견 시작`, dataRegistry.getRandomExploreText()],
      resultApplied: false,
      retryCount: 0,
      clearCount: 0,
      rewardCredits: location.baseCreditReward,
      rewardExp: location.baseExpReward,
      rewardMaterialA: location.materialAReward,
      rewardMaterialB: location.materialBReward,
      pendingDrops: [],
      totalDrops: [],
    };
    this.sessions.set(id, session);
    this.sessionByUser.set(userId, id);
    return this.toView(session);
  }

  async getCurrent(userId: string): Promise<BattleStateView | null> {
    const id = this.sessionByUser.get(userId);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    await this.advance(session);
    return this.toView(session);
  }

  async getState(userId: string, sessionId: string): Promise<BattleStateView> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    await this.advance(session);
    return this.toView(session);
  }

  async retreat(userId: string, sessionId: string): Promise<BattleStateView> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    if (session.status === "IN_PROGRESS") {
      session.status = "RETREAT";
      session.logs.push("플레이어가 후퇴했습니다.");
    }
    await this.applyResult(session);
    return this.toView(session);
  }

  async close(userId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("BATTLE_NOT_FOUND");
    if (session.status === "IN_PROGRESS") {
      session.status = "RETREAT";
      session.logs.push("전투 창 닫기: 후퇴 처리");
    }
    await this.applyResult(session);
    this.sessions.delete(session.id);
    this.sessionByUser.delete(userId);
  }

  private buildWaves(locationId: string): BattleWave[] {
    const rows = dataRegistry.getLocationWaves(locationId);
    const byWave = new Map<number, BattleWave>();
    for (const row of rows) {
      if (!byWave.has(row.waveIndex)) byWave.set(row.waveIndex, { waveIndex: row.waveIndex, units: [] });
      byWave.get(row.waveIndex)!.units.push({ monsterTemplateId: row.monsterTemplateId, count: row.count });
    }
    return Array.from(byWave.values()).sort((a, b) => a.waveIndex - b.waveIndex);
  }

  private phaseSeconds(phase: BattlePhase): number {
    if (phase === "EXPLORE") return dataRegistry.getDefineValue("exploreSeconds", 4);
    if (phase === "LOOT") return dataRegistry.getDefineValue("lootSeconds", 2.5);
    return dataRegistry.getDefineValue("turnSeconds", 3.5);
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
    const base = dataRegistry.getCombatUnit("MERC_TEMPLATE", merc.templateId);
    const skills = dataRegistry.getCombatSkills("MERC_TEMPLATE", merc.templateId);
    const stats = this.toStats(base);
    const equipBonus = calcEquipBonus(equipments);
    stats.attack = Math.floor(stats.attack * (1 + equipBonus));
    stats.defense = Math.floor(stats.defense * (1 + equipBonus * 0.7));
    stats.maxHp = Math.floor(stats.maxHp * (1 + merc.level * 0.06 + merc.promotionBonus));
    stats.maxMana = Math.floor(stats.maxMana * (1 + merc.level * 0.02));
    stats.attack = Math.floor(stats.attack * (1 + merc.level * 0.04 + merc.promotionBonus));
    stats.defense = Math.floor(stats.defense * (1 + merc.level * 0.03 + merc.promotionBonus));
    const withTalent = this.applyTalent(stats, merc.talentTag);
    const adjusted = this.applyPassives(withTalent, skills);
    return {
      runtimeId: crypto.randomBytes(5).toString("hex"),
      side: "ALLY",
      name: base.name,
      spriteUrl: base.spriteUrl,
      sourceType: "MERC_TEMPLATE",
      sourceId: merc.templateId,
      mercenaryId: merc.id,
      hp: Math.floor(adjusted.maxHp),
      mana: 0,
      stats: adjusted,
      skills,
    };
  }

  private spawnWave(wave: BattleWave): RuntimeCombatant[] {
    const out: RuntimeCombatant[] = [];
    for (const w of wave.units) {
      for (let i = 0; i < w.count; i += 1) {
        const base = dataRegistry.getCombatUnit("MONSTER_TEMPLATE", w.monsterTemplateId);
        const skills = dataRegistry.getCombatSkills("MONSTER_TEMPLATE", w.monsterTemplateId);
        const adjusted = this.applyPassives(this.toStats(base), skills);
        out.push({
          runtimeId: crypto.randomBytes(5).toString("hex"),
          side: "ENEMY",
          name: base.name,
          spriteUrl: base.spriteUrl,
          sourceType: "MONSTER_TEMPLATE",
          sourceId: w.monsterTemplateId,
          hp: Math.floor(adjusted.maxHp),
          mana: 0,
          stats: adjusted,
          skills,
        });
      }
    }
    return out;
  }

  private dealDamage(session: BattleSession, attacker: RuntimeCombatant, defender: RuntimeCombatant, multiplier: number, allowCounter: boolean): number {
    if (attacker.hp <= 0 || defender.hp <= 0) return 0;

    if (Math.random() < clamp(defender.stats.evasion, 0, 0.75)) {
      session.logs.push(`${attacker.name} 공격을 ${defender.name} 회피`);
      return 0;
    }

    let coreAttack = attacker.stats.attack;
    if (attacker.stats.damageType === "physical") coreAttack += attacker.stats.strength * 0.7;
    if (attacker.stats.damageType === "magic") coreAttack += attacker.stats.intelligence * 0.9;
    if (attacker.stats.damageType === "chaos") coreAttack += (attacker.stats.strength + attacker.stats.intelligence) * 0.45;

    let damage = coreAttack * multiplier;
    damage *= 100 / (100 + defender.stats.defense);

    const crit = Math.random() < clamp(attacker.stats.critChance, 0, 0.95);
    if (crit) damage *= clamp(attacker.stats.critDamage, 1, 3.5);

    const final = Math.max(1, Math.floor(damage));
    const beforeHp = defender.hp;
    defender.hp = Math.max(0, defender.hp - final);
    session.logs.push(`${attacker.name} -> ${defender.name} ${final} 피해${crit ? " (치명타)" : ""}`);

    if (attacker.stats.lifeSteal > 0) {
      const healed = Math.floor(final * clamp(attacker.stats.lifeSteal, 0, 0.8));
      if (healed > 0) {
        attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + healed);
        session.logs.push(`${attacker.name} 흡혈 +${healed}`);
      }
    }

    if (attacker.stats.attackRangeType === "melee") {
      const thorn = attacker.stats.damageType === "magic" ? defender.stats.thornMagical : defender.stats.thornPhysical;
      if (thorn > 0) {
        const reflected = Math.max(1, Math.floor(thorn));
        attacker.hp = Math.max(0, attacker.hp - reflected);
        session.logs.push(`${defender.name} 가시 피해 ${reflected}`);
      }
    }

    if (beforeHp > 0 && defender.hp <= 0) {
      this.rollDrop(session, defender);
    }

    if (allowCounter && defender.hp > 0 && Math.random() < clamp(defender.stats.counter, 0, 0.7)) {
      session.logs.push(`${defender.name} 반격`);
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
        session.logs.push(`${dead.name} 처치: ${d.itemName} 드랍`);
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
          session.logs.push(`${actor.name} ${active.skillName}: ${ally.name} +${amount} 회복`);
          return;
        }
      }
      if (active.effectType === "aoe_damage") {
        session.logs.push(`${actor.name} ${active.skillName} 발동`);
        for (const enemy of alive(enemyList)) this.dealDamage(session, actor, enemy, active.value1, true);
        return;
      }
      session.logs.push(`${actor.name} ${active.skillName} 발동`);
      this.dealDamage(session, actor, target, active.value1, true);
      return;
    }

    this.dealDamage(session, actor, target, 1, true);
  }

  private async processTurn(session: BattleSession): Promise<void> {
    const order = [...alive(session.allies), ...alive(session.enemies)].sort((a, b) => b.stats.agility - a.stats.agility);
    for (const actor of order) {
      if (session.status !== "IN_PROGRESS" || session.phase !== "BATTLE") break;
      this.actorStep(session, actor);
      await this.checkOutcome(session);
    }
    const keep = Math.max(8, Math.floor(dataRegistry.getDefineValue("logKeepCount", 30)));
    session.logs = session.logs.slice(-keep);
  }

  private async checkOutcome(session: BattleSession): Promise<void> {
    if (alive(session.allies).length < 1) {
      session.retryCount += 1;
      session.logs.push(`아군 전멸 - 탐색부터 재시작 (${session.retryCount})`);
      session.allies = session.initialAllies.map((a) => this.cloneCombatant(a));
      session.enemies = [];
      session.waveCursor = 0;
      session.pendingDrops = [];
      session.phase = "EXPLORE";
      session.logs.push(dataRegistry.getRandomExploreText());
      return;
    }

    if (alive(session.enemies).length < 1) {
      if (session.waveCursor + 1 < session.waves.length) {
        session.waveCursor += 1;
        session.enemies = this.spawnWave(session.waves[session.waveCursor]);
        session.logs.push(`WAVE ${session.waves[session.waveCursor].waveIndex} 시작`);
        return;
      }
      session.phase = "LOOT";
      session.logs.push("전투 종료 - 아이템 획득 단계");
    }
  }

  private async resolveExplore(session: BattleSession): Promise<void> {
    session.logs.push(dataRegistry.getRandomExploreText());
    session.waveCursor = 0;
    session.enemies = this.spawnWave(session.waves[0]);
    session.phase = "BATTLE";
    session.logs.push("WAVE 1 시작");
  }

  private async resolveLoot(session: BattleSession): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: {
          credits: { increment: session.rewardCredits },
          materialA: { increment: session.rewardMaterialA },
          materialB: { increment: session.rewardMaterialB },
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
        const unit = dataRegistry.getCombatUnit("MERC_TEMPLATE", merc.templateId);
        const gained = Math.max(1, Math.floor(session.rewardExp * unit.expGain));
        const next = levelUpWithExp(merc.level, merc.exp, gained);
        await tx.mercenary.update({ where: { id: merc.id }, data: { level: next.level, exp: next.exp } });
      }
    });

    if (session.pendingDrops.length > 0) {
      session.logs.push(`아이템 획득: ${session.pendingDrops.map((d) => d.itemName).join(", ")}`);
    } else {
      session.logs.push("아이템 획득 없음");
    }
    session.pendingDrops = [];
    session.clearCount += 1;
    session.phase = "EXPLORE";
    session.enemies = [];
    session.waveCursor = 0;
    session.logs.push(`세션 ${session.clearCount}회 클리어. 탐색 재개`);
  }

  private async advance(session: BattleSession): Promise<void> {
    if (session.status !== "IN_PROGRESS") return;

    const now = Date.now();
    let remainingMs = now - session.updatedAtMs;
    while (remainingMs > 0 && session.status === "IN_PROGRESS") {
      const phaseMs = this.phaseSeconds(session.phase) * 1000;
      if (phaseMs <= 0) break;
      const needPct = 100 - session.gaugePercent;
      const needMs = (needPct / 100) * phaseMs;
      if (remainingMs < needMs) {
        session.gaugePercent += (remainingMs / phaseMs) * 100;
        remainingMs = 0;
        break;
      }

      session.gaugePercent = 100;
      remainingMs -= needMs;
      if (session.phase === "EXPLORE") await this.resolveExplore(session);
      else if (session.phase === "BATTLE") await this.processTurn(session);
      else await this.resolveLoot(session);
      session.gaugePercent = 0;
    }

    session.updatedAtMs = now - remainingMs;
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
      name: u.name,
      spriteUrl: u.spriteUrl,
      hp: Math.max(0, Math.floor(u.hp)),
      maxHp: Math.floor(u.stats.maxHp),
      mana: Math.floor(u.mana),
      maxMana: Math.floor(u.stats.maxMana),
      alive: u.hp > 0,
    });
    return {
      id: session.id,
      status: session.status,
      phase: session.phase,
      gaugePercent: clamp(session.gaugePercent, 0, 100),
      locationId: session.location.locationId,
      locationName: session.location.name,
      locationImageUrl: session.location.imageUrl,
      waveIndex: session.waves[session.waveCursor]?.waveIndex ?? 1,
      allies: session.allies.map(toFighter),
      enemies: session.enemies.map(toFighter),
      logs: [...session.logs],
      reward: {
        credits: session.rewardCredits,
        exp: session.rewardExp,
        materialA: session.rewardMaterialA,
        materialB: session.rewardMaterialB,
      },
      retryCount: session.retryCount,
      clearCount: session.clearCount,
      droppedItems: [...session.totalDrops],
    };
  }
}

export const battleService = new BattleService();
