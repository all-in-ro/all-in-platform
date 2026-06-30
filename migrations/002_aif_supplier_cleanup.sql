BEGIN;

-- ForIT is not a fashion supplier. It is/was only a source system name.
-- If there is no real import history, remove it completely together with its default profile.
DELETE FROM aif_suppliers s
WHERE s.code = 'forit'
  AND NOT EXISTS (
    SELECT 1 FROM aif_import_batches b WHERE b.supplier_id = s.id
  );

-- If later someone already used it in an import before this migration runs,
-- keep the historical records intact but hide it from active supplier dropdowns.
UPDATE aif_suppliers
SET is_active = false,
    notes = COALESCE(notes, 'ForIT este sistem sursa, nu furnizor real.'),
    updated_at = now()
WHERE code = 'forit';

UPDATE aif_supplier_import_profiles p
SET is_active = false,
    updated_at = now()
FROM aif_suppliers s
WHERE p.supplier_id = s.id
  AND s.code = 'forit';

COMMIT;
