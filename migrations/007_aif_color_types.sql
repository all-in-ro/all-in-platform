BEGIN;

CREATE TABLE IF NOT EXISTS aif_color_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ro text NOT NULL,
  name_hu text,
  name_en text,
  name_de text,
  aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  hex text,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aif_color_types_active_sort ON aif_color_types (is_active DESC, sort_order ASC, name_ro ASC);
CREATE INDEX IF NOT EXISTS idx_aif_color_types_aliases ON aif_color_types USING gin (aliases);

DROP TRIGGER IF EXISTS trg_aif_color_types_updated_at ON aif_color_types;
CREATE TRIGGER trg_aif_color_types_updated_at
BEFORE UPDATE ON aif_color_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO aif_color_types (code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order)
VALUES
  ('negru', 'negru', 'fekete', 'black', 'schwarz', ARRAY['black','schwarz','nero','noir','fekete','negru'], '#000000', 10),
  ('alb', 'alb', 'fehér', 'white', 'weiß', ARRAY['white','weiss','weiß','blanco','bianco','feher','fehér','alb'], '#ffffff', 20),
  ('rosu', 'roșu', 'piros', 'red', 'rot', ARRAY['red','rot','rosso','rojo','piros','rosu','roșu'], '#cc0000', 30),
  ('albastru', 'albastru', 'kék', 'blue', 'blau', ARRAY['blue','blau','bleu','blu','albastru','kek','kék'], '#1d4ed8', 40),
  ('bleumarin', 'bleumarin', 'sötétkék', 'navy', 'marine', ARRAY['dark blue','navy','marine','bleumarin','sotetkek','sotet kek','sötét kék','navy blue'], '#1e2a44', 50),
  ('verde', 'verde', 'zöld', 'green', 'grün', ARRAY['green','grun','grün','verde','zold','zöld'], '#15803d', 60),
  ('galben', 'galben', 'sárga', 'yellow', 'gelb', ARRAY['yellow','gelb','giallo','galben','sarga','sárga'], '#facc15', 70),
  ('gri', 'gri', 'szürke', 'grey', 'grau', ARRAY['grey','gray','grau','gri','szurke','szürke'], '#808080', 80),
  ('portocaliu', 'portocaliu', 'narancs', 'orange', 'orange', ARRAY['orange','portocaliu','narancs'], '#f97316', 90),
  ('maro', 'maro', 'barna', 'brown', 'braun', ARRAY['brown','braun','marrone','maro','barna'], '#7c2d12', 100),
  ('bej', 'bej', 'bézs', 'beige', 'beige', ARRAY['beige','bej','bezs','bézs'], '#d6c2a8', 110),
  ('mov', 'mov', 'lila', 'purple', 'violett', ARRAY['purple','violet','violett','lila','mov'], '#7e22ce', 120),
  ('roz', 'roz', 'rózsaszín', 'pink', 'rosa', ARRAY['pink','rosa','roz','rozsa','rózsaszín','rozsaszin'], '#f9a8d4', 130),
  ('auriu', 'auriu', 'arany', 'gold', 'gold', ARRAY['gold','golden','auriu','arany'], '#d4af37', 140),
  ('argintiu', 'argintiu', 'ezüst', 'silver', 'silber', ARRAY['silver','silber','argintiu','ezust','ezüst'], '#c0c0c0', 150),
  ('crem', 'crem', 'krém', 'cream', 'creme', ARRAY['cream','creme','crem','krem','krém'], '#fff4d6', 160),
  ('fildes', 'fildeș', 'elefántcsont', 'ivory', 'elfenbein', ARRAY['ivory','fildeș','fildes','elefantcsont','elefántcsont','elfenbein'], '#fffff0', 170),
  ('turcoaz', 'turcoaz', 'türkiz', 'turquoise', 'türkis', ARRAY['turquoise','turkis','türkis','turcoaz','turkiz','türkiz'], '#40e0d0', 180),
  ('kaki', 'kaki', 'khaki', 'khaki', 'khaki', ARRAY['khaki','kaki'], '#8a865d', 190),
  ('multicolor', 'multicolor', 'többszínű', 'multicolor', 'mehrfarbig', ARRAY['multi','multicolor','multicolour','mehrfarbig','tobbszinu','többszínű'], NULL, 200)
ON CONFLICT (code) DO UPDATE SET
  name_ro = EXCLUDED.name_ro,
  name_hu = EXCLUDED.name_hu,
  name_en = EXCLUDED.name_en,
  name_de = EXCLUDED.name_de,
  aliases = EXCLUDED.aliases,
  hex = EXCLUDED.hex,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
