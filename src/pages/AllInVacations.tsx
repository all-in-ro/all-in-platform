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

type SummaryRow = { employeeName: string; vacationDays: number; shortDays: number; shortHours: number };

type YearSummaryRow = { employeeName: string; vacationDays: number; shortDays: number; shortHours: number };

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

  // Year summary + PDF
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryYear, setSummaryYear] = useState<number>(new Date().getFullYear());
  const [yearRows, setYearRows] = useState<YearSummaryRow[]>([]);
  const [yearErr, setYearErr] = useState("");
  const [yearBusy, setYearBusy] = useState(false);


  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen && !summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmOpen(false);
        setSummaryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, summaryOpen]);

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

  const fetchYearSummary = async (year?: number) => {
    const y = Number(year ?? summaryYear);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
    setYearErr("");
    setYearBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/vacations/summary?year=${encodeURIComponent(String(y))}`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      setYearRows(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      setYearErr(String(e?.message || e || "Hiba"));
      setYearRows([]);
    } finally {
      setYearBusy(false);
    }
  };

  const openYearSummary = async () => {
    setSummaryOpen(true);
    await fetchYearSummary(summaryYear);
  };

  const downloadYearPdf = async () => {
    const y = Number(summaryYear);
    if (!Number.isFinite(y)) return;

    // Open directly so the browser handles download + cookies reliably.
    // If the server returns an error page/JSON, the user will still SEE something.
    setYearErr("");
    try {
      const url = `${apiBase}/admin/vacations/summary.pdf?year=${encodeURIComponent(String(y))}`;
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) {
        setYearErr("A böngésző letiltotta az új ablakot a PDF-hez.");
      }
    } catch (e: any) {
      setYearErr(String(e?.message || e || "Hiba PDF-nél"));
    }
  };


  const fetchList = async (employeeName?: string) => {
    const emp = (employeeName ?? selected).trim();
    setListErr("");
    setListBusy(true);

    try {
      // 1) Always load the MONTHLY summary for ALL employees (left list must be correct without clicking).
      const sumUrl = `${apiBase}/admin/vacations?month=${encodeURIComponent(month)}`;
      const rSum = await fetch(sumUrl, { credentials: "include" });
      const jSum = await rSum.json().catch(() => null);
      if (!rSum.ok) throw new Error(String(jSum?.error || jSum?.message || `HTTP ${rSum.status}`));
      setSummary(Array.isArray(jSum?.summary) ? jSum.summary : []);

      // 2) Then load the events list for the SELECTED employee (right panel).
      if (emp) {
        const itemsUrl = `${apiBase}/admin/vacations?month=${encodeURIComponent(month)}&employee=${encodeURIComponent(emp)}`;
        const rItems = await fetch(itemsUrl, { credentials: "include" });
        const jItems = await rItems.json().catch(() => null);
        if (!rItems.ok) throw new Error(String(jItems?.error || jItems?.message || `HTTP ${rItems.status}`));
        setItems(Array.isArray(jItems?.items) ? jItems.items : []);
      } else {
        setItems([]);
      }
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
    return s || { employeeName: selected, vacationDays: 0, shortDays: 0, shortHours: 0 };
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
      {/* Native <select> dropdowns love forcing bright blue highlights.
          Override option backgrounds so the dropdown uses our palette. */}
      <style>{`
        select.allin-select option { background: #354153; color: #ffffff; }
        select.allin-select option:checked { background: #208d8b; color: #ffffff; }
      `}</style>
      <div className="w-full max-w-6xl mx-auto px-4 py-6">
        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-white text-xl font-medium">SZABADSÁGOK</div>
              <div className="text-white/60 text-xs mt-1">Szabadság napok és Elkérezés órák külön kezelve.</div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button className={btn} type="button" onClick={downloadYearPdf} disabled={yearBusy}>
                {yearBusy ? "PDF…" : "PDF"}
              </Button>
              <Button className={btn} type="button" onClick={openYearSummary} disabled={yearBusy}>
                {yearBusy ? "Frissítés…" : "Összesítés"}
              </Button>
              <Button className={btn} onClick={() => (window.location.hash = "#allinadmin")} type="button">
                Vissza
              </Button>
            </div>
          </div>

          {yearErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{yearErr}</div> : null}

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
                    const shh = s?.shortHours ?? 0;
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
                            {month} · Szabadság: {v} · Elkérezés: {sh} ({shh} óra)
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
                        "allin-select w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20"
                      }
                      value={kind}
                      onChange={(e) => setKind(e.target.value as any)}
                    >
                      <option value="vacation">Szabadság nap</option>
                      <option value="short">Elkérezés (óra)</option>
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

      

      {summaryOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-white font-medium">Összesítés ({summaryYear})</div>
                <div className="text-white/70 text-sm mt-1">Alkalmazottak éves szabadság napok + elkérezés órák.</div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-10 w-28 rounded-xl px-3 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20"
                  value={summaryYear}
                  onChange={(e) => setSummaryYear(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => fetchYearSummary(summaryYear)}
                  disabled={yearBusy}
                >
                  {yearBusy ? "Frissítés…" : "Frissítés"}
                </button>
                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setSummaryOpen(false)}
                >
                  Mégse
                </button>
              </div>
            </div>

            {yearErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{yearErr}</div> : null}

            <div className="mt-4 rounded-xl border border-white/30 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                <div className="col-span-6">Név</div>
                <div className="col-span-2 text-right">Szabadság (nap)</div>
                <div className="col-span-2 text-right">Elkérezés (nap)</div>
                <div className="col-span-2 text-right">Elkérezés (óra)</div>
              </div>

              {yearRows.length === 0 ? (
                <div className="px-3 py-6 text-white/60 text-sm">Nincs adat.</div>
              ) : (
                yearRows.map((r) => (
                  <div key={r.employeeName} className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10">
                    <div className="col-span-6 text-white text-sm">{r.employeeName}</div>
                    <div className="col-span-2 text-right text-white/80 text-sm">{r.vacationDays}</div>
                    <div className="col-span-2 text-right text-white/80 text-sm">{r.shortDays}</div>
                    <div className="col-span-2 text-right text-white/80 text-sm">{r.shortHours}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
