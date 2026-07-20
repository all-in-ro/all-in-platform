# AllInFashion teljes rendszerterkep - hasznalat

Ez a generator a tenyleges Render checkoutbol es a live PostgreSQL semabol keszit technikai atadasi csomagot.

## Mit gyujt ossze?

- effektive fajlstruktura;
- relativ importok es fajl-fajl kapcsolatok;
- frontend API helper-ek es kozvetlen HTTP hivasok;
- backend route-ok;
- frontend -> API -> backend -> adatbazis adatfolyamok;
- SQL-ben olvasott, irt, letrehozott es hivatkozott tablak;
- live PostgreSQL tablak, oszlopok, kulcsok, indexek, triggerek es szekvenciak;
- migraciok;
- ENV valtozonevek, titkos ertekek nelkul;
- fel nem oldott importok, endpointok es duplikalt route-ok;
- teszteles utani atadasi checklist.

A kimenet harom fajl:

- keresheto PDF;
- Markdown;
- gepileg feldolgozhato JSON.

## Biztonsag

A generator a live adatbazishoz csak read-only modban kapcsolodik:

- `default_transaction_read_only=on`;
- nincs INSERT;
- nincs UPDATE;
- nincs DELETE;
- nincs CREATE vagy ALTER.

A `DATABASE_URL` erteke nem kerul a dokumentumba. Csak az ENV valtozo neve es a PostgreSQL altal visszaadott adatbazisnev szerepel.

## Render Shell parancs

```bash
cd ~/project/src

bash scripts/run_aif_system_architecture.sh --publish
```

Az archiv fajlok ide kerulnek:

```text
artifacts/system-documentation/
```

A `--publish` opcio ezen felul egy veletlen, nehezen kitalalhato mappaba bemasolja a PDF-et a `dist/system-documentation/` ala, majd kiirja a letoltesi URL-t. A PDF letoltese utan futtasd a kiirt `rm -rf` parancsot, hogy a technikai dokumentacio ne maradjon publikus.

## Vegleges, teszteles utani generalas

A vegleges dokumentumot akkor futtasd, amikor:

1. az utolso kod deployja `Live`;
2. a kritikus UI es backend tesztek lefutottak;
3. a migraciok alkalmazva vannak;
4. nincs ismert konzol- vagy API-hiba;
5. a Render checkout commitja megegyezik az atadni kivant commit-tal.

A PDF neve idobelyeges, ezert a korabbi dokumentumot nem irja felul.

## Csak forraskod, adatbazis nelkul

```bash
cd ~/project/src

CACHE_DIR=/tmp/aif-system-docgen-node
export NODE_PATH="$CACHE_DIR/node_modules${NODE_PATH:+:$NODE_PATH}"
node jobs/aif_generate_system_architecture.cjs \
  --root "$PWD" \
  --out-dir artifacts/system-documentation \
  --no-db
```

## Fontos

A statikus elemzo szandekosan nem talal ki dinamikus kapcsolatokat. Amit nem tud fajl, route vagy live sema alapjan bizonyitani, azt figyelmezteteskent jeloli.
