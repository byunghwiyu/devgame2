import type {
  ApiEnvelope,
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function req<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP_${res.status}`);
  return json.data as T;
}

export const api = {
  signup: (account: string, password: string, nickname?: string) =>
    req<{ token: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ account, password, nickname }) }),
  login: (account: string, password: string) =>
    req<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ account, password }) }),
  guestAuth: () => req<{ token: string }>("/auth/guest", { method: "POST", body: "{}" }),
  profile: (token: string) => req<ProfileData>("/profile", { method: "GET" }, token),
  offers: (token: string) => req<OfferCard[]>("/offers", { method: "GET" }, token),
  rerollOffers: (token: string) => req<unknown>("/offers/reroll", { method: "POST", body: "{}" }, token),
  recruit: (token: string, slotIndex: number) =>
    req<unknown>("/recruit", { method: "POST", body: JSON.stringify({ slotIndex }) }, token),
  mercenaries: (token: string) => req<MercenaryView[]>("/mercenaries", { method: "GET" }, token),
  locations: (token: string) => req<LocationRow[]>("/locations", { method: "GET" }, token),
  startDispatch: (token: string, locationId: string, partyIds: string[]) =>
    req<unknown>("/dispatch/start", { method: "POST", body: JSON.stringify({ locationId, partyIds }) }, token),
  dispatchStatus: (token: string) => req<DispatchStatus | null>("/dispatch/status", { method: "GET" }, token),
  claimDispatch: (token: string) => req<unknown>("/dispatch/claim", { method: "POST", body: "{}" }, token),
  startPromotion: (token: string, mercId: string, route: "A" | "B") =>
    req<unknown>("/promotion/start", { method: "POST", body: JSON.stringify({ mercId, route }) }, token),
  promotionStatus: (token: string) => req<PromotionJob[]>("/promotion/status", { method: "GET" }, token),
  claimPromotion: (token: string, jobId: string) =>
    req<unknown>("/promotion/claim", { method: "POST", body: JSON.stringify({ jobId }) }, token),
  recipes: (token: string) => req<Recipe[]>("/recipes", { method: "GET" }, token),
  startCraft: (token: string, recipeId: string) =>
    req<unknown>("/craft/start", { method: "POST", body: JSON.stringify({ recipeId }) }, token),
  craftStatus: (token: string) => req<CraftJob[]>("/craft/status", { method: "GET" }, token),
  claimCraft: (token: string, jobId: string) =>
    req<unknown>("/craft/claim", { method: "POST", body: JSON.stringify({ jobId }) }, token),
  equipments: (token: string) => req<Equipment[]>("/equipments", { method: "GET" }, token),
  equip: (token: string, mercId: string, equipId: string, slotIndex: number) =>
    req<unknown>("/equip", { method: "POST", body: JSON.stringify({ mercId, equipId, slotIndex }) }, token),
  unequip: (token: string, equipId: string) =>
    req<unknown>("/unequip", { method: "POST", body: JSON.stringify({ equipId }) }, token),
  battleStart: (token: string, locationId: string, partyIds: string[]) =>
    req<BattleState>("/battle/start", { method: "POST", body: JSON.stringify({ locationId, partyIds }) }, token),
  battleConfig: () => req<BattleConfig>("/battle/config", { method: "GET" }),
  battleCurrent: (token: string) => req<BattleState | null>("/battle/current", { method: "GET" }, token),
  battleState: (token: string, sessionId: string) =>
    req<BattleState>(`/battle/state?sessionId=${encodeURIComponent(sessionId)}`, { method: "GET" }, token),
  battleRetreat: (token: string, sessionId: string) =>
    req<BattleState>("/battle/retreat", { method: "POST", body: JSON.stringify({ sessionId }) }, token),
  battleClose: (token: string, sessionId: string) =>
    req<{ closed: boolean }>("/battle/close", { method: "POST", body: JSON.stringify({ sessionId }) }, token),
};
