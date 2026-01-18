import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Employee = { name: string };

type TimeEvent = {
  id: string;
  employeeName: string;
  day: string; // YYYY-MM-DD
  kind: "vacation" | "short";
  hoursOff: number | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};

type SummaryRow = { employeeName: string; vacationDays: number; shortDays: number };

function normBase(s: string) {
  return s.replace(/\/+$/, "");
}

function yyyymmNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtKind(k: TimeEvent["kind"]) {
  return k === "vacation" ? "Szabadság" : "Elkérezés";
}

export default function AllInVacations({ api }: { api?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  const card = "rounded-lg border border-white/30 bg-white/5 shadow-sm px-4 sm:px-6 py-6 sm:py-8";
  const label = "text-white/80 text-sm";
  const input =
    "w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20";
  const btn =
    "h-9 sm:h-10 px-3 sm:px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/30 text-xs sm:text-sm whitespace-nowrap";
  const btnPrimary = btn + " !bg-[#208d8b] hover:!bg-[#1b7a78] border-transparent";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empErr, setEmpErr] = useState("");
  const [empBusy, setEmpBusy] = useState(false);

  const [q, setQ] = useState("");
  const filteredEmployees = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(s));
  }, [employees, q]);

  const [selected, setSelected] = useState<string>("");

  const [month, setMonth] = useState<string>(yyyymmNow());
  const [items, setItems] = useState<TimeEvent[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [listErr, setListErr] = useState("");
  const [listBusy, setListBusy] = useState(false);

  // Create
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dayTo, setDayTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<TimeEvent["kind"]>("vacation");
  const [shortHours, setShortHours] = useState<number>(4);
  const [note, setNote] = useState<string>("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  // Keep period end sane when switching types / changing start day.
  useEffect(() => {
    if (kind !== "vacation") return;
    if (!dayTo) setDayTo(day);
    // If start > end, align end to start.
    if (day && dayTo && day > dayTo) setDayTo(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, day]);

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const fetchEmployees = async () => {
    setEmpErr("");
    setEmpBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/vacations/employees`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      const list: Employee[] = Array.isArray(j?.items) ? j.items : [];
      setEmployees(list);
      if (!selected && list.length) setSelected(list[0].name);
    } catch (e: any) {
      setEmpErr(String(e?.message || e || "Hiba"));
      setEmployees([]);
    } finally {
      setEmpBusy(false);
    }
  };

  const fetchList = async (employeeName?: string) => {
    const emp = (employeeName ?? selected).trim();
    setListErr("");
    setListBusy(true);
    try {
      const url = `${apiBase}/admin/vacations?month=${encodeURIComponent(month)}${emp ? `&employee=${encodeURIComponent(emp)}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      setItems(Array.isArray(j?.items) ? j.items : []);
      setSummary(Array.isArray(j?.summary) ? j.summary : []);
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba"));
      setItems([]);
      setSummary([]);
    } finally {
      setListBusy(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!month) return;
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, selected, apiBase]);

  const selectedSummary = useMemo(() => {
    const s = summary.find((x) => x.employeeName === selected);
    return s || { employeeName: selected, vacationDays: 0, shortDays: 0 };
  }, [summary, selected]);

  const selectedShortHours = useMemo(() => {
    const emp = selected.trim();
    if (!emp) return 0;
    let sum = 0;
    for (const it of items) {
      if (it.employeeName !== emp) continue;
      if (it.kind !== "short") continue;
      const h = Number(it.hoursOff ?? 0);
      if (Number.isFinite(h) && h > 0) sum += h;
    }
    return sum;
  }, [items, selected]);

  const save = async () => {
    setSaveErr("");
    const emp = selected.trim();
    if (!emp) {
      setSaveErr("Válassz alkalmazottat.");
      return;
    }
    if (!/\d{4}-\d{2}-\d{2}/.test(day)) {
      setSaveErr("A dátum formátuma hibás.");
      return;
    }

    if (kind === "vacation") {
      const end = (dayTo || day).trim();
      if (!/\d{4}-\d{2}-\d{2}/.test(end)) {
        setSaveErr("A periódus vége dátum formátuma hibás.");
        return;
      }
      if (end < day) {
        setSaveErr("A periódus vége nem lehet a kezdő dátum előtt.");
        return;
      }
    }

    if (kind === "short") {
      const h = Number(shortHours);
      if (!Number.isFinite(h) || h < 1 || h > 12) {
        setSaveErr("Az elkérezés óraszáma 1 és 12 között kell legyen.");
        return;
      }
    }

    setSaveBusy(true);
    try {
      const payload: any = {
        employeeName: emp,
        kind,
        note: note.trim() ? note.trim() : null,
      };
      if (kind === "short") {
        payload.day = day;
        payload.hoursOff = Math.trunc(Number(shortHours) || 4);
      } else {
        payload.dayFrom = day;
        payload.dayTo = (dayTo || day).trim();
      }

      const r = await fetch(`${apiBase}/admin/vacations`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      setNote("");
      await fetchList(emp);
    } catch (e: any) {
      setSaveErr(String(e?.message || e || "Hiba"));
    } finally {
      setSaveBusy(false);
    }
  };

  const openDelete = (id: string) => {
    setConfirmTitle("Törlés");
    setConfirmMsg("Biztos törlöd? Ez csak a bejegyzést törli, nem a dolgozót.");
    setConfirmId(id);
    setConfirmOpen(true);
  };

  const runDelete = async () => {
    const id = confirmId;
    setConfirmOpen(false);
    setConfirmId(null);
    if (!id) return;

    setListErr("");
    try {
      const r = await fetch(`${apiBase}/admin/vacations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      await fetchList();
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba törlésnél"));
    }
  };

  const grouped = useMemo(() => {
    const byDay = new Map<string, TimeEvent[]>();
    for (const it of items) {
      const k = it.day;
      const arr = byDay.get(k) || [];
      arr.push(it);
      byDay.set(k, arr);
    }
    const keys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ day: k, items: byDay.get(k) || [] }));
  }, [items]);

  const scrollToSelected = () => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`button[data-emp="${CSS.escape(selected)}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    scrollToSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="min-h-screen w-screen" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-6xl mx-auto px-4 py-6">
        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-white text-xl font-medium">SZABADSÁGOK</div>
              <div className="text-white/60 text-xs mt-1">Szabadság napok és Elkérezés órák külön kezelve.</div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button className={btn} type="button" onClick={fetchEmployees} disabled={empBusy}>
                {empBusy ? "Frissítés…" : "Dolgozók frissítése"}
              </Button>
              <Button className={btn} onClick={() => (window.location.hash = "#allinadmin")} type="button">
                Vissza
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 grid-cols-1 lg:grid-cols-12">
            {/* Left: employees */}
            <div className="lg:col-span-4">
              <div className="text-white/80 text-sm">Alkalmazottak</div>
              <div className="mt-2">
                <input
                  className={input}
                  placeholder="Keresés név szerint…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              {empErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{empErr}</div> : null}

              <div ref={listRef} className="mt-3 rounded-xl border border-white/30 bg-white/5 max-h-[60vh] overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <div className="px-4 py-4 text-white/60 text-sm">Nincs dolgozó a listában.</div>
                ) : (
                  filteredEmployees.map((e) => {
                    const active = e.name === selected;
                    const s = summary.find((x) => x.employeeName === e.name);
                    const v = s?.vacationDays ?? 0;
                    const sh = s?.shortDays ?? 0;
                    return (
                      <button
                        key={e.name}
                        data-emp={e.name}
                        type="button"
                        className={
                          "w-full px-4 py-3 text-left flex items-center justify-between gap-3 border-t border-white/10 first:border-t-0 " +
                          (active ? "bg-white/10" : "hover:bg-white/5")
                        }
                        onClick={() => setSelected(e.name)}
                      >
                        <div>
                          <div className="text-white text-sm">{e.name}</div>
                          <div className="text-white/60 text-xs mt-1">
                            {month} · Szabadság: {v} · Elkérezés: {sh}
                          </div>
                        </div>
                        <div className="text-white/40 text-xs">▸</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: editor */}
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-white/80 text-sm">Kiválasztva</div>
                  <div className="text-white text-lg font-medium mt-1">{selected || "-"}</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={label}>Hónap</div>
                  <input
                    type="month"
                    className={
                      "h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20"
                    }
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                  <Button type="button" className={btn} onClick={() => fetchList()} disabled={listBusy}>
                    {listBusy ? "Frissítés…" : "Frissítés"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/30 bg-white/5 p-4">
                <div className="text-white/80 text-sm">Gyors összegzés ({month})</div>
                <div className="mt-2 text-white/70 text-sm">
                  Szabadság napok: <span className="text-white">{selectedSummary.vacationDays}</span> · Elkérezés órák: {" "}
                  <span className="text-white">{selectedShortHours}</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/30 bg-white/5 p-4">
                <div className="text-white/80 text-sm">Új bejegyzés</div>

                <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-3">
                  {kind === "vacation" ? (
                    <>
                      <div className="grid gap-2">
                        <div className={label}>Kezdő nap</div>
                        <input
                          type="date"
                          className={input}
                          value={day}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDay(v);
                            if (!dayTo || dayTo.trim() === "" || (dayTo.trim() && dayTo.trim() < v)) setDayTo(v);
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <div className={label}>Vége</div>
                        <input type="date" className={input} value={dayTo} onChange={(e) => setDayTo(e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-2">
                      <div className={label}>Dátum</div>
                      <input type="date" className={input} value={day} onChange={(e) => setDay(e.target.value)} />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <div className={label}>Típus</div>
                    <select
                      className={
                        "w-full h-11 rounded-xl px-4 border border-white/30 bg-[#354153] text-white outline-none focus:ring-2 focus:ring-white/20"
                      }
                      value={kind}
                      onChange={(e) => setKind(e.target.value as any)}
                    >
                      <option value="vacation">Szabadság nap</option>
                      <option value="short">Elkérezés (óra megadható)</option>
                    </select>
                  </div>

                  {kind === "vacation" ? (
                    <div className="sm:col-span-3 text-white/50 text-xs">Kezdő nap · Vége. Ha ugyanaz, egy napot jelent.</div>
                  ) : null}

                  {kind === "short" ? (
                    <div className="grid gap-2">
                      <div className={label}>Óra</div>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        className={input}
                        value={shortHours}
                        onChange={(e) => setShortHours(Number(e.target.value))}
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:col-span-3">
                    <div className={label}>Megjegyzés (opcionális)</div>
                    <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pl. orvos" />
                  </div>
                </div>

                {saveErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{saveErr}</div> : null}

                <div className="mt-4 flex items-center justify-end">
                  <Button type="button" className={btnPrimary} disabled={saveBusy || !selected} onClick={save}>
                    {saveBusy ? "Mentés…" : "Mentés"}
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white/80 text-sm">Bejegyzések ({month})</div>
                </div>
                {listErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-2">{listErr}</div> : null}

                <div className="mt-3 rounded-xl border border-white/30 overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                    <div className="col-span-3">Dátum</div>
                    <div className="col-span-3">Típus</div>
                    <div className="col-span-4">Megjegyzés</div>
                    <div className="col-span-2 text-right">Művelet</div>
                  </div>

                  {grouped.length === 0 ? (
                    <div className="px-3 py-6 text-white/60 text-sm">Nincs bejegyzés ebben a hónapban.</div>
                  ) : (
                    grouped.map((g) => (
                      <div key={g.day} className="border-t border-white/10">
                        {g.items.map((it) => (
                          <div key={it.id} className="grid grid-cols-12 gap-0 px-3 py-3 items-center">
                            <div className="col-span-3 text-white text-sm">{it.day}</div>
                            <div className="col-span-3 text-white/80 text-sm">
                              {fmtKind(it.kind)}
                              {it.kind === "short" ? (
                                <span className="text-white/50"> ({it.hoursOff ?? 4} óra)</span>
                              ) : null}
                            </div>
                            <div className="col-span-4 text-white/70 text-sm break-words">{it.note || "-"}</div>
                            <div className="col-span-2 text-right">
                              <button
                                type="button"
                                aria-label="Törlés"
                                title="Törlés"
                                className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => openDelete(it.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-4 text-xs text-white/60">
                  API base: <span className="text-white/70">{apiBase}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="text-white font-medium">{confirmTitle}</div>
            <div className="text-white/70 text-sm mt-2 whitespace-pre-wrap">{confirmMsg}</div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setConfirmOpen(false)}
              >
                Mégse
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium"
                onClick={runDelete}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
