import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Edit3,
  FileSpreadsheet,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AifImportBatchSummary,
  AifLocation,
  AifLocationType,
  AifParsedRow,
  AifSupplier,
  apiAifCommitImportBatch,
  apiAifCreateImportBatch,
  apiAifCreateLocation,
  apiAifCreateLocationType,
  apiAifDeleteLocation,
  apiAifDeleteLocationType,
  apiAifListLocationTypes,
  apiAifUpdateLocation,
  apiAifUpdateLocationType,
  apiAifListImportBatches,
  apiAifMeta,
  apiAifReplaceImportRows,
} from "../lib/aif/api";
import {
  AIF_COLUMN_FIELD_OPTIONS,
  AifColumnField,
  AifWorkbookAnalysis,
  aifRowErrors,
  applyAifColumnMapping,
  readAifWorkbookWithAnalysis,
} from "../lib/aif/xls";

type Props = { onLogout?: () => void };

type LocationType = string;
type EditableImportField = "supplierProductCode" | "titleRo" | "colorName" | "colorCode" | "size" | "qty" | "buyPrice";

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-7xl space-y-4";
const topCard = "rounded-2xl border border-white/24 bg-[#465164] px-4 py-3 shadow-lg shadow-slate-950/10";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-3 shadow-lg shadow-slate-950/15 sm:p-4 font-normal";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-emerald-300 bg-[#303b4e] px-3 py-2.5 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1.5 text-xs uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-9 rounded-lg border border-white/24 bg-[#303b4e] px-3 text-sm text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-emerald-300/35 focus:border-emerald-200/80 focus:ring-1 focus:ring-emerald-200/30 [color-scheme:dark] font-normal";
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/24 bg-[#276454] hover:bg-[#2d735f]`;
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const tinyBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[11px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const fileBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d] h-9 px-3`;
const statCard = "rounded-xl border border-white/12 bg-[#354153] px-3 py-2.5";
const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/74 px-4 py-6 backdrop-blur-sm";
const modalCard = "w-full max-w-2xl rounded-2xl border border-white/22 bg-[#4b5566] p-4 text-white shadow-2xl";

function goHome() {
  window.location.hash = "#allin";
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function valueString(v: unknown) {
  return String(v ?? "");
}

function confidenceText(value: number) {
  if (value >= 85) return "Magas";
  if (value >= 60) return "Közepes";
  if (value > 0) return "Alacsony";
  return "Nincs";
}

function confidenceClass(value: number) {
  if (value >= 85) return "text-emerald-100";
  if (value >= 60) return "text-amber-100";
  if (value > 0) return "text-red-100";
  return "text-white/55";
}

function locationTypeLabel(v: string) {
  const map: Record<string, string> = {
    warehouse: "Raktár",
    shop: "Üzlet / helyszín",
    online: "Online",
    reserved: "Foglalás",
    other: "Egyéb",
  };
  return map[v] || "Egyéb";
}

function SectionTitle(props: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.11em] text-white/94">
        {props.icon}
        <span>{props.title}</span>
      </div>
      {props.right}
    </div>
  );
}


function rowKey(row: AifParsedRow, index: number) {
  return `${row.rowNo || index + 1}-${index}`;
}

export default function AllInIncoming(_props: Props) {
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [locationTypes, setLocationTypes] = useState<AifLocationType[]>([]);
  const [batches, setBatches] = useState<AifImportBatchSummary[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AifParsedRow[]>([]);
  const [workbench, setWorkbench] = useState<AifWorkbookAnalysis | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [previewLimit, setPreviewLimit] = useState(25);
  const [approvedRows, setApprovedRows] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationType, setNewLocationType] = useState<LocationType>("warehouse");
  const [newLocationTypeName, setNewLocationTypeName] = useState("");
  const [editingLocationTypeId, setEditingLocationTypeId] = useState("");
  const [editLocationTypeName, setEditLocationTypeName] = useState("");
  const [deleteLocationTypeTarget, setDeleteLocationTypeTarget] = useState<AifLocationType | null>(null);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editLocationName, setEditLocationName] = useState("");
  const [editLocationType, setEditLocationType] = useState<LocationType>("warehouse");
  const [deleteLocationTarget, setDeleteLocationTarget] = useState<AifLocation | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const activeLocationTypes = useMemo(() => locationTypes.filter((t) => t.is_active), [locationTypes]);
  const locationTypeOptions = useMemo(() => {
    if (activeLocationTypes.length) return activeLocationTypes;
    return [{ id: "warehouse", code: "warehouse", name: "Raktár", is_active: true } as AifLocationType];
  }, [activeLocationTypes]);

  function typeLabel(code: string) {
    return locationTypes.find((t) => t.code === code)?.name || locationTypeLabel(code);
  }

  const preview = useMemo(() => rows.slice(0, previewLimit), [rows, previewLimit]);
  const rowProblems = useMemo(() => rows.filter((r) => aifRowErrors(r).length > 0).length, [rows]);
  const approvedRowList = useMemo(() => rows.filter((row, index) => approvedRows[rowKey(row, index)]), [rows, approvedRows]);
  const approvedProblems = useMemo(() => approvedRowList.filter((r) => aifRowErrors(r).length > 0).length, [approvedRowList]);
  const approvedCount = approvedRowList.length;
  const excludedCount = Math.max(0, rows.length - approvedCount);
  const canSaveApprovedRows = Boolean(supplierId && locationId && approvedCount > 0 && approvedProblems === 0);
  const columnWarnings = useMemo(() => {
    if (!workbench) return 0;
    return workbench.columns.reduce((sum, c) => sum + c.warnings.length + (c.field !== "ignore" && c.confidence < 60 ? 1 : 0), 0) + workbench.warnings.length;
  }, [workbench]);

  function updateColumnField(index: number, field: AifColumnField) {
    if (!workbench) return;
    const next: AifWorkbookAnalysis = {
      ...workbench,
      columns: workbench.columns.map((col) => (col.index === index ? { ...col, field, label: AIF_COLUMN_FIELD_OPTIONS.find((x) => x.value === field)?.label || col.label } : col)),
    };
    setWorkbench(next);
    setRows((current) => applyAifColumnMapping(current, next, selectedSupplier));
  }

  function updateRowField(index: number, field: EditableImportField, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const normalized = { ...(row.normalized || {}) };
        if (field === "qty") normalized[field] = value === "" ? null : Number(value);
        else if (field === "buyPrice") normalized[field] = value === "" ? null : Number(String(value).replace(",", "."));
        else normalized[field] = value;
        if (field === "supplierProductCode") normalized.modelCode = value || normalized.modelCode;
        return { ...row, normalized };
      })
    );
  }

  function toggleApprovedRow(index: number, checked: boolean) {
    const row = rows[index];
    if (!row) return;
    const key = rowKey(row, index);
    setApprovedRows((current) => ({ ...current, [key]: checked }));
  }

  function selectCleanRows() {
    const next: Record<string, boolean> = {};
    rows.forEach((row, index) => {
      if (aifRowErrors(row).length === 0) next[rowKey(row, index)] = true;
    });
    setApprovedRows(next);
    setMessage("A hibátlan sorok ki lettek jelölve. Mentés előtt ellenőrizd az előnézetet.");
  }

  function clearApprovedRows() {
    setApprovedRows({});
    setMessage("A kijelölés törölve. A beolvasott adatok továbbra is csak előnézetben vannak.");
  }

  async function loadMeta() {
    const [meta, typeData] = await Promise.all([apiAifMeta(), apiAifListLocationTypes({ includeInactive: true })]);
    const activeSuppliers = meta.suppliers.filter((x) => x.is_active);
    const activeLocations = meta.locations.filter((x) => x.is_active);
    const allTypes = typeData.items || meta.locationTypes || [];
    const activeTypes = allTypes.filter((x) => x.is_active);
    setSuppliers(activeSuppliers);
    setLocations(activeLocations);
    setLocationTypes(allTypes);
    setNewLocationType((current) => {
      if (current && activeTypes.some((t) => t.code === current)) return current;
      return activeTypes[0]?.code || "warehouse";
    });
    setSupplierId((current) => current || activeSuppliers.find((x) => x.code === "under_armour")?.id || activeSuppliers[0]?.id || "");
    setLocationId((current) => {
      if (current && activeLocations.some((l) => l.id === current)) return current;
      return activeLocations.find((x) => x.code === "main_warehouse")?.id || activeLocations[0]?.id || "";
    });
  }

  async function loadBatches() {
    const data = await apiAifListImportBatches(25);
    setBatches(data.items || []);
  }

  async function reloadAll() {
    await loadMeta();
    await loadBatches();
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadMeta();
        if (alive) await loadBatches();
      } catch (e: any) {
        if (alive) setMessage(e.message || "Nem sikerült betölteni az adatokat.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = await readAifWorkbookWithAnalysis(file, selectedSupplier);
      setFileName(file.name);
      setRows(parsed.rows);
      setWorkbench(parsed.analysis);
      setWorkbenchOpen(true);
      setPreviewLimit(25);
      setApprovedRows({});
      setMessage(`${parsed.rows.length} sor beolvasva előnézetre. Importáláshoz előbb jelöld ki a valóban használható sorokat.`);
    } catch (e: any) {
      setRows([]);
      setWorkbench(null);
      setApprovedRows({});
      setMessage(e.message || "Nem sikerült beolvasni az XLS/XLSX fájlt.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!supplierId || !locationId || !rows.length) return;
    if (!approvedRowList.length) {
      setMessage("Nincs kijelölt sor. Beolvasás után csak a kijelölt sorok menthetők importként.");
      return;
    }
    if (approvedProblems > 0) {
      setMessage("A kijelölt sorok között hibás vagy hiányos adat van. Javítás vagy kizárás után menthető.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const batch = await apiAifCreateImportBatch({
        supplierId,
        targetLocationId: locationId,
        sourceFileName: fileName || "import.xls",
        sourceFormat: "xls",
        note,
      });
      const saved = await apiAifReplaceImportRows(batch.id, approvedRowList);
      await loadBatches();
      setMessage(`Import mentve: ${saved.rowCount} kijelölt sor, ellenőrzendő sor: ${saved.errorCount}. Kizárt sorok: ${excludedCount}.`);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az importot.");
    } finally {
      setBusy(false);
    }
  }

  async function commitBatch(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifCommitImportBatch(id);
      await loadBatches();
      setMessage(`Készletre vétel kész. Létrehozott vagy frissített variánsok: ${result.committed ?? 0}.`);
    } catch (e: any) {
      setMessage(e.message || "A készletre vétel nem sikerült. Ellenőrizd az import sorokat.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocation() {
    if (!newLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocation({ name: newLocationName, locationType: newLocationType });
      setNewLocationName("");
      setNewLocationType(locationTypeOptions[0]?.code || "warehouse");
      await loadMeta();
      setLocationId(created.item.id);
      setMessage("Cél hely mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocationType() {
    if (!newLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocationType({ name: newLocationTypeName });
      setNewLocationTypeName("");
      await loadMeta();
      setNewLocationType(created.item.code);
      setMessage("Típus mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocationType(type: AifLocationType) {
    setDeleteLocationTypeTarget(null);
    setEditingLocationTypeId(type.id);
    setEditLocationTypeName(type.name || "");
  }

  function cancelEditLocationType() {
    setEditingLocationTypeId("");
    setEditLocationTypeName("");
  }

  async function saveLocationTypeEdit() {
    if (!editingLocationTypeId) return;
    if (!editLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(editingLocationTypeId, { name: editLocationTypeName });
      await loadMeta();
      cancelEditLocationType();
      setMessage("Típus módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function activateLocationType(type: AifLocationType) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(type.id, { is_active: true });
      await loadMeta();
      setMessage("Típus aktiválva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült aktiválni a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocationType() {
    if (!deleteLocationTypeTarget) return;
    const target = deleteLocationTypeTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocationType(target.id);
      setDeleteLocationTypeTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Típus törölve." : "Típus inaktiválva, mert már használatban van.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocation(location: AifLocation) {
    setDeleteLocationTarget(null);
    setEditingLocationId(location.id);
    setEditLocationName(location.name || "");
    setEditLocationType((location.location_type as LocationType) || "warehouse");
  }

  function cancelEditLocation() {
    setEditingLocationId("");
    setEditLocationName("");
    setEditLocationType("warehouse");
  }

  async function saveLocationEdit() {
    if (!editingLocationId) return;
    if (!editLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiAifUpdateLocation(editingLocationId, {
        name: editLocationName,
        locationType: editLocationType,
      });
      await loadMeta();
      setLocationId((current) => current || updated.item.id);
      cancelEditLocation();
      setMessage("Cél hely módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocation() {
    if (!deleteLocationTarget) return;
    const target = deleteLocationTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocation(target.id);
      setDeleteLocationTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Cél hely törölve." : "Cél hely inaktiválva, mert már kapcsolódik hozzá adat.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={page}>
      {locationModalOpen && (
        <div className={modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="locations-title">
          <div className={modalCard}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="locations-title" className="text-lg font-normal">Cél helyek kezelése</p>
                <p className="mt-1 text-sm text-white/70">Raktárak, üzletek és egyéb cél helyek felvétele vagy törlése.</p>
              </div>
              <button className={neutralBtn} onClick={() => setLocationModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <label className={label}>
                  Név
                  <input
                    className={`${input} w-full`}
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="pl. Csíkszereda üzlet"
                  />
                </label>
                <label className={label}>
                  Típus
                  <select className={`${input} w-full`} value={newLocationType} onChange={(e) => setNewLocationType(e.target.value as LocationType)}>
                    {locationTypeOptions.map((t) => (
                      <option key={t.id} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <button className={primaryBtn} onClick={createLocation} disabled={busy} type="button">
                  <Save size={14} /> Mentés
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className={label}>
                  Cél hely típus hozzáadása
                  <input
                    className={`${input} w-full sm:w-[280px]`}
                    value={newLocationTypeName}
                    onChange={(e) => setNewLocationTypeName(e.target.value)}
                    placeholder="pl. Bemutatóterem"
                  />
                </label>
                <button className={primaryBtn} onClick={createLocationType} disabled={busy} type="button">
                  <Plus size={14} /> Típus mentése
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {locationTypes.map((t) => {
                  const isEditingType = editingLocationTypeId === t.id;
                  return (
                    <div key={t.id} className="rounded-lg border border-white/10 bg-[#354153] p-2.5">
                      {isEditingType ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className={label}>
                            Típus neve
                            <input
                              className={`${input} w-full`}
                              value={editLocationTypeName}
                              onChange={(e) => setEditLocationTypeName(e.target.value)}
                              placeholder="Típus neve"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={primaryBtn} onClick={saveLocationTypeEdit} disabled={busy} type="button">
                              <Save size={14} /> Mentés
                            </button>
                            <button className={neutralBtn} onClick={cancelEditLocationType} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-white">{t.name}</p>
                            {!t.is_active && <p className="mt-1 text-xs text-white/58">Inaktív</p>}
                          </div>
                          {deleteLocationTypeTarget?.id === t.id ? (
                            <div className="flex flex-wrap gap-2">
                              <button className={neutralBtn} onClick={() => setDeleteLocationTypeTarget(null)} disabled={busy} type="button">
                                <X size={14} /> Mégse
                              </button>
                              <button className={dangerBtn} onClick={confirmDeleteLocationType} disabled={busy} type="button">
                                <Trash2 size={14} /> Törlés
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <button className={neutralBtn} onClick={() => startEditLocationType(t)} disabled={busy} type="button">
                                <Edit3 size={14} /> Módosítás
                              </button>
                              {t.is_active ? (
                                <button className={dangerBtn} onClick={() => { cancelEditLocationType(); setDeleteLocationTypeTarget(t); }} disabled={busy} type="button">
                                  <Trash2 size={14} /> Törlés
                                </button>
                              ) : (
                                <button className={primaryBtn} onClick={() => activateLocationType(t)} disabled={busy} type="button">
                                  <CheckCircle size={14} /> Aktiválás
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!locationTypes.length && <p className="rounded-lg border border-white/10 bg-[#354153] px-3 py-3 text-sm text-white/70">Nincs cél hely típus.</p>}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {locations.map((l) => {
                const isEditing = editingLocationId === l.id;
                return (
                  <div key={l.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                    {isEditing ? (
                      <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto] lg:items-end">
                        <label className={label}>
                          Név
                          <input
                            className={`${input} w-full`}
                            value={editLocationName}
                            onChange={(e) => setEditLocationName(e.target.value)}
                            placeholder="Cél hely neve"
                          />
                        </label>
                        <label className={label}>
                          Típus
                          <select
                            className={`${input} w-full`}
                            value={editLocationType}
                            onChange={(e) => setEditLocationType(e.target.value as LocationType)}
                          >
                            {locationTypeOptions.map((t) => (
                              <option key={t.id} value={t.code}>{t.name}</option>
                            ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button className={primaryBtn} onClick={saveLocationEdit} disabled={busy} type="button">
                            <Save size={14} /> Mentés
                          </button>
                          <button className={neutralBtn} onClick={cancelEditLocation} disabled={busy} type="button">
                            <X size={14} /> Mégse
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-white">{l.name}</p>
                          <p className="mt-1 text-xs text-white/60">{typeLabel(l.location_type)}</p>
                        </div>
                        {deleteLocationTarget?.id === l.id ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={neutralBtn} onClick={() => setDeleteLocationTarget(null)} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                            <button className={dangerBtn} onClick={confirmDeleteLocation} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={neutralBtn} onClick={() => startEditLocation(l)} disabled={busy} type="button">
                              <Edit3 size={14} /> Módosítás
                            </button>
                            <button className={dangerBtn} onClick={() => { cancelEditLocation(); setDeleteLocationTarget(l); }} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!locations.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Nincs aktív cél hely.</p>}
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className={topCard}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/82">AllInFashion</p>
              <h1 className="mt-1 text-2xl font-normal tracking-tight text-white sm:text-3xl">Áru bevételezés</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/78">Beszállító kiválasztás, XLS előnézet és AIF import.</p>
            </div>
            <button className={neutralBtn} onClick={goHome} type="button">
              <ArrowLeft size={15} /> Vissza
            </button>
          </div>
        </header>

        {message && <div className="rounded-xl border border-emerald-200/30 bg-emerald-400/12 px-3 py-2 text-sm text-white/92">{message}</div>}

        <section className={card}>
          <SectionTitle icon={<FileSpreadsheet size={16} />} title="Import alapadatok" right={<span className="text-xs text-white/60">Beszállító, cél hely, fájl</span>} />

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
            <label className={label}>
              Beszállító
              <select className={`${input} w-full`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className={label}>
              Cél hely
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select className={`${input} w-full`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button className={neutralBtn} onClick={() => setLocationModalOpen(true)} type="button" title="Cél helyek kezelése">
                  <MapPin size={14} /> Kezelés
                </button>
              </div>
            </label>

            <label className={label}>
              Megjegyzés
              <input className={`${input} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Under Armour új lista" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={fileBtn}>
              <FileSpreadsheet size={15} /> XLS / XLSX kiválasztás
              <input className="hidden" type="file" accept=".xls,.xlsx,.csv" onChange={onFileChange} />
            </label>
            <button className={neutralBtn} onClick={selectCleanRows} disabled={busy || !rows.length} type="button">
              <CheckCircle size={14} /> Hibátlan sorok kijelölése
            </button>
            <button className={neutralBtn} onClick={clearApprovedRows} disabled={busy || !rows.length || !approvedCount} type="button">
              <X size={14} /> Kijelölés törlése
            </button>
            <button className={primaryBtn} onClick={saveDraft} disabled={busy || !canSaveApprovedRows} type="button">
              <UploadCloud size={15} /> Kijelölt sorok mentése
            </button>
            <button className={neutralBtn} onClick={reloadAll} disabled={busy} type="button">
              <RefreshCw size={14} /> Frissítés
            </button>
            <button className={neutralBtn} onClick={() => (window.location.hash = "#allinsuppliers")} type="button">
              <Building2 size={14} /> Beszállítók
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-5">
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fájl</p>
              <p className="mt-1 truncate text-sm">{fileName || "-"}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Beolvasott sorok</p>
              <p className="mt-1 text-lg font-normal">{rows.length}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kijelölt sorok</p>
              <p className="mt-1 text-lg font-normal">{approvedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kizárt sorok</p>
              <p className="mt-1 text-lg font-normal">{excludedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzendő</p>
              <p className="mt-1 text-lg font-normal">{rowProblems}</p>
            </div>
          </div>
          {rows.length ? (
            <div className="mt-3 rounded-xl border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
              A beolvasás csak előnézet. Importként kizárólag a kijelölt és hibátlan sorok menthetők.
            </div>
          ) : null}
        </section>

        <section className={card}>
          <SectionTitle
            icon={<AlertTriangle size={16} />}
            title="Import ellenőrzés"
            right={
              <button className={tinyBtn} onClick={() => setWorkbenchOpen((v) => !v)} type="button">
                {workbenchOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {workbenchOpen ? "Bezárás" : "Megnyitás"}
              </button>
            }
          />

          {workbenchOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Munkalap</p>
                  <p className="mt-1 truncate text-sm">{workbench?.sheetName || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fejléc sora</p>
                  <p className="mt-1 text-lg font-normal">{workbench?.headerRow || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Felismerés</p>
                  <p className={`mt-1 text-lg font-normal ${confidenceClass(workbench?.overallConfidence || 0)}`}>{workbench?.overallConfidence ?? 0}%</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzések</p>
                  <p className="mt-1 text-lg font-normal">{columnWarnings + rowProblems}</p>
                </div>
              </div>

              {workbench?.warnings?.length ? (
                <div className="rounded-xl border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
                  {workbench.warnings.map((w, i) => (
                    <p key={`${w}-${i}`}>{w}</p>
                  ))}
                </div>
              ) : null}

              <div className="overflow-auto rounded-xl border border-white/14">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
                    <tr>
                      <th className="px-3 py-2 font-normal">Excel oszlop</th>
                      <th className="px-3 py-2 font-normal">Felismert mező</th>
                      <th className="px-3 py-2 font-normal">Biztonság</th>
                      <th className="px-3 py-2 font-normal">Minták</th>
                      <th className="px-3 py-2 font-normal">Megjegyzés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(workbench?.columns || []).map((c) => (
                      <tr key={`${c.index}-${c.header}`} className="bg-[#445064] hover:bg-[#4b596f]">
                        <td className="px-3 py-2.5 text-white/90">{c.header}</td>
                        <td className="px-3 py-2.5">
                          <select className={`${input} h-8 w-[190px]`} value={c.field} onChange={(e) => updateColumnField(c.index, e.target.value as AifColumnField)}>
                            {AIF_COLUMN_FIELD_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className={`px-3 py-2.5 ${confidenceClass(c.confidence)}`}>{confidenceText(c.confidence)} • {c.confidence}%</td>
                        <td className="px-3 py-2.5 text-white/70">{c.samples.length ? c.samples.join(" | ") : "-"}</td>
                        <td className="px-3 py-2.5 text-white/70">{c.warnings.length ? c.warnings.join(" ") : "-"}</td>
                      </tr>
                    ))}
                    {!workbench?.columns?.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-white/60" colSpan={5}>Nincs beolvasott oszlop.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className={card}>
          <SectionTitle icon={<FileSpreadsheet size={16} />} title="Soronkénti előnézet" right={<span className="text-xs text-white/60">Szerkeszthető, kijelölhető sorok</span>} />
          <div className="mt-3 overflow-auto rounded-xl border border-white/14">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
                <tr>
                  <th className="px-3 py-2 font-normal">Importálás</th>
                  <th className="px-3 py-2 font-normal">Sorszám</th>
                  <th className="px-3 py-2 font-normal">Állapot</th>
                  <th className="px-3 py-2 font-normal">Termékkód</th>
                  <th className="px-3 py-2 font-normal">Név</th>
                  <th className="px-3 py-2 font-normal">Szín</th>
                  <th className="px-3 py-2 font-normal">Színkód</th>
                  <th className="px-3 py-2 font-normal">Méret</th>
                  <th className="px-3 py-2 font-normal">Darab</th>
                  <th className="px-3 py-2 font-normal">Vételár</th>
                  <th className="px-3 py-2 font-normal">Döntés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {preview.map((r, idx) => {
                  const globalIndex = idx;
                  const n = r.normalized || {};
                  const errors = aifRowErrors(r);
                  const key = rowKey(r, globalIndex);
                  const approved = Boolean(approvedRows[key]);
                  return (
                    <tr key={`${r.rowNo || idx}-${idx}`} className={errors.length ? "bg-red-500/10 hover:bg-red-500/15" : approved ? "bg-emerald-400/10 hover:bg-emerald-400/14" : "bg-[#445064] hover:bg-[#4b596f]"}>
                      <td className="px-3 py-2.5">
                        <input className="h-4 w-4 accent-emerald-300" type="checkbox" checked={approved} onChange={(e) => toggleApprovedRow(globalIndex, e.target.checked)} aria-label="Sor kijelölése importhoz" />
                      </td>
                      <td className="px-3 py-2.5 text-white/62">{r.rowNo || idx + 1}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {errors.length ? <span className="text-amber-100">Ellenőrizni</span> : <span className="text-emerald-100">Rendben</span>}
                        {errors.length ? <p className="mt-1 max-w-[180px] text-white/60">{errors.join(" ")}</p> : null}
                      </td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[130px]`} value={valueString(n.supplierProductCode || n.modelCode)} onChange={(e) => updateRowField(globalIndex, "supplierProductCode", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[230px]`} value={valueString(n.titleRo)} onChange={(e) => updateRowField(globalIndex, "titleRo", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[120px]`} value={valueString(n.colorName)} onChange={(e) => updateRowField(globalIndex, "colorName", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[90px]`} value={valueString(n.colorCode)} onChange={(e) => updateRowField(globalIndex, "colorCode", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[85px]`} value={valueString(n.size)} onChange={(e) => updateRowField(globalIndex, "size", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[80px]`} value={valueString(n.qty)} onChange={(e) => updateRowField(globalIndex, "qty", e.target.value)} /></td>
                      <td className="px-3 py-2.5"><input className={`${input} h-8 w-[95px]`} value={valueString(n.buyPrice)} onChange={(e) => updateRowField(globalIndex, "buyPrice", e.target.value)} /></td>
                      <td className="px-3 py-2.5 text-xs">{approved ? <span className="text-emerald-100">Mentésre kijelölve</span> : <span className="text-white/55">Kizárva</span>}</td>
                    </tr>
                  );
                })}
                {!preview.length && (
                  <tr>
                    <td className="px-3 py-8 text-center text-white/60" colSpan={11}>Nincs beolvasott sor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > preview.length && (
            <div className="mt-3 flex justify-end">
              <button className={neutralBtn} onClick={() => setPreviewLimit((n) => Math.min(n + 25, rows.length))} type="button">
                További sorok
              </button>
            </div>
          )}
        </section>

        <section className={card}>
          <SectionTitle icon={<CheckCircle size={16} />} title="Import előzmények" right={<span className="text-xs text-white/60">Legutóbbi bevételezések</span>} />
          <div className="mt-3 grid gap-2">
            {batches.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-white/12 bg-[#354153] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-white">{b.supplier_name} • {b.source_file_name || "import"}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {new Date(b.created_at).toLocaleString()} • {b.location_name || "-"} • terméksor: {b.row_count || 0} • ellenőrzendő: {b.error_count || 0} • {b.status}
                  </p>
                </div>
                <button className={primaryBtn} disabled={busy || b.status === "committed"} onClick={() => commitBatch(b.id)} type="button">
                  <CheckCircle size={14} /> Készletre vétel
                </button>
              </div>
            ))}
            {!batches.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Még nincs import előzmény.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
