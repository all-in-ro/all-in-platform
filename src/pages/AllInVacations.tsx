import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Users2, ClipboardList, ArrowLeft } from "lucide-react";

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

type CompEvent = {
  id: string;
  employeeName: string;
  day: string; // YYYY-MM-DD
  unit: "day" | "hour";
  amount: number; // + = tartozunk neki, - = kompenzaltuk
  note: string;
  createdAt: string;
  createdBy: string | null;
};

type CompSummaryRow = {
  employeeName: string;
  creditDays: number;
  creditHours: number;
  debitDays: number;
  debitHours: number;
  balanceDays: number;
  balanceHours: number;
};

type YearSummaryRow = {
  employeeName: string;
  vacationDays: number;
  shortDays: number;
  shortHours: number;
  compCreditDays?: number;
  compCreditHours?: number;
  compDebitDays?: number;
  compDebitHours?: number;
  compBalanceDays?: number;
  compBalanceHours?: number;
};

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

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();

    if ("addEventListener" in mq) mq.addEventListener("change", onChange);
    else (mq as any).addListener(onChange);

    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", onChange);
      else (mq as any).removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}

export default function AllInVacations({ api }: { api?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  const isMobile = useIsMobile();

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
  const [compItems, setCompItems] = useState<CompEvent[]>([]);
  const [compSummary, setCompSummary] = useState<CompSummaryRow[]>([]);
  const [listErr, setListErr] = useState("");
  const [listBusy, setListBusy] = useState(false);

  // Mobile UI state
  const [mobilePane, setMobilePane] = useState<"employees" | "details">("employees");
  useEffect(() => {
    if (!isMobile) return;
    // If we already have a selected employee, land on details; otherwise employees list.
    setMobilePane(selected ? "details" : "employees");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Create
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dayTo, setDayTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<TimeEvent["kind"]>("vacation");
  const [kindOpen, setKindOpen] = useState(false);
  const kindRef = useRef<HTMLDivElement | null>(null);
  const [shortHours, setShortHours] = useState<number>(4);
  const [note, setNote] = useState<string>("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  // Compensation (tartozas / kompenzacio)
  const [compDay, setCompDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [compUnit, setCompUnit] = useState<"day" | "hour">("hour");
  const [compDir, setCompDir] = useState<"credit" | "debit">("credit");
  const [compDirOpen, setCompDirOpen] = useState(false);
  const [compUnitOpen, setCompUnitOpen] = useState(false);
  const compDirRef = useRef<HTMLDivElement | null>(null);
  const compUnitRef = useRef<HTMLDivElement | null>(null);
  const [compAmount, setCompAmount] = useState<number>(2);
  const [compNote, setCompNote] = useState<string>("");
  const [compChecked, setCompChecked] = useState(false);
  const [compErr, setCompErr] = useState<string>("");
  const [compBusy, setCompBusy] = useState(false);

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
  const [confirmAction, setConfirmAction] = useState<"deleteTime" | "deleteComp" | "saveComp" | null>(null);

  // Year summary + PDF
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryYear, setSummaryYear] = useState<number>(new Date().getFullYear());
  const [yearRows, setYearRows] = useState<YearSummaryRow[]>([]);
  const [yearErr, setYearErr] = useState("");
  const [yearBusy, setYearBusy] = useState(false);

  // PDF settings modal (desktop only)
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfYear, setPdfYear] = useState<number>(new Date().getFullYear());
  const [pdfEmployee, setPdfEmployee] = useState<string>(""); // empty = all
  const [pdfEmpOpen, setPdfEmpOpen] = useState(false);
  const pdfEmpRef = useRef<HTMLDivElement | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen && !summaryOpen && !pdfOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmOpen(false);
        setSummaryOpen(false);
        setPdfOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, summaryOpen, pdfOpen]);

  // Custom dropdowns for Compensation + PDF (avoid OS/browser blue highlights)
  useEffect(() => {
    if (!compDirOpen && !compUnitOpen && !pdfEmpOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (compDirOpen && compDirRef.current && !compDirRef.current.contains(t)) setCompDirOpen(false);
      if (compUnitOpen && compUnitRef.current && !compUnitRef.current.contains(t)) setCompUnitOpen(false);
      if (pdfEmpOpen && pdfEmpRef.current && !pdfEmpRef.current.contains(t)) setPdfEmpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCompDirOpen(false);
        setCompUnitOpen(false);
        setPdfEmpOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [compDirOpen, compUnitOpen, pdfEmpOpen]);

  // Custom "Típus" dropdown: force ONLY our colors (no OS/browser blue highlight).
  useEffect(() => {
    if (!kindOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (kindRef.current && !kindRef.current.contains(t)) setKindOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKindOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [kindOpen]);

  const fetchEmployees = async () => {
    setEmpErr("");
    setEmpBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/vacations/employees`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      const list: Employee[] = Array.isArray(j?.items) ? j.items : [];
      setEmployees(list);
      if (!selected && list.length) {
        setSelected(list[0].name);
        if (isMobile) setMobilePane("details");
      }
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
      const r = await fetch(`${apiBase}/admin/vacations/summary?year=${encodeURIComponent(String(y))}`, {
        credentials: "include",
      });
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

  const openPdf = () => {
    setYearErr("");
    setPdfYear(Number.isFinite(summaryYear) ? summaryYear : new Date().getFullYear());
    setPdfEmployee("");
    setPdfOpen(true);
  };

  const downloadPdf = async () => {
    const y = Number(pdfYear);
    if (!Number.isFinite(y)) return;
    setYearErr("");
    try {
      const params = new URLSearchParams();
      params.set("year", String(y));
      if (pdfEmployee.trim()) params.set("employee", pdfEmployee.trim());
      const url = `${apiBase}/admin/vacations/summary.pdf?${params.toString()}`;
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) setYearErr("A böngésző letiltotta az új ablakot a PDF-hez.");
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
      setCompSummary(Array.isArray(jSum?.compSummary) ? jSum.compSummary : []);

      // 2) Then load the events list for the SELECTED employee (right panel).
      if (emp) {
        const itemsUrl = `${apiBase}/admin/vacations?month=${encodeURIComponent(month)}&employee=${encodeURIComponent(emp)}`;
        const rItems = await fetch(itemsUrl, { credentials: "include" });
        const jItems = await rItems.json().catch(() => null);
        if (!rItems.ok) throw new Error(String(jItems?.error || jItems?.message || `HTTP ${rItems.status}`));
        setItems(Array.isArray(jItems?.items) ? jItems.items : []);
        setCompItems(Array.isArray(jItems?.compItems) ? jItems.compItems : []);
      } else {
        setItems([]);
        setCompItems([]);
      }
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba"));
      setItems([]);
      setSummary([]);
      setCompItems([]);
      setCompSummary([]);
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

  const selectedComp = useMemo(() => {
    const s = compSummary.find((x) => x.employeeName === selected);
    return (
      s || {
        employeeName: selected,
        creditDays: 0,
        creditHours: 0,
        debitDays: 0,
        debitHours: 0,
        balanceDays: 0,
        balanceHours: 0,
      }
    );
  }, [compSummary, selected]);

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

  async function saveComp() {
    setCompErr("");
    const emp = selected.trim();
    if (!emp) {
      setCompErr("Válassz alkalmazottat.");
      return;
    }
    if (!/\d{4}-\d{2}-\d{2}/.test(compDay)) {
      setCompErr("A dátum formátuma hibás.");
      return;
    }
    if (!compNote.trim()) {
      setCompErr("A megjegyzés kötelező (ez a bizonyíték).");
      return;
    }

    const a = Math.trunc(Number(compAmount));
    if (!Number.isFinite(a) || a <= 0) {
      setCompErr("A mennyiség legyen pozitív szám.");
      return;
    }
    if (compUnit === "hour" && a > 12) {
      setCompErr("Óránál maximum 12 legyen.");
      return;
    }
    if (compUnit === "day" && a > 31) {
      setCompErr("Napnál maximum 31 legyen.");
      return;
    }

    const signed = compDir === "credit" ? a : -a;

    setCompBusy(true);
    try {
      const payload = {
        employeeName: emp,
        day: compDay,
        unit: compUnit,
        amount: signed,
        note: compNote.trim(),
      };

      const r = await fetch(`${apiBase}/admin/vacations/comp`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      setCompNote("");
      setCompChecked(false);
      await fetchList(emp);
    } catch (e: any) {
      setCompErr(String(e?.message || e || "Hiba"));
    } finally {
      setCompBusy(false);
    }
  }

  const openDeleteTime = (id: string) => {
    setConfirmTitle("Törlés");
    setConfirmMsg("Biztos törlöd? Ez csak a bejegyzést törli, nem a dolgozót.");
    setConfirmId(id);
    setConfirmAction("deleteTime");
    setConfirmOpen(true);
  };

  const openDeleteComp = (id: string) => {
    setConfirmTitle("Törlés");
    setConfirmMsg("Biztos törlöd ezt a kompenzációs bejegyzést?");
    setConfirmId(id);
    setConfirmAction("deleteComp");
    setConfirmOpen(true);
  };

  const openSaveCompConfirm = () => {
    setConfirmTitle("Kompenzáció mentése");
    setConfirmMsg(
      "Biztos mented? Ez kompenzációs esemény lesz (tartozás / kiegyenlítés), és nem csökkenti a rendes szabadságot."
    );
    setConfirmId(null);
    setConfirmAction("saveComp");
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    const action = confirmAction;
    const id = confirmId;
    setConfirmOpen(false);
    setConfirmId(null);
    setConfirmAction(null);

    if (!action) return;

    if (action === "deleteTime") {
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
      return;
    }

    if (action === "deleteComp") {
      if (!id) return;
      setListErr("");
      try {
        const r = await fetch(`${apiBase}/admin/vacations/comp/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
        await fetchList();
      } catch (e: any) {
        setListErr(String(e?.message || e || "Hiba törlésnél"));
      }
      return;
    }

    if (action === "saveComp") {
      await saveComp();
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

  const EmployeesPane = (
    <div>
      <div className="text-white/80 text-sm">Alkalmazottak</div>
      <div className="mt-2">
        <input className={input} placeholder="Keresés név szerint…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                onClick={() => {
                  setSelected(e.name);
                  if (isMobile) setMobilePane("details");
                }}
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
  );

  const DetailsPane = (
    <div>
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
          Szabadság napok: <span className="text-white">{selectedSummary.vacationDays}</span> · Elkérezés órák:{" "}
          <span className="text-white">{selectedShortHours}</span>
          <span className="text-white/50"> · </span>
          Tartozás egyenleg: <span className="text-white">{selectedComp.balanceDays}</span> nap, <span className="text-white">{selectedComp.balanceHours}</span> óra
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
            <div ref={kindRef} className="relative">
              <button
                type="button"
                className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                onClick={() => setKindOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={kindOpen}
              >
                <span className="text-sm">{kind === "vacation" ? "Szabadság nap" : "Elkérezés (óra)"}</span>
                <span className="text-white/70 text-xs">▾</span>
              </button>

              {kindOpen && (
                <div
                  role="listbox"
                  className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
                  style={{ backgroundColor: "#354153" }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={kind === "vacation"}
                    className={
                      "w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0 "
                    }
                    style={{ backgroundColor: kind === "vacation" ? "#208d8b" : "#354153" }}
                    onClick={() => {
                      setKind("vacation");
                      setKindOpen(false);
                    }}
                  >
                    Szabadság nap
                  </button>

                  <button
                    type="button"
                    role="option"
                    aria-selected={kind === "short"}
                    className={"w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"}
                    style={{ backgroundColor: kind === "short" ? "#208d8b" : "#354153" }}
                    onClick={() => {
                      setKind("short");
                      setKindOpen(false);
                    }}
                  >
                    Elkérezés (óra)
                  </button>
                </div>
              )}
            </div>
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

      <div className="mt-4 rounded-xl border border-white/30 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-white/80 text-sm">Kompenzáció (tartozás)</div>
            <div className="text-white/50 text-xs mt-1">
              Ha hivatalos szabadság alatt dolgozik vagy túlórázik: te tartozol. Ha kiadod/kompenzálod: kiegyenlítés.
            </div>
          </div>
          <div className="text-white/70 text-sm">
            Egyenleg ({month}):{" "}
            <span className="text-white">{selectedComp.balanceDays}</span> nap, <span className="text-white">{selectedComp.balanceHours}</span> óra
          </div>
        </div>

        <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-4">
          <div className="grid gap-2">
            <div className={label}>Dátum</div>
            <input type="date" className={input} value={compDay} onChange={(e) => setCompDay(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <div className={label}>Típus</div>
	          <div ref={compDirRef} className="relative">
	            <button
	              type="button"
	              className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
	              onClick={() => setCompDirOpen((v) => !v)}
	              aria-haspopup="listbox"
	              aria-expanded={compDirOpen}
	            >
	              <span className="text-sm">{compDir === "credit" ? "Tartozunk neki (+)" : "Kiegyenlítve (-)"}</span>
	              <span className="text-white/70 text-xs">▾</span>
	            </button>

	            {compDirOpen && (
	              <div
	                role="listbox"
	                className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
	                style={{ backgroundColor: "#354153" }}
	              >
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compDir === "credit"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compDir === "credit" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    setCompDir("credit");
	                    setCompDirOpen(false);
	                  }}
	                >
	                  Tartozunk neki (+)
	                </button>
	
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compDir === "debit"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compDir === "debit" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    setCompDir("debit");
	                    setCompDirOpen(false);
	                  }}
	                >
	                  Kiegyenlítve (-)
	                </button>
	              </div>
	            )}
	          </div>
          </div>

          <div className="grid gap-2">
            <div className={label}>Mérték</div>
	          <div ref={compUnitRef} className="relative">
	            <button
	              type="button"
	              className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
	              onClick={() => setCompUnitOpen((v) => !v)}
	              aria-haspopup="listbox"
	              aria-expanded={compUnitOpen}
	            >
	              <span className="text-sm">{compUnit === "hour" ? "Óra" : "Nap"}</span>
	              <span className="text-white/70 text-xs">▾</span>
	            </button>

	            {compUnitOpen && (
	              <div
	                role="listbox"
	                className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
	                style={{ backgroundColor: "#354153" }}
	              >
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compUnit === "hour"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compUnit === "hour" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    const u = "hour" as const;
	                    setCompUnit(u);
	                    if (compAmount > 12) setCompAmount(2);
	                    setCompUnitOpen(false);
	                  }}
	                >
	                  Óra
	                </button>
	
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compUnit === "day"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compUnit === "day" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    const u = "day" as const;
	                    setCompUnit(u);
	                    if (compAmount > 31) setCompAmount(1);
	                    setCompUnitOpen(false);
	                  }}
	                >
	                  Nap
	                </button>
	              </div>
	            )}
	          </div>
          </div>

          <div className="grid gap-2">
            <div className={label}>Mennyiség</div>
            <input
              type="number"
              min={1}
              max={compUnit === "hour" ? 12 : 31}
              step={1}
              className={input}
              value={compAmount}
              onChange={(e) => setCompAmount(Number(e.target.value))}
            />
          </div>

          <div className="grid gap-2 sm:col-span-4">
            <div className={label}>Megjegyzés (kötelező)</div>
            <input
              className={input}
              value={compNote}
              onChange={(e) => setCompNote(e.target.value)}
              placeholder="Pl. behívva szabadság alatt / túlóra / kompenzáció kiadva"
            />
          </div>

          <div className="sm:col-span-4 flex items-center justify-between gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 text-white/80 text-sm select-none">
              <input
                type="checkbox"
                checked={compChecked}
                onChange={(e) => setCompChecked(e.target.checked)}
                className="h-4 w-4 accent-[#208d8b]"
              />
              Kompenzációs esemény (nem csökkenti a rendes szabadságot)
            </label>

            <Button
              type="button"
              className={btnPrimary}
              disabled={compBusy || !selected}
              onClick={() => {
                setCompErr("");
                if (!compChecked) {
                  setCompErr("Előbb pipáld ki, hogy ez kompenzáció (külön tábla), majd mentés.");
                  return;
                }
                openSaveCompConfirm();
              }}
            >
              {compBusy ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </div>

        {compErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{compErr}</div> : null}

        <div className="mt-4 rounded-xl border border-white/30 overflow-hidden">
          {isMobile ? (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-7">Típus</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-3">Dátum</div>
              <div className="col-span-3">Típus</div>
              <div className="col-span-2 text-right">Nap</div>
              <div className="col-span-2 text-right">Óra</div>
              <div className="col-span-1">Megjegyzés</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          )}

          {compItems.length === 0 ? (
            <div className="px-3 py-6 text-white/60 text-sm">Nincs kompenzáció ebben a hónapban.</div>
          ) : (
            compItems.map((it) => {
              const isDay = it.unit === "day";
              const isCredit = Number(it.amount) > 0;
              const labelType = isCredit ? "Tartozás (+)" : "Kiegyenlítés (-)";
              const dayVal = isDay ? Math.abs(Number(it.amount) || 0) : 0;
              const hourVal = !isDay ? Math.abs(Number(it.amount) || 0) : 0;
              return isMobile ? (
                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start border-t border-white/10">
                  <div className="col-span-4 text-white text-sm">{it.day}</div>
                  <div className="col-span-7 text-white/80 text-sm">
                    <div>
                      {labelType} · {isDay ? `${dayVal} nap` : `${hourVal} óra`}
                    </div>
                    <div className="text-white/60 text-xs mt-1 break-words">{it.note}</div>
                  </div>
                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      aria-label="Törlés"
                      title="Törlés"
                      className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => openDeleteComp(it.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start border-t border-white/10">
                  <div className="col-span-3 text-white text-sm">{it.day}</div>
                  <div className="col-span-3 text-white/80 text-sm">{labelType}</div>
                  <div className="col-span-2 text-right text-white/80 text-sm">{dayVal || "-"}</div>
                  <div className="col-span-2 text-right text-white/80 text-sm">{hourVal || "-"}</div>
                  <div className="col-span-1 text-white/70 text-sm break-words">{it.note}</div>
                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      aria-label="Törlés"
                      title="Törlés"
                      className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => openDeleteComp(it.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-white/80 text-sm">Bejegyzések ({month})</div>
        </div>
        {listErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-2">{listErr}</div> : null}

        <div className="mt-3 rounded-xl border border-white/30 overflow-hidden">
          {isMobile ? (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-7">Típus</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-4">Típus</div>
              <div className="col-span-3">Megjegyzés</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          )}

          {grouped.length === 0 ? (
            <div className="px-3 py-6 text-white/60 text-sm">Nincs bejegyzés ebben a hónapban.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.day} className="border-t border-white/10">
                {g.items.map((it) => (
                  isMobile ? (
                    <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-4 text-white text-sm">{it.day}</div>
                      <div className="col-span-7 text-white/80 text-sm">
                        <div>
                          {fmtKind(it.kind)}
                          {it.kind === "short" ? (
                            <span className="text-white/50"> ({it.hoursOff ?? 4} óra)</span>
                          ) : null}
                        </div>
                        {it.note ? (
                          <div className="text-white/60 text-xs mt-1 break-words">{it.note}</div>
                        ) : null}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          aria-label="Törlés"
                          title="Törlés"
                          className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => openDeleteTime(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-4 text-white text-sm">{it.day}</div>
                      <div className="col-span-4 text-white/80 text-sm">
                        {fmtKind(it.kind)}
                        {it.kind === "short" ? <span className="text-white/50"> ({it.hoursOff ?? 4} óra)</span> : null}
                      </div>
                      <div className="col-span-3 text-white/70 text-sm break-words">{it.note || "-"}</div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          aria-label="Törlés"
                          title="Törlés"
                          className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => openDeleteTime(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
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
  );

  return (
    <div className="min-h-screen w-screen" style={{ backgroundColor: "#474c59" }}>
      {/* Native <select> dropdowns love forcing bright blue highlights.
          Override option backgrounds so the dropdown uses our palette. */}
      <style>{`
        select.allin-select { color-scheme: dark; accent-color: #208d8b; }
        select.allin-select option { background-color: #354153 !important; color: #ffffff !important; }
        select.allin-select option:hover,
        select.allin-select option:focus,
        select.allin-select option:active { background-color: #3c5069 !important; color: #ffffff !important; }
        select.allin-select option:checked,
        select.allin-select option:checked:hover { background-color: #208d8b !important; color: #ffffff !important; }
      `}</style>

      <div className="w-full max-w-6xl mx-auto px-4 py-6">
        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-white text-xl font-medium">SZABADSÁGOK</div>
              <div className="text-white/60 text-xs mt-1">Szabadság napok és Elkérezés órák külön kezelve.</div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Mobilon a PDF generálás nem kell. */}
              <Button className={btn + " hidden sm:inline-flex"} type="button" onClick={openPdf} disabled={yearBusy}>
                <span className="inline-flex items-center gap-2">
                  <img
                    src="https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/PDF.png"
                    alt="PDF"
                    className="h-5 w-5"
                  />
                  <span>{yearBusy ? "PDF…" : "PDF"}</span>
                </span>
              </Button>
              <Button className={btnPrimary} type="button" onClick={openYearSummary} disabled={yearBusy}>
                {yearBusy ? "Frissítés…" : "Összesítés"}
              </Button>
              <Button className={btn} onClick={() => (window.location.hash = "#allinadmin")} type="button">
                Vissza
              </Button>
            </div>
          </div>

          {yearErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{yearErr}</div> : null}

          {/* Desktop/tablet layout */}
          <div className="mt-6 hidden sm:grid gap-4 grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-4">{EmployeesPane}</div>
            <div className="lg:col-span-8">{DetailsPane}</div>
          </div>

          {/* Mobile layout (automatic) */}
          <div className="mt-6 sm:hidden">
            <div className="rounded-xl border border-white/30 bg-white/5 overflow-hidden">
              <div className="flex items-center">
                <button
                  type="button"
                  className={
                    "flex-1 h-11 px-3 text-sm text-white border-r border-white/10 flex items-center justify-center gap-2 " +
                    (mobilePane === "employees" ? "bg-white/10" : "bg-transparent")
                  }
                  onClick={() => setMobilePane("employees")}
                >
                  <Users2 className="h-4 w-4" />
                  Dolgozók
                </button>
                <button
                  type="button"
                  className={
                    "flex-1 h-11 px-3 text-sm text-white flex items-center justify-center gap-2 " +
                    (mobilePane === "details" ? "bg-white/10" : "bg-transparent")
                  }
                  onClick={() => setMobilePane("details")}
                  disabled={!selected}
                  aria-disabled={!selected}
                  title={!selected ? "Előbb válassz dolgozót" : ""}
                >
                  <ClipboardList className="h-4 w-4" />
                  Részletek
                </button>
              </div>
            </div>

            {mobilePane === "employees" ? (
              <div className="mt-4">{EmployeesPane}</div>
            ) : (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => setMobilePane("employees")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Dolgozók
                  </button>
                  <div className="text-white/70 text-sm truncate">
                    {selected ? `Kiválasztva: ${selected}` : "Nincs kiválasztva"}
                  </div>
                </div>
                {DetailsPane}
              </div>
            )}
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
              {isMobile ? (
                <div className="grid grid-cols-10 gap-0 bg-white/5 text-white/70 text-[11px] px-3 py-2">
                  <div className="col-span-4">Név</div>
                  <div className="col-span-2 text-right">Szab. (nap)</div>
                  <div className="col-span-2 text-right">Elk. (nap)</div>
                  <div className="col-span-2 text-right">Elk. (óra)</div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                  <div className="col-span-6">Név</div>
                  <div className="col-span-2 text-right">Szabadság (nap)</div>
                  <div className="col-span-2 text-right">Elkérezés (nap)</div>
                  <div className="col-span-2 text-right">Elkérezés (óra)</div>
                </div>
              )}

              {yearRows.length === 0 ? (
                <div className="px-3 py-6 text-white/60 text-sm">Nincs adat.</div>
              ) : (
                yearRows.map((r) => (
                  isMobile ? (
                    <div
                      key={r.employeeName}
                      className="grid grid-cols-10 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-4 text-white text-sm truncate">{r.employeeName}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.vacationDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortHours}</div>
                    </div>
                  ) : (
                    <div
                      key={r.employeeName}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-6 text-white text-sm">{r.employeeName}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.vacationDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortHours}</div>
                    </div>
                  )
                ))
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/30 overflow-hidden">
              {isMobile ? (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-[11px] px-3 py-2">
                  <div className="col-span-4">Név</div>
                  <div className="col-span-4 text-right">Tartozás egyenleg (nap)</div>
                  <div className="col-span-4 text-right">Tartozás egyenleg (óra)</div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                  <div className="col-span-6">Név</div>
                  <div className="col-span-3 text-right">Tartozás egyenleg (nap)</div>
                  <div className="col-span-3 text-right">Tartozás egyenleg (óra)</div>
                </div>
              )}

              {yearRows.length === 0 ? (
                <div className="px-3 py-6 text-white/60 text-sm">Nincs adat.</div>
              ) : (
                yearRows.map((r) => {
                  const bd = Number(r.compBalanceDays ?? 0) || 0;
                  const bh = Number(r.compBalanceHours ?? 0) || 0;
                  return isMobile ? (
                    <div
                      key={r.employeeName + "__comp"}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-4 text-white text-sm truncate">{r.employeeName}</div>
                      <div className="col-span-4 text-right text-white/80 text-sm">{bd}</div>
                      <div className="col-span-4 text-right text-white/80 text-sm">{bh}</div>
                    </div>
                  ) : (
                    <div
                      key={r.employeeName + "__comp"}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-6 text-white text-sm">{r.employeeName}</div>
                      <div className="col-span-3 text-right text-white/80 text-sm">{bd}</div>
                      <div className="col-span-3 text-right text-white/80 text-sm">{bh}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {pdfOpen && (
        <div className="fixed inset-0 z-[125] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-white font-medium">PDF generálás</div>
                <div className="text-white/70 text-sm mt-1">
                  Év + (opcionálisan) alkalmazott. Ha választasz alkalmazottat, lesz aláírási rész is.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-10 w-28 rounded-xl px-3 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20"
                  value={pdfYear}
                  onChange={(e) => setPdfYear(Number(e.target.value))}
                />

                <div ref={pdfEmpRef} className="relative">
                  <button
                    type="button"
                    className="h-10 min-w-[220px] px-3 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10 flex items-center justify-between gap-2"
                    onClick={() => setPdfEmpOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={pdfEmpOpen}
                  >
                    <span className="text-sm truncate">
                      {pdfEmployee.trim() ? pdfEmployee.trim() : "Összes dolgozó"}
                    </span>
                    <span className="text-white/70 text-xs">▾</span>
                  </button>

                  {pdfEmpOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
                      style={{ backgroundColor: "#354153" }}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={!pdfEmployee.trim()}
                        className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
                        style={{ backgroundColor: !pdfEmployee.trim() ? "#208d8b" : "#354153" }}
                        onClick={() => {
                          setPdfEmployee("");
                          setPdfEmpOpen(false);
                        }}
                      >
                        Összes dolgozó
                      </button>

                      {employees.map((e) => (
                        <button
                          key={e.name}
                          type="button"
                          role="option"
                          aria-selected={pdfEmployee.trim() === e.name}
                          className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
                          style={{ backgroundColor: pdfEmployee.trim() === e.name ? "#208d8b" : "#354153" }}
                          onClick={() => {
                            setPdfEmployee(e.name);
                            setPdfEmpOpen(false);
                          }}
                        >
                          {e.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={downloadPdf}
                >
                  PDF
                </button>

                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setPdfOpen(false)}
                >
                  Mégse
                </button>
              </div>
            </div>

            {yearErr ? <div className="text-red-400 text-sm whitespace-pre-wrap mt-3">{yearErr}</div> : null}
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
                className={
                  "h-10 px-4 rounded-xl text-white font-medium " +
                  (confirmAction === "saveComp" ? "bg-[#208d8b] hover:bg-[#1b7a78]" : "bg-red-600 hover:bg-red-700")
                }
                onClick={runConfirm}
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
