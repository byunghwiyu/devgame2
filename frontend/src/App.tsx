import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { useAuthStore } from "./store";
import type {
  BattleConfig,
  BattleState,
  CraftJob,
  DispatchStatus,
  Equipment,
  LocationRow,
  MercenaryView,
  OfferCard,
  ProfileData,
  PromotionJob,
  Recipe,
} from "./types";
import "./styles.css";

type Tab = "RECRUIT" | "OFFICE" | "FIELD" | "CRAFT";

const tabs: Array<{ key: Tab; label: string; sub: string }> = [
  { key: "RECRUIT", label: "Recruit", sub: "Offers and hiring" },
  { key: "OFFICE", label: "Office", sub: "Mercs and promotion" },
  { key: "FIELD", label: "Field", sub: "Dungeon battle" },
  { key: "CRAFT", label: "Craft", sub: "Gear pipeline" },
];

const defaultBattleConfig: BattleConfig = { maxPartySize: 4, teamSlotCount: 4 };

function formatLocationReward(loc: LocationRow): string {
  return `C${loc.baseCreditReward} / EXP${loc.baseExpReward} / A${loc.materialAReward} / B${loc.materialBReward}`;
}

function hpPct(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
}

function phaseLabel(phase?: BattleState["phase"]): string {
  if (phase === "EXPLORE") return "Exploring...";
  if (phase === "LOOT") return "Looting...";
  return "Battle...";
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n);
}

function fmtDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function popupLeft(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return `${18 + (hash % 64)}%`;
}

function dropIcon(type: string): string {
  if (type === "weapon") return "⚔";
  if (type === "armor") return "🛡";
  if (type === "accessory") return "💍";
  if (type === "extra") return "✨";
  return "📦";
}

function stackDrops(drops: BattleState["droppedItems"]) {
  const m = new Map<string, { key: string; name: string; type: string; count: number }>();
  for (const d of drops) {
    const key = `${d.itemId}:${d.equipType}`;
    const prev = m.get(key);
    if (prev) prev.count += 1;
    else m.set(key, { key, name: d.itemName, type: d.equipType, count: 1 });
  }
  return Array.from(m.values());
}

function equipIcon(type: string): string {
  if (type === "weapon") return "W";
  if (type === "armor") return "A";
  if (type === "accessory") return "R";
  if (type === "extra") return "X";
  return "?";
}

function talentHue(tag?: string | null): number {
  if (!tag) return 210;
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) % 360;
  }
  return hash;
}

function talentBadgeStyle(tag?: string | null) {
  const hue = talentHue(tag);
  return {
    borderColor: `hsl(${hue} 80% 62%)`,
    background: `hsl(${hue} 55% 21% / 0.92)`,
    color: `hsl(${hue} 95% 88%)`,
    boxShadow: `0 0 0 1px hsl(${hue} 70% 40% / 0.35) inset`,
  };
}

const MONSTER_ILLUST_BY_LABEL: Record<string, string> = {
  "늑대": "/assets/illustrations/monsters/mon_wolf.svg",
  "고블린": "/assets/illustrations/monsters/mon_goblin.svg",
  "슬라임": "/assets/illustrations/monsters/mon_slime.svg",
  "망령": "/assets/illustrations/monsters/mon_wraith.svg",
  "돌거인": "/assets/illustrations/monsters/mon_golem.svg",
  "바다뱀": "/assets/illustrations/monsters/mon_serpent.svg",
  "화염정령": "/assets/illustrations/monsters/mon_flame_lord.svg",
};

function fileNameOnly(v?: string | null): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const parts = raw.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function mercIllust(imageUrl?: string | null, spriteUrl?: string | null): string {
  if (imageUrl) {
    const base = fileNameOnly(imageUrl);
    const withExt = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.png`;
    return `/assets/illustrations/mercs/${withExt}`;
  }
  if (spriteUrl) return battleUnitIllust(spriteUrl);
  return "/assets/illustrations/mercs/char_laborer_a.svg";
}

function monsterIllust(label: string): string {
  return MONSTER_ILLUST_BY_LABEL[label] ?? "/assets/illustrations/monsters/mon_goblin.svg";
}

function battleUnitIllust(spriteUrl?: string | null): string {
  if (!spriteUrl) return "/assets/illustrations/mercs/char_laborer_a.svg";
  const base = fileNameOnly(spriteUrl);
  const lower = base.toLowerCase();
  const withExt = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.png`;
  if (lower.startsWith("char_")) return `/assets/illustrations/mercs/${withExt}`;
  if (lower.startsWith("mon_")) return `/assets/illustrations/monsters/${withExt}`;
  return `/assets/illustrations/mercs/${withExt}`;
}

function spriteSheetIllust(pathOrName: string | undefined, fallbackSpriteUrl?: string | null): string {
  const first = String(pathOrName ?? "").trim();
  const raw = first || String(fallbackSpriteUrl ?? "").trim();
  if (!raw) return battleUnitIllust(fallbackSpriteUrl);
  if (raw.startsWith("/assets/")) return raw;
  const base = fileNameOnly(raw);
  const withExt = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.png`;
  const lower = withExt.toLowerCase();
  if (lower.startsWith("mon_")) return `/assets/sprites/monsters/${withExt}`;
  return `/assets/sprites/mercs/${withExt}`;
}

type AtlasSpriteRect = {
  index?: number;
  clipIndex?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX?: number;
  pivotY?: number;
};

type AtlasMeta = {
  width?: number;
  height?: number;
  sprites?: AtlasSpriteRect[];
  sheet?: string;
  animation?: {
    idleIndices?: number[];
    attackIndices?: number[];
    idleFps?: number;
    attackFps?: number;
  };
};

const atlasMetaCache = new Map<string, AtlasMeta | null>();
let globalAtlasCache: Record<string, AtlasMeta> | null = null;
let globalAtlasPromise: Promise<Record<string, AtlasMeta> | null> | null = null;
const atlasFetchBust = Date.now().toString(36);

function loadGlobalAtlas(): Promise<Record<string, AtlasMeta> | null> {
  if (globalAtlasCache) return Promise.resolve(globalAtlasCache);
  if (globalAtlasPromise) return globalAtlasPromise;
  globalAtlasPromise = fetch(`/assets/sprites/sprite_atlas.json?v=${atlasFetchBust}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || typeof j !== "object") return null;
      globalAtlasCache = j as Record<string, AtlasMeta>;
      return globalAtlasCache;
    })
    .catch(() => null);
  return globalAtlasPromise;
}

function sheetMetaUrl(sheetUrl: string): string {
  const clean = sheetUrl.split("?")[0] ?? sheetUrl;
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return `${clean}.json`;
  return `${clean.slice(0, dot)}.json`;
}

function atlasKeyCandidates(unit: { spriteAtlasKey?: string; spriteUrl?: string; entityId?: string }): string[] {
  const out: string[] = [];
  if (unit.spriteAtlasKey) out.push(unit.spriteAtlasKey);
  if (unit.entityId) out.push(unit.entityId);
  const base = fileNameOnly(unit.spriteUrl).replace(/\.[a-z0-9]+$/i, "");
  if (base) {
    out.push(base);
    out.push(base.toUpperCase());
    if (base.startsWith("char_")) out.push(`CHAR_${base.slice(5)}`);
    if (base.startsWith("mon_")) out.push(`MON_${base.slice(4).toUpperCase()}`);
  }
  return Array.from(new Set(out.filter(Boolean)));
}

function BattleSprite({
  unit,
  fx,
  className,
}: {
  unit: BattleState["allies"][number];
  fx?: "attack" | "hit" | "skill" | "counter";
  className?: string;
}) {
  const idleSheet = spriteSheetIllust(unit.spriteIdle, unit.spriteUrl);
  const attackSheet = spriteSheetIllust(unit.spriteAttack, unit.spriteUrl);
  const idleIndexList = (unit.spriteIdleIndexList ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  const attackIndexList = (unit.spriteAttackIndexList ?? []).filter((n) => Number.isFinite(n) && n >= 0);

  const [idleNatural, setIdleNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [attackNatural, setAttackNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [idleMeta, setIdleMeta] = useState<AtlasMeta | null>(null);
  const [attackMeta, setAttackMeta] = useState<AtlasMeta | null>(null);
  const [globalAtlasEntry, setGlobalAtlasEntry] = useState<AtlasMeta | null>(null);
  const atlasAnim = globalAtlasEntry?.animation as
    | { idleIndices?: number[]; attackIndices?: number[]; idleFps?: number; attackFps?: number }
    | undefined;
  const atlasIdleIndexList = (atlasAnim?.idleIndices ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  const atlasAttackIndexList = (atlasAnim?.attackIndices ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  const mergedIdleIndexList = (idleIndexList.length > 0 ? idleIndexList : atlasIdleIndexList) as number[];
  const mergedAttackIndexList = (attackIndexList.length > 0 ? attackIndexList : atlasAttackIndexList) as number[];
  const idleFrames = Math.max(1, unit.spriteIdleFrames ?? (mergedIdleIndexList.length > 0 ? mergedIdleIndexList.length : 1));
  const attackFrames = Math.max(1, unit.spriteAttackFrames ?? (mergedAttackIndexList.length > 0 ? mergedAttackIndexList.length : idleFrames));
  const hasFrameMeta = Boolean(unit.spriteFrameWidth && unit.spriteFrameHeight);
  const hasSpriteSheetBase = Boolean(
    (unit.spriteIdle || unit.spriteAttack || hasFrameMeta) &&
      (idleFrames > 1 || attackFrames > 1 || idleIndexList.length > 1 || attackIndexList.length > 1),
  );
  const idleFps = Math.max(1, unit.spriteIdleFps ?? atlasAnim?.idleFps ?? 5);
  const attackFps = Math.max(1, unit.spriteAttackFps ?? atlasAnim?.attackFps ?? 8);
  const frameWidth = Math.max(16, unit.spriteFrameWidth ?? 96);
  const frameHeight = Math.max(16, unit.spriteFrameHeight ?? frameWidth);
  const hasSpriteSheet = (globalAtlasEntry?.sprites?.length ?? 0) > 0 || hasSpriteSheetBase;

  const [mode, setMode] = useState<"idle" | "attack">("idle");
  const [frame, setFrame] = useState(0);
  const nextAttackAllowedAtRef = useRef(0);

  useEffect(() => {
    if (!(fx === "attack" || fx === "skill" || fx === "counter")) return;
    if (!hasSpriteSheet) return;
    const now = Date.now();
    if (now < nextAttackAllowedAtRef.current) return;
    setMode("attack");
    setFrame(0);
    const duration = Math.max(180, Math.round((attackFrames / Math.max(1, attackFps)) * 1000));
    const idleHoldMs = 220;
    nextAttackAllowedAtRef.current = now + duration + idleHoldMs;
  }, [fx, hasSpriteSheet, attackFrames, attackFps]);

  useEffect(() => {
    if (!hasSpriteSheet) return;
    const frames = mode === "attack" ? attackFrames : idleFrames;
    const fps = mode === "attack" ? attackFps : idleFps;
    const stepMs = Math.max(95, Math.floor(1000 / fps));
    const timer = setInterval(() => {
      setFrame((prev) => {
        if (mode === "attack") return Math.min(prev + 1, frames - 1);
        return (prev + 1) % frames;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [mode, hasSpriteSheet, attackFrames, idleFrames, attackFps, idleFps]);

  useEffect(() => {
    if (!hasSpriteSheet) return;
    if (mode !== "attack") return;
    if (frame < attackFrames - 1) return;
    const timer = setTimeout(() => {
      setMode("idle");
      setFrame(0);
    }, 70);
    return () => clearTimeout(timer);
  }, [frame, mode, attackFrames, hasSpriteSheet]);

  useEffect(() => {
    let alive = true;
    const candidates = atlasKeyCandidates(unit);
    if (candidates.length < 1) {
      setGlobalAtlasEntry(null);
      return () => {
        alive = false;
      };
    }
    loadGlobalAtlas().then((db) => {
      if (!alive) return;
      let found: AtlasMeta | null = null;
      if (db) {
        for (const k of candidates) {
          if (db[k]) {
            found = db[k];
            break;
          }
        }
      }
      setGlobalAtlasEntry(found);
    });
    return () => {
      alive = false;
    };
  }, [unit.spriteAtlasKey, unit.spriteUrl, unit.entityId]);

  useEffect(() => {
    if (!idleSheet) return;
    const img = new Image();
    img.onload = () => setIdleNatural({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.src = idleSheet;
  }, [idleSheet]);

  useEffect(() => {
    if (!attackSheet) return;
    const img = new Image();
    img.onload = () => setAttackNatural({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.src = attackSheet;
  }, [attackSheet]);

  useEffect(() => {
    let alive = true;
    const key = sheetMetaUrl(idleSheet);
    const cached = atlasMetaCache.get(key);
    if (cached !== undefined) {
      setIdleMeta(cached);
      return () => {
        alive = false;
      };
    }
    fetch(key)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j && typeof j === "object" ? (j as AtlasMeta) : null;
        atlasMetaCache.set(key, v);
        if (alive) setIdleMeta(v);
      })
      .catch(() => {
        atlasMetaCache.set(key, null);
        if (alive) setIdleMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [idleSheet]);

  useEffect(() => {
    let alive = true;
    const key = sheetMetaUrl(attackSheet);
    const cached = atlasMetaCache.get(key);
    if (cached !== undefined) {
      setAttackMeta(cached);
      return () => {
        alive = false;
      };
    }
    fetch(key)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j && typeof j === "object" ? (j as AtlasMeta) : null;
        atlasMetaCache.set(key, v);
        if (alive) setAttackMeta(v);
      })
      .catch(() => {
        atlasMetaCache.set(key, null);
        if (alive) setAttackMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [attackSheet]);

  if (!hasSpriteSheet) {
    return <img className={className ?? "spriteImg"} src={battleUnitIllust(unit.spriteUrl)} alt={unit.name} />;
  }

  const frames = mode === "attack" ? attackFrames : idleFrames;
  const local = frame % frames;
  const idx =
    mode === "attack"
      ? attackIndexList.length > 0
        ? mergedAttackIndexList[local % mergedAttackIndexList.length]
        : local
      : mergedIdleIndexList.length > 0
        ? mergedIdleIndexList[local % mergedIdleIndexList.length]
        : local;
  const atlasSheet = globalAtlasEntry?.sheet ? spriteSheetIllust(globalAtlasEntry.sheet, unit.spriteUrl) : "";
  const sheet = atlasSheet || (mode === "attack" ? attackSheet : idleSheet);
  const natural = mode === "attack" ? attackNatural : idleNatural;
  const meta = globalAtlasEntry ?? (mode === "attack" ? attackMeta : idleMeta);
  const mergedIdleColsByList = Math.max(1, idleFrames, mergedIdleIndexList.length > 0 ? Math.max(...mergedIdleIndexList) + 1 : 1);
  const mergedAttackColsByList = Math.max(1, attackFrames, mergedAttackIndexList.length > 0 ? Math.max(...mergedAttackIndexList) + 1 : 1);
  const colsByList = mode === "attack" ? mergedAttackColsByList : mergedIdleColsByList;
  const inferredCols = natural.w > 0 ? Math.max(colsByList, Math.round(natural.w / frameWidth)) : colsByList;
  const clipFrameWidth = natural.w > 0 ? Math.max(1, Math.floor(natural.w / inferredCols)) : frameWidth;
  const clipFrameHeight = Math.max(1, frameHeight);
  const atlasSprites = meta?.sprites ?? [];
  const rectByClip = atlasSprites.find((r) => (r.clipIndex ?? r.index) === idx);
  const rectByIndex = atlasSprites.find((r) => (r.index ?? -1) === idx);
  const rect = rectByClip ?? rectByIndex ?? null;
  const srcW = Math.max(1, rect?.w ?? clipFrameWidth);
  const srcH = Math.max(1, rect?.h ?? clipFrameHeight);
  const targetPx = 78;
  const renderScale = Math.max(0.35, Math.min(1, targetPx / srcW, targetPx / srcH));
  const renderW = Math.max(24, Math.round(srcW * renderScale));
  const renderH = Math.max(24, Math.round(srcH * renderScale));
  const pivotX = Math.max(0, Math.min(1, rect?.pivotX ?? unit.spritePivotX ?? 0.5));
  const pivotY = Math.max(0, Math.min(1, rect?.pivotY ?? unit.spritePivotY ?? 0.85));
  const atlasW = meta?.width ?? (natural.w > 0 ? natural.w : inferredCols * clipFrameWidth);
  const atlasH = meta?.height ?? (natural.h > 0 ? natural.h : clipFrameHeight);
  const bgPosX = rect ? -Math.round(rect.x * renderScale) : -Math.round(idx * clipFrameWidth * renderScale);
  const bgPosY = rect ? -Math.round(rect.y * renderScale) : 0;
  const bgW = rect ? Math.max(1, Math.round(atlasW * renderScale)) : Math.round(inferredCols * clipFrameWidth * renderScale);
  const bgH = rect ? Math.max(1, Math.round(atlasH * renderScale)) : Math.round(clipFrameHeight * renderScale);
  return (
    <span
      className={className ?? "spriteSheet"}
      style={{
        backgroundImage: `url(${sheet})`,
        width: `${renderW}px`,
        height: `${renderH}px`,
        backgroundPosition: `${bgPosX}px ${bgPosY}px`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundRepeat: "no-repeat",
        transformOrigin: `${Math.round(pivotX * 100)}% ${Math.round(pivotY * 100)}%`,
      }}
      aria-label={unit.name}
      role="img"
    />
  );
}

export default function App() {
  const { token, setToken } = useAuthStore();
  const [authMode, setAuthMode] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [authAccount, setAuthAccount] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [tab, setTab] = useState<Tab>("RECRUIT");
  const [profile, setProfile] = useState<ProfileData>();
  const [offers, setOffers] = useState<OfferCard[]>([]);
  const [mercs, setMercs] = useState<MercenaryView[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [dispatch, setDispatch] = useState<DispatchStatus | null>(null);
  const [promotions, setPromotions] = useState<PromotionJob[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [craftJobs, setCraftJobs] = useState<CraftJob[]>([]);
  const [equips, setEquips] = useState<Equipment[]>([]);
  const [selectedMercForEquip, setSelectedMercForEquip] = useState<string>("");
  const [battleConfig, setBattleConfig] = useState<BattleConfig>(defaultBattleConfig);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number>(0);
  const [teamLocationId, setTeamLocationId] = useState<string>("");
  const [teamSlots, setTeamSlots] = useState<Array<string | null>>(Array.from({ length: defaultBattleConfig.teamSlotCount }, () => null));

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [battles, setBattles] = useState<BattleState[]>([]);
  const [battlePageOpen, setBattlePageOpen] = useState(false);
  const [activeBattleId, setActiveBattleId] = useState<string>("");
  const [battleReportOpen, setBattleReportOpen] = useState(false);
  const [battleReportTarget, setBattleReportTarget] = useState<BattleState | null>(null);
  const [unitFx, setUnitFx] = useState<Record<string, "attack" | "hit" | "skill" | "counter">>({});
  const [damagePopups, setDamagePopups] = useState<
    Array<{ id: string; unitId?: string; unitName?: string; side: "ALLY" | "ENEMY"; kind: "hit" | "heal" | "miss"; value?: number }>
  >([]);
  const [talentPopup, setTalentPopup] = useState<{ name: string; description: string } | null>(null);

  const [toast, setToast] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const battleRef = useRef<BattleState | null>(null);
  const lastCombatSeqRef = useRef<Record<string, number>>({});
  const lastLogIndexRef = useRef<Record<string, number>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const ensureTeamSlotSize = (count: number) => {
    setTeamSlots((prev) => {
      const next = Array.from({ length: count }, (_, idx) => prev[idx] ?? null);
      return next;
    });
  };

  const syncAll = async (t: string) => {
    const [cfg, p, os, ms, ls, ds, ps, rs, cs, es, battleList] = await Promise.all([
      api.battleConfig(),
      api.profile(t),
      api.offers(t),
      api.mercenaries(t),
      api.locations(t),
      api.dispatchStatus(t),
      api.promotionStatus(t),
      api.recipes(t),
      api.craftStatus(t),
      api.equipments(t),
      api.battleList(t),
    ]);
    setBattleConfig(cfg);
    ensureTeamSlotSize(cfg.teamSlotCount);

    setProfile(p);
    setOffers(os);
    setMercs(ms);
    setLocations(ls);
    setDispatch(ds);
    setPromotions(ps);
    setRecipes(rs);
    setCraftJobs(cs);
    setEquips(es);
    setBattles(battleList);
    const picked = battleList.find((b) => b.id === activeBattleId) ?? battleList[0] ?? null;
    setBattle(picked);
    battleRef.current = picked;
    if (picked) setActiveBattleId(picked.id);
    if (!teamLocationId && ls[0]) setTeamLocationId(ls[0].locationId);
  };

  const guarded = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message === "HTTP_401" || message === "UNAUTHORIZED") {
        setToken(null);
        showToast("Session reset. Reconnecting...");
      } else {
        showToast(`Failed: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    guarded(async () => {
      await syncAll(token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const tick = async () => {
      try {
        const list = await api.battleList(token);
        const prev = battleRef.current;
        const nextActive = list.find((b) => b.id === activeBattleId) ?? list[0] ?? null;
        if (nextActive) {
          const lastSeq = lastCombatSeqRef.current[nextActive.id] ?? 0;
          const newEvents = (nextActive.combatEvents ?? []).filter((e) => e.seq > lastSeq);
          if (newEvents.length > 0) {
            const nextFx: Record<string, "attack" | "hit" | "skill" | "counter"> = {};
            const toPopups: Array<{ id: string; unitId?: string; unitName?: string; side: "ALLY" | "ENEMY"; kind: "hit" | "heal" | "miss"; value?: number }> = [];
            for (const ev of newEvents) {
              if (ev.attackerId && (ev.kind === "hit" || ev.kind === "skill" || ev.kind === "counter")) {
                nextFx[ev.attackerId] = ev.kind === "skill" ? "skill" : ev.kind === "counter" ? "counter" : "attack";
              }
              if (ev.targetId && (ev.kind === "hit" || ev.kind === "counter")) {
                nextFx[ev.targetId] = "hit";
              }
              if (ev.targetId && (ev.kind === "hit" || ev.kind === "heal") && typeof ev.value === "number" && ev.value > 0) {
                toPopups.push({
                  id: `${ev.seq}-${ev.targetId}`,
                  unitId: ev.targetId,
                  unitName: ev.targetName,
                  side: ev.targetSide ?? "ENEMY",
                  kind: ev.kind,
                  value: ev.value,
                });
              }
              if (ev.targetId && ev.kind === "miss") {
                toPopups.push({
                  id: `${ev.seq}-${ev.targetId}-miss`,
                  unitId: ev.targetId,
                  unitName: ev.targetName,
                  side: ev.targetSide ?? "ENEMY",
                  kind: "miss",
                });
              }
            }
            if (Object.keys(nextFx).length > 0) {
              setUnitFx((prevFx) => ({ ...prevFx, ...nextFx }));
              setTimeout(() => {
                setUnitFx((prevFx) => {
                  const out = { ...prevFx };
                  Object.keys(nextFx).forEach((k) => delete out[k]);
                  return out;
                });
              }, 320);
            }
            if (toPopups.length > 0) {
              setDamagePopups((prevPop) => [...prevPop, ...toPopups].slice(-36));
              setTimeout(() => {
                setDamagePopups((prevPop) => prevPop.filter((p) => !toPopups.some((n) => n.id === p.id)));
              }, 950);
            }
            const maxSeq = newEvents[newEvents.length - 1]?.seq ?? lastSeq;
            lastCombatSeqRef.current[nextActive.id] = Math.max(lastCombatSeqRef.current[nextActive.id] ?? 0, maxSeq);
          }

          if (prev && prev.id === nextActive.id) {
            const fallback: Array<{ id: string; unitId?: string; unitName?: string; side: "ALLY" | "ENEMY"; kind: "hit" | "heal" | "miss"; value?: number }> = [];
            const fallbackFx: Record<string, "hit"> = {};
            for (const u of nextActive.allies) {
              const p = prev.allies.find((x) => x.id === u.id || x.name === u.name);
              if (!p) continue;
              if (u.hp < p.hp) {
                fallback.push({ id: `fb-a-hit-${u.id}-${Date.now()}`, unitId: u.id, unitName: u.name, side: "ALLY", kind: "hit", value: p.hp - u.hp });
                fallbackFx[u.id] = "hit";
              }
              if (u.hp > p.hp) fallback.push({ id: `fb-a-heal-${u.id}-${Date.now()}`, unitId: u.id, unitName: u.name, side: "ALLY", kind: "heal", value: u.hp - p.hp });
            }
            for (const u of nextActive.enemies) {
              const p = prev.enemies.find((x) => x.id === u.id || x.name === u.name);
              if (!p) continue;
              if (u.hp < p.hp) {
                fallback.push({ id: `fb-e-hit-${u.id}-${Date.now()}`, unitId: u.id, unitName: u.name, side: "ENEMY", kind: "hit", value: p.hp - u.hp });
                fallbackFx[u.id] = "hit";
              }
              if (u.hp > p.hp) fallback.push({ id: `fb-e-heal-${u.id}-${Date.now()}`, unitId: u.id, unitName: u.name, side: "ENEMY", kind: "heal", value: u.hp - p.hp });
            }
            if (Object.keys(fallbackFx).length > 0) {
              setUnitFx((prevFx) => ({ ...prevFx, ...fallbackFx }));
              setTimeout(() => {
                setUnitFx((prevFx) => {
                  const out = { ...prevFx };
                  Object.keys(fallbackFx).forEach((k) => delete out[k]);
                  return out;
                });
              }, 260);
            }
            if (fallback.length > 0) {
              setDamagePopups((prevPop) => [...prevPop, ...fallback].slice(-48));
              setTimeout(() => {
                setDamagePopups((prevPop) => prevPop.filter((p) => !fallback.some((n) => n.id === p.id)));
              }, 900);
            }
          }

          // Final fallback: parse new log lines and force FX/popup by unit name.
          const lastLogIndex = lastLogIndexRef.current[nextActive.id] ?? 0;
          const appendedLogs = nextActive.logs.slice(lastLogIndex);
          if (appendedLogs.length > 0) {
            const nameToUnit = new Map<string, { id: string; side: "ALLY" | "ENEMY" }>();
            nextActive.allies.forEach((u) => nameToUnit.set(u.name, { id: u.id, side: "ALLY" }));
            nextActive.enemies.forEach((u) => nameToUnit.set(u.name, { id: u.id, side: "ENEMY" }));
            const logFx: Record<string, "attack" | "hit" | "skill" | "counter"> = {};
            const logPops: Array<{ id: string; unitId?: string; unitName?: string; side: "ALLY" | "ENEMY"; kind: "hit" | "heal" | "miss"; value?: number }> =
              [];

            appendedLogs.forEach((line, li) => {
              const mDamage = line.match(/^(.+?)\s*->\s*(.+?)\s+(\d+)/);
              if (mDamage) {
                const atk = nameToUnit.get(mDamage[1].trim());
                const tgtName = mDamage[2].trim();
                const tgt = nameToUnit.get(tgtName);
                const value = Number(mDamage[3]);
                if (atk) logFx[atk.id] = "attack";
                if (tgt) logFx[tgt.id] = "hit";
                logPops.push({
                  id: `log-dmg-${nextActive.id}-${lastLogIndex + li}-${tgt?.id ?? tgtName}`,
                  unitId: tgt?.id,
                  unitName: tgtName,
                  side: tgt?.side ?? "ENEMY",
                  kind: "hit",
                  value,
                });
              }

              const mHeal = !line.includes("->") ? line.match(/^(.+?)\D+\+(\d+)/) : null;
              if (mHeal) {
                const whoName = mHeal[1].trim();
                const who = nameToUnit.get(whoName);
                const value = Number(mHeal[2]);
                logPops.push({
                  id: `log-heal-${nextActive.id}-${lastLogIndex + li}-${who?.id ?? whoName}`,
                  unitId: who?.id,
                  unitName: whoName,
                  side: who?.side ?? "ALLY",
                  kind: "heal",
                  value,
                });
              }

            });

            if (Object.keys(logFx).length > 0) {
              setUnitFx((prevFx) => ({ ...prevFx, ...logFx }));
              setTimeout(() => {
                setUnitFx((prevFx) => {
                  const out = { ...prevFx };
                  Object.keys(logFx).forEach((k) => delete out[k]);
                  return out;
                });
              }, 420);
            }
            if (logPops.length > 0) {
              setDamagePopups((prevPop) => [...prevPop, ...logPops].slice(-60));
              setTimeout(() => {
                setDamagePopups((prevPop) => prevPop.filter((p) => !logPops.some((n) => n.id === p.id)));
              }, 1100);
            }
            lastLogIndexRef.current[nextActive.id] = nextActive.logs.length;
          }
        }
        setBattles(list);
        setBattle(nextActive);
        battleRef.current = nextActive;
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 700);
    return () => clearInterval(timer);
  }, [token, activeBattleId]);

  useEffect(() => {
    if (!battleReportOpen || !battleReportTarget) return;
    const live = battles.find((b) => b.id === battleReportTarget.id);
    if (live) setBattleReportTarget(live);
  }, [battleReportOpen, battleReportTarget, battles]);

  const nextReset = useMemo(() => {
    if (offers.length < 1) return "-";
    const remain = Math.max(0, Math.ceil((new Date(offers[0].expiresAt).getTime() - Date.now()) / 1000));
    return `${Math.floor(remain / 60)}m ${remain % 60}s`;
  }, [offers]);

  const inProgressDispatch = dispatch?.status === "IN_PROGRESS" ? 1 : 0;
  const inProgressCraft = craftJobs.filter((j) => j.status === "IN_PROGRESS").length;
  const inProgressPromotion = promotions.filter((p) => p.status === "IN_PROGRESS").length;
  const avgPower = mercs.length > 0 ? Math.round(mercs.reduce((sum, m) => sum + m.power, 0) / mercs.length) : 0;

  const mercMap = useMemo(() => new Map(mercs.map((m) => [m.id, m])), [mercs]);
  const equipByMerc = useMemo(() => {
    const m = new Map<string, Equipment[]>();
    for (const e of equips) {
      if (!e.equippedMercId) continue;
      if (!m.has(e.equippedMercId)) m.set(e.equippedMercId, []);
      m.get(e.equippedMercId)!.push(e);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => (a.slotIndex ?? 99) - (b.slotIndex ?? 99));
      m.set(k, arr.slice(0, 3));
    }
    return m;
  }, [equips]);

  const pickerSelectedSet = useMemo(() => {
    const set = new Set<string>();
    teamSlots.forEach((id, idx) => {
      if (id && idx !== pickerSlot) set.add(id);
    });
    return set;
  }, [teamSlots, pickerSlot]);
  const pickerMercs = useMemo(
    () => mercs.filter((m) => !m.isDispatched && !pickerSelectedSet.has(m.id)),
    [mercs, pickerSelectedSet],
  );

  const dispatchedLocationIds = useMemo(() => {
    const set = new Set<string>();
    battles.forEach((b) => {
      if (b.status === "IN_PROGRESS") set.add(b.locationId);
    });
    return set;
  }, [battles]);

  const visibleLocations = useMemo(
    () => locations.filter((loc) => !dispatchedLocationIds.has(loc.locationId)),
    [locations, dispatchedLocationIds],
  );

  const openTeamModal = (locationId: string) => {
    setTeamLocationId(locationId);
    setTeamSlots(Array.from({ length: battleConfig.teamSlotCount }, () => null));
    setPickerOpen(false);
    setPickerSlot(0);
    setTeamModalOpen(true);
  };

  const assignMercToSlot = (mercId: string) => {
    setTeamSlots((prev) => {
      const next = [...prev];
      const existsAt = next.findIndex((id, idx) => id === mercId && idx !== pickerSlot);
      if (existsAt >= 0) next[existsAt] = null;
      next[pickerSlot] = mercId;
      return next;
    });
    setPickerOpen(false);
  };

  const openTalentPopup = (merc: MercenaryView) => {
    if (!merc.talentName || !merc.talentDescription) return;
    setTalentPopup({ name: merc.talentName, description: merc.talentDescription });
  };

  const clearTeamSlots = () => {
    setTeamSlots(Array.from({ length: battleConfig.teamSlotCount }, () => null));
    setPickerOpen(false);
    setPickerSlot(0);
    showToast("Team slots cleared");
  };

  const sendTeam = async () => {
    if (!token) return;
    const partyIds = teamSlots.filter((id): id is string => typeof id === "string" && mercMap.has(id));
    if (partyIds.length < 1) {
      showToast("Pick at least 1 merc");
      return;
    }
    const started = await api.battleStart(token, teamLocationId, partyIds);
    setBattle(started);
    setActiveBattleId(started.id);
    setBattlePageOpen(true);
    setTeamModalOpen(false);
    await syncAll(token);
    showToast("Battle started");
  };

  const handleLogin = async () => {
    if (!authAccount || !authPassword) {
      setError("Please enter account and password.");
      return;
    }
    await guarded(async () => {
      const { token: nextToken } = await api.login(authAccount, authPassword);
      setToken(nextToken);
      await syncAll(nextToken);
      showToast("Login complete");
    });
  };

  const handleSignup = async () => {
    if (!authAccount || !authPassword) {
      setError("Please enter account and password.");
      return;
    }
    await guarded(async () => {
      const { token: nextToken } = await api.signup(authAccount, authPassword, authNickname || undefined);
      setToken(nextToken);
      await syncAll(nextToken);
      showToast("Sign up complete");
    });
  };

  if (!token) {
    return (
      <main className="page authPage">
        <div className="bgMesh" />
        <section className="authPanel">
          <p className="eyebrow">Inryuk Office</p>
          <h1>Account Login</h1>
          <p className="small">Create an account now. Email verification will be added later.</p>

          <div className="authSwitch">
            <button className={authMode === "LOGIN" ? "active" : ""} onClick={() => setAuthMode("LOGIN")}>
              Login
            </button>
            <button className={authMode === "SIGNUP" ? "active" : ""} onClick={() => setAuthMode("SIGNUP")}>
              Sign Up
            </button>
          </div>

          <input
            className="input"
            type="text"
            placeholder="account id"
            value={authAccount}
            onChange={(e) => setAuthAccount(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="password (6+ chars)"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />
          {authMode === "SIGNUP" && (
            <input className="input" placeholder="nickname (optional)" value={authNickname} onChange={(e) => setAuthNickname(e.target.value)} />
          )}

          {error && <div className="toast error">{error}</div>}
          <button className="authSubmit" disabled={loading} onClick={() => (authMode === "LOGIN" ? handleLogin() : handleSignup())}>
            {authMode === "LOGIN" ? "Login" : "Sign Up"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="bgMesh" />

      <header className="hero">
        <div className="heroHead">
          <div>
            <p className="eyebrow">Vertical Slice Console</p>
            <h1>Operations Control Room</h1>
          </div>
          <div className="actions">
            <button
              disabled={!token || loading}
              onClick={() =>
                guarded(async () => {
                  await api.cheatCredits(token!);
                  await syncAll(token!);
                  showToast("Credits +100,000");
                })
              }
            >
              Cheat +100,000
            </button>
            <button
              onClick={() => {
                setToken(null);
                setProfile(undefined);
                setOffers([]);
                setMercs([]);
                setLocations([]);
                setDispatch(null);
                setPromotions([]);
                setRecipes([]);
                setCraftJobs([]);
                setEquips([]);
                setBattle(null);
                setBattles([]);
                setActiveBattleId("");
                battleRef.current = null;
                lastCombatSeqRef.current = {};
                lastLogIndexRef.current = {};
                setUnitFx({});
                setDamagePopups([]);
                showToast("Logged out");
              }}
            >
              Logout
            </button>
            <button
              disabled={!token || loading}
              onClick={() =>
                guarded(async () => {
                  await syncAll(token!);
                  showToast("Synced");
                })
              }
            >
              Sync
            </button>
          </div>
        </div>

        <section className="statGrid">
          <article className="statCard">
            <span>Credits</span>
            <strong>{profile?.user.credits ?? 0}</strong>
          </article>
          <article className="statCard">
            <span>Material A</span>
            <strong>{profile?.user.materialA ?? 0}</strong>
          </article>
          <article className="statCard">
            <span>Material B</span>
            <strong>{profile?.user.materialB ?? 0}</strong>
          </article>
          <article className="statCard">
            <span>Offer reset</span>
            <strong>{nextReset}</strong>
          </article>
        </section>

        <section className="metaRow">
          <p>Mercs {mercs.length}</p>
          <p>Avg Power {avgPower}</p>
          <p>Dispatching {inProgressDispatch}</p>
          <p>Crafting {inProgressCraft}</p>
          <p>Promoting {inProgressPromotion}</p>
        </section>
      </header>

      <nav className="tabNav">
        {tabs.map((t) => (
          <button key={t.key} className={`tabBtn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            <span>{t.label}</span>
            <small>{t.sub}</small>
          </button>
        ))}
      </nav>

      {toast && <div className="toast success">{toast}</div>}
      {error && <div className="toast error">{error}</div>}

      {tab === "FIELD" && battlePageOpen && battle && (
        <section className="fieldBattlePage">
          <article className="panel battlePanel">
            <div className="battleHeader">
              <div>
                <h2>{battle.locationName}</h2>
                <p className="small">
                  Stage {battle.waveIndex} ({battle.stageType ?? "BATTLE"}) | Turn {battle.actionTurn ?? 0} | {phaseLabel(battle.phase)} | Retry{" "}
                  {battle.retryCount} | Clear {battle.clearCount}
                </p>
              </div>
              <button onClick={() => setBattlePageOpen(false)}>Back</button>
            </div>

            <div className="battleArena" style={{ backgroundImage: `url(${battle.locationImageUrl})` }}>
              {(() => {
                const currentUnitIds = new Set([...battle.allies.map((u) => u.id), ...battle.enemies.map((u) => u.id)]);
                const currentUnitNames = new Set([...battle.allies.map((u) => u.name), ...battle.enemies.map((u) => u.name)]);
                const floatingPopups = damagePopups.filter((p) => {
                  if (p.unitId && currentUnitIds.has(p.unitId)) return false;
                  if (p.unitName && currentUnitNames.has(p.unitName)) return false;
                  return true;
                });
                return (
                  <div className="damageLayer">
                    {floatingPopups.map((p) => (
                      <span
                        key={`floating-${p.id}`}
                        className={`damagePopup floating ${p.side === "ALLY" ? "ally" : "enemy"} ${
                          p.kind === "heal" ? "heal" : p.kind === "miss" ? "miss" : "hit"
                        }`}
                        style={{ left: popupLeft(p.id), top: p.side === "ALLY" ? "72%" : "28%" }}
                      >
                        {p.kind === "miss" ? "MISS" : p.kind === "heal" ? `+${p.value}` : `-${p.value}`}
                      </span>
                    ))}
                  </div>
                );
              })()}
              <div className="battleLane battleLaneAllies">
                {battle.allies.map((u) => (
                  <div key={u.id} className={`sprite ally ${u.alive ? "" : "dead"} ${unitFx[u.id] ? `fx-${unitFx[u.id]}` : ""}`}>
                    <BattleSprite unit={u} fx={unitFx[u.id]} className="spriteImg" />
                    <strong className="spriteName">{u.name}</strong>
                    <div className="spritePopups">
                      {damagePopups
                        .filter((p) => p.unitId === u.id || p.unitName === u.name)
                        .map((p) => (
                          <span key={p.id} className={`damagePopup ally ${p.kind === "heal" ? "heal" : p.kind === "miss" ? "miss" : "hit"}`}>
                            {p.kind === "miss" ? "MISS" : p.kind === "heal" ? `+${p.value}` : `-${p.value}`}
                          </span>
                        ))}
                    </div>
                    <div className="hpBar">
                      <span style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
                    </div>
                    <div className="mpBar">
                      <span style={{ width: `${hpPct(u.mana, u.maxMana)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="battleLane battleLaneEnemies">
                {battle.enemies.map((u) => (
                  <div key={u.id} className={`sprite enemy ${u.alive ? "" : "dead"} ${unitFx[u.id] ? `fx-${unitFx[u.id]}` : ""}`}>
                    <BattleSprite unit={u} fx={unitFx[u.id]} className="spriteImg" />
                    <strong className="spriteName">{u.name}</strong>
                    <div className="spritePopups">
                      {damagePopups
                        .filter((p) => p.unitId === u.id || p.unitName === u.name)
                        .map((p) => (
                          <span key={p.id} className={`damagePopup enemy ${p.kind === "heal" ? "heal" : p.kind === "miss" ? "miss" : "hit"}`}>
                            {p.kind === "miss" ? "MISS" : p.kind === "heal" ? `+${p.value}` : `-${p.value}`}
                          </span>
                        ))}
                    </div>
                    <div className="hpBar">
                      <span style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
                    </div>
                    <div className="mpBar">
                      <span style={{ width: `${hpPct(u.mana, u.maxMana)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="turnGauge">
              <span style={{ width: `${battle.gaugePercent}%` }} />
            </div>

            <div className="battleLog">
              {battle.logs.slice(-10).map((line, idx) => (
                <p key={`${idx}-${line}`}>
                  {line.split(" ").map((token, ti) => {
                    const clean = token.replace(/[,:]/g, "");
                    const isAlly = battle.allies.some((u) => u.name === clean);
                    const isEnemy = battle.enemies.some((u) => u.name === clean);
                    const isDamage = /\d+/.test(clean) && /->/.test(line);
                    const cls = isDamage ? "logDamage" : isAlly ? "logAlly" : isEnemy ? "logEnemy" : "";
                    return (
                      <span key={`${ti}-${token}`} className={cls}>
                        {token}{" "}
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>

            <div className="dropLine">
              {battle.droppedItems.length < 1 ? (
                <span>No drops yet</span>
              ) : (
                <div className="dropStackRow">
                  {stackDrops(battle.droppedItems).map((d) => (
                    <span key={d.key} className="dropIconChip" title={d.name}>
                      <i>{dropIcon(d.type)}</i>
                      <em>x{d.count}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="battleBottom">
              <button
                disabled={!token || loading || battle.status !== "IN_PROGRESS"}
                onClick={() =>
                  guarded(async () => {
                    const next = await api.battleRetreat(token!, battle.id);
                    setBattle(next);
                    await syncAll(token!);
                    showToast("Retreated");
                  })
                }
              >
                Retreat
              </button>
              <button
                disabled={!token || loading}
                onClick={() =>
                  guarded(async () => {
                    await api.battleClose(token!, battle.id);
                    setBattle(null);
                    setBattlePageOpen(false);
                    await syncAll(token!);
                    showToast("Battle closed");
                  })
                }
              >
                Close
              </button>
            </div>
          </article>
        </section>
      )}

      {tab === "FIELD" && !battlePageOpen && (
        <section className="fieldLayout">
          {battles.length > 0 && (
            <div className="fieldBattleList">
              {battles.map((b) => (
                <article key={b.id} className="panel fieldCurrentBattle">
                  <div className="fieldCurrentMain" style={{ backgroundImage: `url(${b.locationImageUrl})` }}>
                    <h2>{b.locationName}</h2>
                    <div className="fieldCurrentParty">
                      {b.allies.map((u) => (
                        <div key={u.id} className="fieldCurrentUnit">
                          <img className="fieldCurrentImg" src={battleUnitIllust(u.spriteUrl)} alt={u.name} />
                          <em style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
                        </div>
                      ))}
                    </div>
                    <p className="small">
                      Stage {b.waveIndex} ({b.stageType ?? "BATTLE"}) | {phaseLabel(b.phase)} | Clear {b.clearCount} | Retry {b.retryCount}
                    </p>
                    <div className="turnGauge mini">
                      <span style={{ width: `${b.gaugePercent}%` }} />
                    </div>
                  </div>
                  <div className="fieldCurrentActions">
                    <button
                      onClick={() => {
                        setActiveBattleId(b.id);
                        setBattle(b);
                        setBattlePageOpen(true);
                      }}
                    >
                      Open Battle
                    </button>
                    <button
                      className="dropReportBtn"
                      onClick={() => {
                        setBattleReportTarget(b);
                        setBattleReportOpen(true);
                      }}
                      aria-label="Open battle report"
                      title="Open battle report"
                    >
                      🎒
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="fieldStack">
            {visibleLocations.map((field) => (
              <article key={field.locationId} className={`fieldCard ${teamLocationId === field.locationId ? "active" : ""}`}>
                <img src={field.imageUrl} alt={field.name} className="fieldThumb" />
                <div className="fieldOverlay">
                  <div className="fieldTop">
                    <div>
                      <h3>{field.name}</h3>
                      <p>{field.description}</p>
                    </div>
                    <span className={`fieldBadge ${field.isOpen ? "ready" : "soon"}`}>
                      {field.isOpen ? `Difficulty ${field.difficulty}` : "Closed"}
                    </span>
                  </div>

                  <div className="fieldMonsters">
                    {field.monsters.map((monster) => (
                      <span key={monster} className="monsterChip">
                        <img className="monsterChipImg" src={monsterIllust(monster)} alt={monster} />
                        {monster}
                      </span>
                    ))}
                  </div>

                  <div className="fieldMeta">
                    <span>Reward: {formatLocationReward(field)}</span>
                    <span>Duration: {field.dispatchSeconds}s</span>
                  </div>

                  <div className="fieldAction">
                    <button disabled={!token || loading || !field.isOpen} onClick={() => openTeamModal(field.locationId)}>
                      Team Dispatch
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "RECRUIT" && (
        <section className="grid4">
          {offers.map((o) => {
            const canAfford = (profile?.user.credits ?? 0) >= o.recruitCostCredits;
            return (
            <article key={o.slotIndex} className="panel cardReveal">
              <img className="offerPortrait" src={mercIllust(o.imageUrl)} alt={o.name} />
              <div className="badge">SLOT {o.slotIndex + 1}</div>
              <h3>{o.name}</h3>
              <p className="small">
                G{o.grade} | {o.roleTag}
              </p>
              {o.talentName && (
                <div className="offerTalentRow">
                  <span className="offerTalentTag" style={talentBadgeStyle(o.talentTag)}>
                    {o.talentName}
                  </span>
                </div>
              )}
              <p className="offerTrait">{o.traitLine}</p>
              <button
                className={`recruitCta ${canAfford ? "" : "danger"}`}
                disabled={!token || loading || !canAfford}
                onClick={() =>
                  guarded(async () => {
                    await api.recruit(token!, o.slotIndex);
                    await syncAll(token!);
                    showToast("Recruited");
                  })
                }
              >
                <span className="recruitCtaSingle">{canAfford ? `Recruit · C ${fmtNum(o.recruitCostCredits)}` : `Not enough credits · C ${fmtNum(o.recruitCostCredits)}`}</span>
              </button>
            </article>
            );
          })}
          <article className="panel full panelAction">
            <p>Refresh all offer slots immediately.</p>
            <button
              disabled={!token || loading}
              onClick={() =>
                guarded(async () => {
                  await api.rerollOffers(token!);
                  await syncAll(token!);
                  showToast("Rerolled");
                })
              }
            >
              Reroll
            </button>
          </article>
        </section>
      )}

      {tab === "OFFICE" && (
        <section className="grid2">
          <article className="panel">
            <h2>Mercenary Roster</h2>
            <ul className="list">
              {mercs.map((m) => (
                <li key={m.id}>
                  <div className="mercRowMain">
                    <img className="mercPortrait" src={mercIllust(m.imageUrl)} alt={m.name} />
                    <div>
                    <div className="mercNameLine">
                      <strong>{m.name}</strong> Lv.{m.level} G{m.grade} ({m.roleTag})
                    </div>
                    {m.talentName && m.talentDescription && (
                      <button className="talentTagBtn" onClick={() => openTalentPopup(m)}>
                        {m.talentName}
                      </button>
                    )}
                    <div className="small">Power {m.power} | EXP {m.exp} | Bonus {Math.round(m.promotionBonus * 100)}%</div>
                    </div>
                  </div>
                  <div className="rowBtn">
                    <button
                      disabled={!token || loading}
                      onClick={() =>
                        guarded(async () => {
                          await api.startPromotion(token!, m.id, "A");
                          await syncAll(token!);
                          showToast("Promotion A started");
                        })
                      }
                    >
                      Promote A
                    </button>
                    <button
                      disabled={!token || loading}
                      onClick={() =>
                        guarded(async () => {
                          await api.startPromotion(token!, m.id, "B");
                          await syncAll(token!);
                          showToast("Promotion B started");
                        })
                      }
                    >
                      Promote B
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Promotion Jobs</h2>
            <ul className="list">
              {promotions.map((p) => (
                <li key={p.id}>
                  <div>
                    #{p.mercenaryId.slice(0, 6)} | {p.route} | G{p.gradeFrom}{"->"}G{p.gradeTo} | {p.status}
                  </div>
                  <button
                    disabled={!token || loading || p.status !== "IN_PROGRESS"}
                    onClick={() =>
                      guarded(async () => {
                        await api.claimPromotion(token!, p.id);
                        await syncAll(token!);
                        showToast("Promotion claimed");
                      })
                    }
                  >
                    Claim
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}

      {tab === "CRAFT" && (
        <section className="grid2">
          <article className="panel">
            <h2>Recipes</h2>
            <ul className="list">
              {recipes.map((r) => (
                <li key={r.recipeId}>
                  <div>
                    <strong>{r.recipeId}</strong> | {r.resultEquipType} G{r.resultGrade} +{r.statValue}
                    <div className="small">
                      Cost C{r.costCredits} / A{r.costMaterialA} / B{r.costMaterialB} | {r.craftSeconds}s
                    </div>
                  </div>
                  <button
                    disabled={!token || loading}
                    onClick={() =>
                      guarded(async () => {
                        await api.startCraft(token!, r.recipeId);
                        await syncAll(token!);
                        showToast("Craft started");
                      })
                    }
                  >
                    Craft
                  </button>
                </li>
              ))}
            </ul>
            <h3>Craft Jobs</h3>
            <ul className="list">
              {craftJobs.map((j) => (
                <li key={j.id}>
                  <div>
                    {j.recipeId} | {j.status}
                  </div>
                  <button
                    disabled={!token || loading || j.status !== "IN_PROGRESS"}
                    onClick={() =>
                      guarded(async () => {
                        await api.claimCraft(token!, j.id);
                        await syncAll(token!);
                        showToast("Craft claimed");
                      })
                    }
                  >
                    Claim
                  </button>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Equipment</h2>
            <select className="input" value={selectedMercForEquip} onChange={(e) => setSelectedMercForEquip(e.target.value)}>
              <option value="">Select mercenary</option>
              {mercs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <ul className="list">
              {equips.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{e.type}</strong> G{e.grade} +{e.statValue}
                    <div className="small">{e.equippedMercId ? `Equipped (slot ${e.slotIndex})` : "Unequipped"}</div>
                  </div>
                  <div className="rowBtn">
                    <button
                      disabled={!token || loading || !selectedMercForEquip}
                      onClick={() =>
                        guarded(async () => {
                          await api.equip(token!, selectedMercForEquip, e.id, 0);
                          await syncAll(token!);
                          showToast("Equipped");
                        })
                      }
                    >
                      Equip
                    </button>
                    <button
                      disabled={!token || loading || !e.equippedMercId}
                      onClick={() =>
                        guarded(async () => {
                          await api.unequip(token!, e.id);
                          await syncAll(token!);
                          showToast("Unequipped");
                        })
                      }
                    >
                      Unequip
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}

      {teamModalOpen && (
        <div className="modalBackdrop">
          <div className="modalPanel teamModal">
            <h3>Team Setup</h3>
            <p className="small">Deploy up to {battleConfig.teamSlotCount} units</p>
            <div className="teamSlots">
              {teamSlots.map((slot, idx) => {
                const merc = slot ? mercMap.get(slot) : null;
                return (
                  <button
                    key={idx}
                    className="teamSlot"
                    onClick={() => {
                      setPickerSlot(idx);
                      setPickerOpen(true);
                    }}
                  >
                    {merc ? (
                      <span className="teamSlotInner">
                        <img className="teamSlotImg" src={mercIllust(merc.imageUrl)} alt={merc.name} />
                        <span>{`${merc.name} (Lv.${merc.level})`}</span>
                      </span>
                    ) : (
                      "+"
                    )}
                  </button>
                );
              })}
            </div>

            <div className="teamModalBottom">
              <button type="button" onClick={() => setTeamModalOpen(false)}>Close</button>
              <button type="button" onClick={clearTeamSlots}>Clear</button>
              <button type="button" disabled={!token || loading} onClick={() => guarded(sendTeam)}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="modalBackdrop">
          <div className="modalPanel pickerModal">
            <h3>Select Mercenary</h3>
            <div className="mercPickList">
              {pickerMercs.map((m) => (
                <div
                  key={m.id}
                  className="mercPickRow"
                  role="button"
                  tabIndex={0}
                  onClick={() => assignMercToSlot(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      assignMercToSlot(m.id);
                    }
                  }}
                >
                  <img className="mercPickImg" src={mercIllust(m.imageUrl)} alt={m.name} />
                  <span className="mercPickNameWrap">
                    <span className="mercPickName">{m.name}</span>
                    {m.talentName && m.talentDescription && (
                      <span className="mercPickTalentWrap">
                        <button
                          className="talentTagBtn small"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTalentPopup(m);
                          }}
                        >
                          {m.talentName}
                        </button>
                      </span>
                    )}
                  </span>
                  <span className="mercPickMeta">
                    Lv.{m.level} | G{m.grade}
                  </span>
                  <span className="mercEquipStrip">
                    {(equipByMerc.get(m.id) ?? []).map((e) => (
                      <i key={e.id}>{equipIcon(e.type)}</i>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="teamModalBottom">
              <button onClick={() => setPickerOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {talentPopup && (
        <div className="modalBackdrop">
          <div className="modalPanel talentModal">
            <h3>{talentPopup.name}</h3>
            <p>{talentPopup.description}</p>
            <div className="teamModalBottom">
              <button onClick={() => setTalentPopup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {battleReportOpen && battleReportTarget && (
        <div className="modalBackdrop">
          <div className="modalPanel battleReportModal">
            <h3>보고서 - {battleReportTarget.locationName}</h3>
            <p className="small reportSub">마지막 정리 이후 누적 탐험 기록입니다.</p>
            <div className="reportGrid">
              <p>탐험 시간: <strong>{fmtDuration(battleReportTarget.report?.elapsedSeconds ?? 0)}</strong></p>
              <p>클리어한 지역 수: <strong>{fmtNum(battleReportTarget.report?.clearCount ?? battleReportTarget.clearCount)}</strong></p>
              <p>팀이 패배한 횟수: <strong>{fmtNum(battleReportTarget.report?.retryCount ?? battleReportTarget.retryCount)}</strong></p>
              <p>획득한 경험치: <strong>{fmtNum(battleReportTarget.report?.gainedExp ?? battleReportTarget.reward.exp)}</strong></p>
              <p>획득한 크레딧: <strong>{fmtNum(battleReportTarget.report?.gainedCredits ?? battleReportTarget.reward.credits)}</strong></p>
              <p>획득한 재화: <strong>A {fmtNum(battleReportTarget.report?.materialA ?? battleReportTarget.reward.materialA)} / B {fmtNum(battleReportTarget.report?.materialB ?? battleReportTarget.reward.materialB)}</strong></p>
              <p>처치한 적 수: <strong>{fmtNum(battleReportTarget.report?.totalKills ?? 0)}</strong></p>
              <p>시간 당 경험치: <strong>{fmtNum(Math.round((battleReportTarget.report?.expPerSecond ?? 0) * 3600))}</strong></p>
            </div>
            <div>
              <p className="reportLabel">획득 아이템</p>
              {battleReportTarget.droppedItems.length < 1 ? (
                <p className="small">없음</p>
              ) : (
                <div className="dropStackRow">
                  {stackDrops(battleReportTarget.droppedItems).map((d) => (
                    <span key={`report-${d.key}`} className="dropIconChip" title={d.name}>
                      <i>{dropIcon(d.type)}</i>
                      <em>x{d.count}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="reportLabel">처치한 적</p>
              {(battleReportTarget.report?.killsByEnemy?.length ?? 0) < 1 ? (
                <p className="small">없음</p>
              ) : (
                <div className="dropStackRow">
                  {battleReportTarget.report!.killsByEnemy.map((k) => (
                    <span key={`kill-${k.enemyId}`} className="dropIconChip" title={k.enemyName}>
                      <img className="miniEnemyIcon" src={battleUnitIllust(k.spriteUrl)} alt={k.enemyName} />
                      <em>x{k.count}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="teamModalBottom">
              <button onClick={() => setBattleReportOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

