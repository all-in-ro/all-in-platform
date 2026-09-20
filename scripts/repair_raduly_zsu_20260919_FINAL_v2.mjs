import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = String(process.env.APPLY || "").trim() === "1";

const SALE_OLD = "EL/CIUC/2026/000192";
const SALE_NEW = "EL/CIUC/2026/000208";
const EXPECTED_PAYMENT_TOTAL = 772.20;
const EXPECTED_OLD_ALLOC = 152.55;
const EXPECTED_NEW_ALLOC = 619.65;
const EPS = 0.01;

const money = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
const assertNear = (actual, expected, label) => {
  if (Math.abs(money(actual) - money(expected)) > EPS) {
    throw new Error(`${label}: várt ${expected.toFixed(2)}, kapott ${money(actual).toFixed(2)}`);
  }
};

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const salesRes = await client.query(
    `SELECT id, sale_number, customer_id, total, paid_total, balance_due, payment_status, status
     FROM aif_shop_sales
     WHERE sale_number = ANY($1::text[])
     ORDER BY sale_number
     FOR UPDATE`,
    [[SALE_OLD, SALE_NEW]],
  );

  if (salesRes.rowCount !== 2) throw new Error("A két érintett eladás közül valamelyik nem található.");
  const saleByNumber = new Map(salesRes.rows.map((r) => [r.sale_number, r]));
  const oldSale = saleByNumber.get(SALE_OLD);
  const newSale = saleByNumber.get(SALE_NEW);
  if (!oldSale || !newSale) throw new Error("Az érintett eladások azonosítása nem sikerült.");
  if (String(oldSale.customer_id || "") !== String(newSale.customer_id || "")) {
    throw new Error("A két eladás nem ugyanahhoz a klienshez tartozik. Leálltam.");
  }
  if (oldSale.status !== "completed" || newSale.status !== "completed") {
    throw new Error("Az egyik eladás nem completed állapotú. Leálltam.");
  }

  // A hibás állapotot csak akkor javítjuk, ha még pontosan azt látjuk, amit kimértünk.
  assertNear(oldSale.total, 352.05, `${SALE_OLD} total`);
  assertNear(newSale.total, 619.65, `${SALE_NEW} total`);
  assertNear(newSale.balance_due, 199.50, `${SALE_NEW} hibás balance_due`);

  // PostgreSQL nem engedi a FOR UPDATE használatát GROUP BY-os lekérdezésen.
  // Ezért előbb csak azonosítjuk a közös kliensbefizetést az allokációkból,
  // majd a konkrét payment sort külön SELECT ... FOR UPDATE lekérdezéssel zároljuk.
  const paymentCandidateRes = await client.query(
    `SELECT
       a.customer_payment_id,
       COALESCE(sum(a.amount),0)::numeric AS allocated_total,
       count(a.id)::int AS allocation_count,
       count(DISTINCT a.sale_id)::int AS distinct_sale_count
     FROM aif_shop_customer_payment_allocations a
     WHERE a.sale_id = ANY($1::uuid[])
     GROUP BY a.customer_payment_id
     HAVING count(DISTINCT a.sale_id)=2
     ORDER BY max(a.created_at) DESC`,
    [[oldSale.id, newSale.id]],
  );

  if (paymentCandidateRes.rowCount !== 1) {
    throw new Error(`Nem egyetlen közös kliensbefizetést találtam a két eladáshoz, hanem ${paymentCandidateRes.rowCount}-t. Leálltam.`);
  }

  const paymentCandidate = paymentCandidateRes.rows[0];
  const paymentRes = await client.query(
    `SELECT id, customer_id, location_id, amount, method, paid_at
     FROM aif_shop_customer_payments
     WHERE id=$1
     FOR UPDATE`,
    [paymentCandidate.customer_payment_id],
  );

  if (paymentRes.rowCount !== 1) {
    throw new Error("A közös kliensbefizetés fejlécsora nem található. Leálltam.");
  }

  const payment = {
    ...paymentRes.rows[0],
    allocated_total: paymentCandidate.allocated_total,
    allocation_count: paymentCandidate.allocation_count,
  };
  if (String(payment.customer_id || "") !== String(oldSale.customer_id || "")) {
    throw new Error("A kliensbefizetés más klienshez tartozik. Leálltam.");
  }
  assertNear(payment.amount, EXPECTED_PAYMENT_TOTAL, "Kliensbefizetés összege");
  assertNear(payment.allocated_total, EXPECTED_PAYMENT_TOTAL, "Jelenlegi allokáció összege");

  const allocationsRes = await client.query(
    `SELECT a.id, a.customer_payment_id, a.sale_id, a.amount, a.balance_before, a.balance_after,
            s.sale_number
     FROM aif_shop_customer_payment_allocations a
     JOIN aif_shop_sales s ON s.id=a.sale_id
     WHERE a.customer_payment_id=$1
       AND a.sale_id = ANY($2::uuid[])
     ORDER BY s.sale_number
     FOR UPDATE OF a`,
    [payment.id, [oldSale.id, newSale.id]],
  );
  if (allocationsRes.rowCount !== 2) throw new Error("Nem pontosan két érintett allokációt találtam. Leálltam.");

  const linkedPaymentsRes = await client.query(
    `SELECT sp.id, sp.sale_id, sp.customer_payment_id, sp.amount, sp.method, s.sale_number
     FROM aif_shop_sale_payments sp
     JOIN aif_shop_sales s ON s.id=sp.sale_id
     WHERE sp.customer_payment_id=$1
       AND sp.sale_id = ANY($2::uuid[])
     ORDER BY s.sale_number, sp.created_at, sp.id
     FOR UPDATE OF sp`,
    [payment.id, [oldSale.id, newSale.id]],
  );
  if (linkedPaymentsRes.rowCount !== 2) {
    throw new Error(`Nem pontosan két linked sale-payment sort találtam, hanem ${linkedPaymentsRes.rowCount}-t. Leálltam.`);
  }

  console.log("\n========== JELENLEGI ÁLLAPOT ==========");
  console.table(salesRes.rows.map((r) => ({
    sale: r.sale_number,
    total: money(r.total).toFixed(2),
    paid: money(r.paid_total).toFixed(2),
    due: money(r.balance_due).toFixed(2),
    payment_status: r.payment_status,
  })));
  console.table(allocationsRes.rows.map((r) => ({
    sale: r.sale_number,
    allocation: money(r.amount).toFixed(2),
    balance_before: money(r.balance_before).toFixed(2),
    balance_after: money(r.balance_after).toFixed(2),
  })));
  console.table(linkedPaymentsRes.rows.map((r) => ({
    sale: r.sale_number,
    linked_payment: money(r.amount).toFixed(2),
    method: r.method,
  })));

  console.log("\n========== HELYES ÁLLAPOT ==========");
  console.table([
    { sale: SALE_OLD, allocation: EXPECTED_OLD_ALLOC.toFixed(2), balance_due: "0.00" },
    { sale: SALE_NEW, allocation: EXPECTED_NEW_ALLOC.toFixed(2), balance_due: "0.00" },
  ]);
  console.log(`Összes befizetés marad: ${EXPECTED_PAYMENT_TOTAL.toFixed(2)} RON`);
  console.log("Készlethez és visszáruhoz ez a script NEM nyúl.\n");

  if (!APPLY) {
    await client.query("ROLLBACK");
    console.log("DRY RUN kész. SEMMI NEM VÁLTOZOTT.");
    console.log("Ha minden fenti adat helyes: APPLY=1 node scripts/repair_raduly_zsu_20260919_FINAL.mjs");
    process.exitCode = 0;
  } else {
    const targets = new Map([
      [String(oldSale.id), EXPECTED_OLD_ALLOC],
      [String(newSale.id), EXPECTED_NEW_ALLOC],
    ]);

    for (const row of allocationsRes.rows) {
      const target = targets.get(String(row.sale_id));
      if (target === undefined) throw new Error("Ismeretlen allokációs sale_id. Leálltam.");
      await client.query(
        `UPDATE aif_shop_customer_payment_allocations
         SET amount=$2,
             balance_before=$2,
             balance_after=0
         WHERE id=$1`,
        [row.id, target],
      );
    }

    for (const row of linkedPaymentsRes.rows) {
      const target = targets.get(String(row.sale_id));
      if (target === undefined) throw new Error("Ismeretlen linked payment sale_id. Leálltam.");
      await client.query(
        `UPDATE aif_shop_sale_payments
         SET amount=$2,
             raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
               'adminRepairAt', now()::text,
               'adminRepairReason', 'late_discount_after_return_allocation_fix',
               'adminRepairOriginalAmount', amount
             )
         WHERE id=$1`,
        [row.id, target],
      );
    }

    await client.query(
      `UPDATE aif_shop_sales
       SET paid_total=$2,
           balance_due=0,
           payment_status='paid',
           updated_at=now()
       WHERE id=$1`,
      [oldSale.id, EXPECTED_OLD_ALLOC],
    );
    await client.query(
      `UPDATE aif_shop_sales
       SET paid_total=$2,
           balance_due=0,
           payment_status='paid',
           updated_at=now()
       WHERE id=$1`,
      [newSale.id, EXPECTED_NEW_ALLOC],
    );

    await client.query(
      `UPDATE aif_shop_customer_payments
       SET raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
             'adminRepairAt', now()::text,
             'adminRepairReason', 'late_discount_after_return_allocation_fix',
             'adminRepairSales', $2::jsonb
           )
       WHERE id=$1`,
      [payment.id, JSON.stringify([
        { saleNumber: SALE_OLD, amount: EXPECTED_OLD_ALLOC },
        { saleNumber: SALE_NEW, amount: EXPECTED_NEW_ALLOC },
      ])],
    );

    for (const [sale, amount] of [[oldSale, EXPECTED_OLD_ALLOC], [newSale, EXPECTED_NEW_ALLOC]]) {
      await client.query(
        `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
         VALUES ($1,'admin_financial_repair','ADMIN',$2,$3::jsonb)`,
        [
          sale.id,
          "Hibás késői kedvezmény utáni kliensbefizetés-allokáció javítva. Készlet és visszáru nem módosult.",
          JSON.stringify({
            reason: "late_discount_after_return_allocation_fix",
            customerPaymentId: String(payment.id),
            saleNumber: sale.sale_number,
            repairedAllocation: amount,
          }),
        ],
      );
    }

    const verifySales = await client.query(
      `SELECT sale_number, total, paid_total, balance_due, payment_status
       FROM aif_shop_sales
       WHERE id = ANY($1::uuid[])
       ORDER BY sale_number`,
      [[oldSale.id, newSale.id]],
    );
    const verifyAlloc = await client.query(
      `SELECT s.sale_number, a.amount, a.balance_before, a.balance_after
       FROM aif_shop_customer_payment_allocations a
       JOIN aif_shop_sales s ON s.id=a.sale_id
       WHERE a.customer_payment_id=$1
         AND a.sale_id = ANY($2::uuid[])
       ORDER BY s.sale_number`,
      [payment.id, [oldSale.id, newSale.id]],
    );

    const vOld = verifySales.rows.find((r) => r.sale_number === SALE_OLD);
    const vNew = verifySales.rows.find((r) => r.sale_number === SALE_NEW);
    assertNear(vOld?.paid_total, EXPECTED_OLD_ALLOC, `${SALE_OLD} paid_total ellenőrzés`);
    assertNear(vOld?.balance_due, 0, `${SALE_OLD} balance_due ellenőrzés`);
    assertNear(vNew?.paid_total, EXPECTED_NEW_ALLOC, `${SALE_NEW} paid_total ellenőrzés`);
    assertNear(vNew?.balance_due, 0, `${SALE_NEW} balance_due ellenőrzés`);
    assertNear(verifyAlloc.rows.reduce((s, r) => s + money(r.amount), 0), EXPECTED_PAYMENT_TOTAL, "Allokációk végösszege ellenőrzés");

    await client.query("COMMIT");

    console.log("\n========== JAVÍTÁS KÉSZ ==========");
    console.table(verifySales.rows);
    console.table(verifyAlloc.rows);
    console.log("ZSU hamis 199.50 RON tartozása megszűnt.");
    console.log("Készletet és visszáru rekordot nem módosítottam.");
  }
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("\nJAVÍTÁS LEÁLLT, ROLLBACK TÖRTÉNT:");
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
