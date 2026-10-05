-- Additive migration for car parking permit tracking.
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS parking_start date,
  ADD COLUMN IF NOT EXISTS parking_months integer;
