import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuthStore } from "./store";
import type { CraftJob, DispatchStatus, Equipment, LocationRow, MercenaryView, OfferCard, ProfileData, PromotionJob, Recipe } from "./types";
import "./styles.css";

type Tab = "RECRUIT" | "OFFICE" | "FIELD" | "CRAFT";

const tabs: Array<{ key: Tab; label: string; sub: string }> = [
  { key: "RECRUIT", label: "모집", sub: "오퍼와 채용" },
  { key: "OFFICE", label: "사무실", sub: "용병과 승급" },
  { key: "FIELD", label: "현장", sub: "파티 파견" },
  { key: "CRAFT", label: "제작", sub: "장비 운용" },
];

export default function App() {
  const { token, setToken } = useAuthStore();
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
  const [party, setParty] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedMercForEquip, setSelectedMercForEquip] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const syncAll = async (t: string) => {
    const [p, os, ms, ls, ds, ps, rs, cs, es] = await Promise.all([
      api.profile(t),
      api.offers(t),
      api.mercenaries(t),
      api.locations(t),
      api.dispatchStatus(t),
      api.promotionStatus(t),
      api.recipes(t),
      api.craftStatus(t),
      api.equipments(t),
    ]);
    setProfile(p);
    setOffers(os);
    setMercs(ms);
    setLocations(ls);
    setDispatch(ds);
    setPromotions(ps);
    setRecipes(rs);
    setCraftJobs(cs);
    setEquips(es);
    if (!selectedLocation && ls[0]) setSelectedLocation(ls[0].locationId);
  };

  const guarded = async (fn: () => Promise<void>) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      showToast(`실패: ${(e as Error).message}`);
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

  const nextReset = useMemo(() => {
    if (offers.length < 1) return "-";
    const remain = Math.max(0, Math.ceil((new Date(offers[0].expiresAt).getTime() - Date.now()) / 1000));
    return `${Math.floor(remain / 60)}m ${remain % 60}s`;
  }, [offers]);

  const inProgressDispatch = dispatch?.status === "IN_PROGRESS" ? 1 : 0;
  const inProgressCraft = craftJobs.filter((j) => j.status === "IN_PROGRESS").length;
  const inProgressPromotion = promotions.filter((p) => p.status === "IN_PROGRESS").length;
  const avgPower = mercs.length > 0 ? Math.round(mercs.reduce((sum, m) => sum + m.power, 0) / mercs.length) : 0;

  return (
    <main className="page">
      <div className="bgMesh" />

      <header className="hero">
        <div className="heroHead">
          <div>
            <p className="eyebrow">Vertical Slice Console</p>
            <h1>인력 사무소 작전실</h1>
          </div>
          <div className="actions">
            <button
              onClick={() =>
                guarded(async () => {
                  const g = await api.guestAuth();
                  setToken(g.token);
                  showToast("게스트 생성 완료");
                })
              }
            >
              Guest 시작
            </button>
            <button
              disabled={!token || loading}
              onClick={() =>
                guarded(async () => {
                  await syncAll(token!);
                  showToast("동기화 완료");
                })
              }
            >
              동기화
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
            <span>오퍼 리셋</span>
            <strong>{nextReset}</strong>
          </article>
        </section>

        <section className="metaRow">
          <p>용병 {mercs.length}명</p>
          <p>평균 전투력 {avgPower}</p>
          <p>파견중 {inProgressDispatch}</p>
          <p>제작중 {inProgressCraft}</p>
          <p>승급중 {inProgressPromotion}</p>
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

      {tab === "RECRUIT" && (
        <section className="grid4">
          {offers.map((o) => (
            <article key={o.slotIndex} className="panel cardReveal">
              <div className="badge">SLOT {o.slotIndex + 1}</div>
              <h3>{o.name}</h3>
              <p className="small">
                G{o.grade} · {o.roleTag}
              </p>
              <p>{o.traitLine}</p>
              <p className="small">비용 C{ o.recruitCostCredits }</p>
              <button
                disabled={!token || loading}
                onClick={() =>
                  guarded(async () => {
                    await api.recruit(token!, o.slotIndex);
                    await syncAll(token!);
                    showToast("모집 완료");
                  })
                }
              >
                모집
              </button>
            </article>
          ))}
          <article className="panel full panelAction">
            <p>오퍼 풀을 즉시 갱신합니다.</p>
            <button
              disabled={!token || loading}
              onClick={() =>
                guarded(async () => {
                  await api.rerollOffers(token!);
                  await syncAll(token!);
                  showToast("오퍼 리롤 완료");
                })
              }
            >
              오퍼 리롤
            </button>
          </article>
        </section>
      )}

      {tab === "OFFICE" && (
        <section className="grid2">
          <article className="panel">
            <h2>보유 용병</h2>
            <ul className="list">
              {mercs.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.name}</strong> Lv.{m.level} G{m.grade} ({m.roleTag})
                    <div className="small">Power {m.power} · EXP {m.exp} · 보너스 {Math.round(m.promotionBonus * 100)}%</div>
                  </div>
                  <div className="rowBtn">
                    <button
                      disabled={!token || loading}
                      onClick={() =>
                        guarded(async () => {
                          await api.startPromotion(token!, m.id, "A");
                          await syncAll(token!);
                          showToast("승급 A 시작");
                        })
                      }
                    >
                      승급A
                    </button>
                    <button
                      disabled={!token || loading}
                      onClick={() =>
                        guarded(async () => {
                          await api.startPromotion(token!, m.id, "B");
                          await syncAll(token!);
                          showToast("승급 B 시작");
                        })
                      }
                    >
                      승급B
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>승급 진행</h2>
            <ul className="list">
              {promotions.map((p) => (
                <li key={p.id}>
                  <div>
                    #{p.mercenaryId.slice(0, 6)} · {p.route} · G{p.gradeFrom}→G{p.gradeTo} · {p.status}
                  </div>
                  <button
                    disabled={!token || loading || p.status !== "IN_PROGRESS"}
                    onClick={() =>
                      guarded(async () => {
                        await api.claimPromotion(token!, p.id);
                        await syncAll(token!);
                        showToast("승급 완료");
                      })
                    }
                  >
                    수령
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}

      {tab === "FIELD" && (
        <section className="grid2">
          <article className="panel">
            <h2>현장 선택</h2>
            <select className="input" value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}>
              {locations.map((l) => (
                <option key={l.locationId} value={l.locationId}>
                  {l.name} (난이도 {l.difficulty})
                </option>
              ))}
            </select>
            <h3>파티 (최대 3)</h3>
            <ul className="list">
              {mercs.map((m) => (
                <li key={m.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={party.includes(m.id)}
                      disabled={m.isDispatched}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (party.length >= 3) return;
                          setParty([...party, m.id]);
                        } else {
                          setParty(party.filter((id) => id !== m.id));
                        }
                      }}
                    />{" "}
                    {m.name} (P{m.power}) {m.isDispatched ? "[파견중]" : ""}
                  </label>
                </li>
              ))}
            </ul>
            <button
              disabled={!token || loading || party.length < 1 || !selectedLocation}
              onClick={() =>
                guarded(async () => {
                  await api.startDispatch(token!, selectedLocation, party);
                  await syncAll(token!);
                  showToast("파견 시작");
                })
              }
            >
              파견 시작
            </button>
          </article>
          <article className="panel">
            <h2>파견 상태</h2>
            {!dispatch ? (
              <p>진행 중인 파견 없음</p>
            ) : (
              <>
                <p>상태: {dispatch.status}</p>
                <p>남은 시간: {dispatch.remainsSeconds}s</p>
                <p>성공 확률: {(dispatch.successChance * 100).toFixed(1)}%</p>
                <button
                  disabled={!token || loading || !dispatch.claimable}
                  onClick={() =>
                    guarded(async () => {
                      await api.claimDispatch(token!);
                      await syncAll(token!);
                      showToast("파견 보상 수령");
                    })
                  }
                >
                  보상 수령
                </button>
              </>
            )}
          </article>
        </section>
      )}

      {tab === "CRAFT" && (
        <section className="grid2">
          <article className="panel">
            <h2>레시피</h2>
            <ul className="list">
              {recipes.map((r) => (
                <li key={r.recipeId}>
                  <div>
                    <strong>{r.recipeId}</strong> · {r.resultEquipType} G{r.resultGrade} +{r.statValue}
                    <div className="small">
                      비용 C{r.costCredits} / A{r.costMaterialA} / B{r.costMaterialB} · {r.craftSeconds}s
                    </div>
                  </div>
                  <button
                    disabled={!token || loading}
                    onClick={() =>
                      guarded(async () => {
                        await api.startCraft(token!, r.recipeId);
                        await syncAll(token!);
                        showToast("제작 시작");
                      })
                    }
                  >
                    제작
                  </button>
                </li>
              ))}
            </ul>
            <h3>제작 진행</h3>
            <ul className="list">
              {craftJobs.map((j) => (
                <li key={j.id}>
                  <div>
                    {j.recipeId} · {j.status}
                  </div>
                  <button
                    disabled={!token || loading || j.status !== "IN_PROGRESS"}
                    onClick={() =>
                      guarded(async () => {
                        await api.claimCraft(token!, j.id);
                        await syncAll(token!);
                        showToast("제작 완료 수령");
                      })
                    }
                  >
                    수령
                  </button>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>장비</h2>
            <select className="input" value={selectedMercForEquip} onChange={(e) => setSelectedMercForEquip(e.target.value)}>
              <option value="">장착 대상 선택</option>
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
                    <div className="small">{e.equippedMercId ? `장착중(slot ${e.slotIndex})` : "미장착"}</div>
                  </div>
                  <div className="rowBtn">
                    <button
                      disabled={!token || loading || !selectedMercForEquip}
                      onClick={() =>
                        guarded(async () => {
                          await api.equip(token!, selectedMercForEquip, e.id, 0);
                          await syncAll(token!);
                          showToast("장착 완료");
                        })
                      }
                    >
                      장착
                    </button>
                    <button
                      disabled={!token || loading || !e.equippedMercId}
                      onClick={() =>
                        guarded(async () => {
                          await api.unequip(token!, e.id);
                          await syncAll(token!);
                          showToast("해제 완료");
                        })
                      }
                    >
                      해제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </main>
  );
}
