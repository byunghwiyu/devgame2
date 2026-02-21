import { useEffect, useMemo, useState } from "react";
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

const defaultBattleConfig: BattleConfig = { maxPartySize: 3, teamSlotCount: 4 };

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
  const [battlePageOpen, setBattlePageOpen] = useState(false);
  const [talentPopup, setTalentPopup] = useState<{ name: string; description: string } | null>(null);

  const [toast, setToast] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
    const [cfg, p, os, ms, ls, ds, ps, rs, cs, es, currentBattle] = await Promise.all([
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
      api.battleCurrent(t),
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
    setBattle(currentBattle);
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
    if (!token || !battle || battle.status !== "IN_PROGRESS") return;
    const timer = setInterval(async () => {
      try {
        const next = await api.battleState(token, battle.id);
        setBattle(next);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 700);
    return () => clearInterval(timer);
  }, [battle, token]);

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
  const pickerMercs = useMemo(() => mercs.filter((m) => !pickerSelectedSet.has(m.id)), [mercs, pickerSelectedSet]);

  const openTeamModal = (locationId: string) => {
    setTeamLocationId(locationId);
    ensureTeamSlotSize(battleConfig.teamSlotCount);
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

  const clearTeamSlots = () => ensureTeamSlotSize(battleConfig.teamSlotCount);

  const sendTeam = async () => {
    if (!token) return;
    const partyIds = teamSlots.filter((id): id is string => Boolean(id)).slice(0, battleConfig.maxPartySize);
    if (partyIds.length < 1) {
      showToast("Pick at least 1 merc");
      return;
    }
    const started = await api.battleStart(token, teamLocationId, partyIds);
    setBattle(started);
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
                  Wave {battle.waveIndex} | {phaseLabel(battle.phase)} | Retry {battle.retryCount} | Clear {battle.clearCount}
                </p>
              </div>
              <button onClick={() => setBattlePageOpen(false)}>Back</button>
            </div>

            <div className="battleArena" style={{ backgroundImage: `url(${battle.locationImageUrl})` }}>
              <div className="enemyRow">
                {battle.enemies.map((u) => (
                  <div key={u.id} className={`sprite enemy ${u.alive ? "" : "dead"}`}>
                    <img className="spriteImg" src={u.spriteUrl} alt={u.name} />
                    <div className="hpBar">
                      <span style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="allyRow">
                {battle.allies.map((u) => (
                  <div key={u.id} className={`sprite ally ${u.alive ? "" : "dead"}`}>
                    <img className="spriteImg" src={u.spriteUrl} alt={u.name} />
                    <div className="hpBar">
                      <span style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
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
                <p key={`${idx}-${line}`}>{line}</p>
              ))}
            </div>

            <div className="dropLine">
              {battle.droppedItems.length < 1 ? (
                <span>No drops yet</span>
              ) : (
                <span>Drops: {battle.droppedItems.map((d) => d.itemName).join(", ")}</span>
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
          {battle && (
            <article className="panel fieldCurrentBattle">
              <div className="fieldCurrentMain" style={{ backgroundImage: `url(${battle.locationImageUrl})` }}>
                <h2>{battle.locationName}</h2>
                <div className="fieldCurrentParty">
                  {battle.allies.map((u) => (
                    <div key={u.id} className="fieldCurrentUnit">
                      <img className="fieldCurrentImg" src={u.spriteUrl} alt={u.name} />
                      <em style={{ width: `${hpPct(u.hp, u.maxHp)}%` }} />
                    </div>
                  ))}
                </div>
                <p className="small">{phaseLabel(battle.phase)}</p>
                <div className="turnGauge mini">
                  <span style={{ width: `${battle.gaugePercent}%` }} />
                </div>
              </div>
              <button onClick={() => setBattlePageOpen(true)}>Open Battle</button>
            </article>
          )}

          <div className="fieldStack">
            {locations.map((field) => (
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
          {offers.map((o) => (
            <article key={o.slotIndex} className="panel cardReveal">
              <div className="badge">SLOT {o.slotIndex + 1}</div>
              <h3>{o.name}</h3>
              <p className="small">
                G{o.grade} | {o.roleTag}
              </p>
              <div className="offerTalentRow">
                <span className="offerTalentLabel">Talent</span>
                {o.talentName ? (
                  <span className="offerTalentTag" style={talentBadgeStyle(o.talentTag)}>
                    {o.talentName}
                  </span>
                ) : (
                  <span className="offerTalentNone">None</span>
                )}
              </div>
              <p>{o.traitLine}</p>
              <p className="small">Cost C{o.recruitCostCredits}</p>
              <button
                disabled={!token || loading}
                onClick={() =>
                  guarded(async () => {
                    await api.recruit(token!, o.slotIndex);
                    await syncAll(token!);
                    showToast("Recruited");
                  })
                }
              >
                Recruit
              </button>
            </article>
          ))}
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
            <p className="small">Deploy up to {battleConfig.maxPartySize} units</p>
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
                    {merc ? `${merc.name} (Lv.${merc.level})` : "+"}
                  </button>
                );
              })}
            </div>

            <div className="teamModalButtons">
              <button onClick={() => showToast("Load preset: pending")}>Load Team</button>
              <button onClick={() => showToast("Save preset: pending")}>Save Team</button>
            </div>

            <div className="teamModalBottom">
              <button onClick={() => setTeamModalOpen(false)}>Close</button>
              <button onClick={clearTeamSlots}>Clear</button>
              <button disabled={!token || loading} onClick={() => guarded(sendTeam)}>
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
    </main>
  );
}

