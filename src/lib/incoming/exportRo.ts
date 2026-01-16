/*
  ALL IN – Incoming export (RO)

  Requirement:
  - Internal canonical fields are Hungarian.
  - Official documents must be exported with Romanian headers.

  This module converts IncomingDraftItem (or DB items with same shape)
  to rows suitable for XLSX/CSV/PDF generation.
*/

import type { IncomingDraftItem } from './importMapper';

export type RoExportRow = Record<string, string | number | null>;

export type ExportDocType = 'AVIZ' | 'RECEPTIE';

export const RO_HEADERS_BASE = {
  cod: 'Cod',
  denumire: 'Denumire',
  marca: 'Marca',
  gen: 'Gen',
  cod_culoare: 'Cod culoare',
  culoare: 'Culoare',
  marime: 'Mărime',
  categorie: 'Categorie',
  pret_achiz: 'Preț achiziție',
  cantitate: 'Cantitate',
  valoare: 'Valoare',
} as const;

function genderToRo(g: IncomingDraftItem['nem']): string {
  switch (g) {
    case 'Férfi':
      return 'Bărbat';
    case 'Női':
      return 'Femeie';
    case 'Unisex':
      return 'Unisex';
    case 'Gyerek':
      return 'Copii';
    default:
      return 'Necunoscut';
  }
}

function n(v: number | null): number | null {
  return v === null ? null : Number(v);
}

export function toRoRow(item: IncomingDraftItem): RoExportRow {
  return {
    [RO_HEADERS_BASE.cod]: item.kod,
    [RO_HEADERS_BASE.denumire]: item.termeknev,
    [RO_HEADERS_BASE.marca]: item.marka,
    [RO_HEADERS_BASE.gen]: genderToRo(item.nem),
    [RO_HEADERS_BASE.cod_culoare]: item.szinkod,
    [RO_HEADERS_BASE.culoare]: item.szin,
    [RO_HEADERS_BASE.marime]: item.meret,
    [RO_HEADERS_BASE.categorie]: item.kategoria,
    [RO_HEADERS_BASE.pret_achiz]: item.beszerzesi_ar === null ? null : n(item.beszerzesi_ar),
    [RO_HEADERS_BASE.cantitate]: item.db === null ? null : n(item.db),
    [RO_HEADERS_BASE.valoare]: item.osszertek === null ? null : n(item.osszertek),
  };
}

/**
 * AVIZ export rows.
 * If you need additional columns (furnizor, nr doc, data), add them in the document generator layer.
 */
export function toAvizRows(items: IncomingDraftItem[]): RoExportRow[] {
  return (items || []).map(toRoRow);
}

/**
 * RECEPTIE export rows.
 * Can be identical to AVIZ at row-level; document header differs.
 */
export function toReceptieRows(items: IncomingDraftItem[]): RoExportRow[] {
  return (items || []).map(toRoRow);
}
