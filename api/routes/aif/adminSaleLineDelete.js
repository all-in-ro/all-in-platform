import express from "express";

const EPS = 0.005;

function text(value) {
  return String(value ?? "").trim();
}

function normCode(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function moneyNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((moneyNumber(value) + Number.EPSILON) * 100) / 100;
}

function actorFrom(req) {
  return text(req?.session?.actor || req?.session?.shopId || req?.session?.role || "system") || "system";
}

function shortMovementSourceId(prefix = "sale_restore") {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix.slice(0, 18)}:${timePart}:${randomPart}`;
}

async function insertSaleRestoreMovement(client, {
  locationId,
  variantId,
  qtyDelta,
  qtyBefore,
  qtyAfter,
  actor,
  raw,
}) {
  const insert = async (movementType) => {
    await client.query(
      `INSERT INTO aif_stock_movements (
         movement_type, source_type, source_id, location_id, variant_id,
         qty_delta, qty_before, qty_after, actor, raw
       )
       VALUES ($1,'manual_stock_edit',$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        movementType,
        shortMovementSourceId("sale_restore"),
        locationId,
        variantId,
        qtyDelta,
        qtyBefore,
        qtyAfter,
        actor,
        JSON.stringify(raw || {}),
      ],
    );
  };

  await client.query("SAVEPOINT aif_admin_sale_restore_movement");
  try {
    await insert("return");
    await client.query("RELEASE SAVEPOINT aif_admin_sale_restore_movement");
    return true;
  } catch (firstError) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT aif_admin_sale_restore_movement");
      await client.query("RELEASE SAVEPOINT aif_admin_sale_restore_movement");
    } catch {}

    await client.query("SAVEPOINT aif_admin_sale_restore_movement_fallback");
    try {
      await insert("manual_adjustment");
      await client.query("RELEASE SAVEPOINT aif_admin_sale_restore_movement_fallback");
      return true;
    } catch (fallbackError) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT aif_admin_sale_restore_movement_fallback");
        await client.query("RELEASE SAVEPOINT aif_admin_sale_restore_movement_fallback");
      } catch {}
      console.error("AIF admin sale restore movement log failed", {
        firstError: firstError?.message || firstError,
        fallbackError: fallbackError?.message || fallbackError,
      });
      return false;
    }
  }
}

async function resizePaymentRows(client, {
  saleId,
  customerPaymentId = null,
  targetAmount,
}) {
  const args = [saleId];
  let customerFilter = "customer_payment_id IS NULL";
  if (customerPaymentId) {
    args.push(customerPaymentId);
    customerFilter = `customer_payment_id=$${args.length}`;
  }

  const result = await client.query(
    `SELECT id, amount
     FROM aif_shop_sale_payments
     WHERE sale_id=$1
       AND ${customerFilter}
     ORDER BY paid_at ASC, created_at ASC, id ASC
     FOR UPDATE`,
    args,
  );

  let left = Math.max(0, roundMoney(targetAmount));
  let kept = 0;

  for (const row of result.rows) {
    const original = Math.max(0, roundMoney(row.amount));
    const next = Math.min(original, left);
    left = Math.max(0, roundMoney(left - next));

    if (next > EPS) {
      if (Math.abs(next - original) > EPS) {
        await client.query(
          `UPDATE aif_shop_sale_payments
           SET amount=$2,
               raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
                 'adminRollbackAdjustedAt', now()::text,
                 'adminRollbackReason', 'sale_line_delete'
               )
           WHERE id=$1`,
          [row.id, next],
        );
      }
      kept = roundMoney(kept + next);
    } else {
      await client.query(`DELETE FROM aif_shop_sale_payments WHERE id=$1`, [row.id]);
    }
  }

  return kept;
}

async function reconcileCustomerPaymentHeader(client, paymentId, {
  saleId,
  saleNumber,
  actor,
}) {
  const allocationState = await client.query(
    `SELECT
       count(*)::int AS allocation_count,
       COALESCE(sum(amount),0)::numeric AS allocation_sum
     FROM aif_shop_customer_payment_allocations
     WHERE customer_payment_id=$1`,
    [paymentId],
  );

  const linkedState = await client.query(
    `SELECT
       count(*)::int AS linked_count,
       COALESCE(sum(amount),0)::numeric AS linked_sum
     FROM aif_shop_sale_payments
     WHERE customer_payment_id=$1`,
    [paymentId],
  );

  const allocationCount = Number(allocationState.rows[0]?.allocation_count || 0);
  const allocationSum = Math.max(0, roundMoney(allocationState.rows[0]?.allocation_sum));
  const linkedCount = Number(linkedState.rows[0]?.linked_count || 0);
  const linkedSum = Math.max(0, roundMoney(linkedState.rows[0]?.linked_sum));

  if (allocationCount <= 0 && linkedCount <= 0) {
    const deleted = await client.query(
      `DELETE FROM aif_shop_customer_payments
       WHERE id=$1
       RETURNING id, customer_id`,
      [paymentId],
    );
    return {
      deleted: deleted.rowCount > 0,
      adjusted: false,
      amount: 0,
      customerId: deleted.rows[0]?.customer_id || null,
    };
  }

  // Normál esetben az allocation és a linked sale-payment összege ugyanaz.
  // Ha egy régi adatnál eltér, az allocation az elsődleges pénzügyi kapcsolat.
  const nextAmount = allocationCount > 0 ? allocationSum : linkedSum;
  const updated = await client.query(
    `UPDATE aif_shop_customer_payments
     SET amount=$2,
         raw=COALESCE(raw,'{}'::jsonb) || jsonb_build_object(
           'adminRollbackAdjustedAt', now()::text,
           'adminRollbackBy', $3::text,
           'adminRollbackSaleId', $4::text,
           'adminRollbackSaleNumber', $5::text,
           'adminRollbackReason', 'sale_line_delete'
         )
     WHERE id=$1
     RETURNING id, customer_id, amount`,
    [paymentId, nextAmount, actor, String(saleId), saleNumber],
  );

  return {
    deleted: false,
    adjusted: updated.rowCount > 0,
    amount: nextAmount,
    customerId: updated.rows[0]?.customer_id || null,
  };
}

async function reconcileCustomerAllocationsForSale(client, {
  saleId,
  saleNumber,
  remainingTotal,
  directPaid,
  actor,
}) {
  const allocations = await client.query(
    `SELECT
       a.id,
       a.customer_payment_id,
       a.amount,
       a.created_at,
       p.customer_id
     FROM aif_shop_customer_payment_allocations a
     JOIN aif_shop_customer_payments p ON p.id=a.customer_payment_id
     WHERE a.sale_id=$1
     ORDER BY a.created_at ASC, a.id ASC
     FOR UPDATE OF a, p`,
    [saleId],
  );

  let capacity = Math.max(0, roundMoney(remainingTotal - directPaid));
  let keptAllocated = 0;
  let removedAllocated = 0;
  let allocationsChanged = 0;
  const affectedPayments = new Set();

  // A törölt sor miatt csökkenő bizonylatértékre visszavágjuk a későbbi
  // tartozásbefizetéseket. Így a kliens pénzügyi előzménye nem marad nagyobb,
  // mint a ténylegesen megmaradt eladás.
  for (const allocation of allocations.rows) {
    const original = Math.max(0, roundMoney(allocation.amount));
    const keep = Math.min(original, capacity);
    const remove = Math.max(0, roundMoney(original - keep));
    capacity = Math.max(0, roundMoney(capacity - keep));
    affectedPayments.add(String(allocation.customer_payment_id));

    if (keep > EPS) {
      const balanceBefore = Math.max(0, roundMoney(remainingTotal - directPaid - keptAllocated));
      const balanceAfter = Math.max(0, roundMoney(balanceBefore - keep));

      if (remove > EPS) {
        allocationsChanged += 1;
        await client.query(
          `UPDATE aif_shop_customer_payment_allocations
           SET amount=$2,
               balance_before=$3,
               balance_after=$4
           WHERE id=$1`,
          [allocation.id, keep, balanceBefore, balanceAfter],
        );
      } else {
        await client.query(
          `UPDATE aif_shop_customer_payment_allocations
           SET balance_before=$2,
               balance_after=$3
           WHERE id=$1`,
          [allocation.id, balanceBefore, balanceAfter],
        );
      }

      await resizePaymentRows(client, {
        saleId,
        customerPaymentId: allocation.customer_payment_id,
        targetAmount: keep,
      });
      keptAllocated = roundMoney(keptAllocated + keep);
    } else {
      allocationsChanged += 1;
      await client.query(`DELETE FROM aif_shop_customer_payment_allocations WHERE id=$1`, [allocation.id]);
      await resizePaymentRows(client, {
        saleId,
        customerPaymentId: allocation.customer_payment_id,
        targetAmount: 0,
      });
    }

    removedAllocated = roundMoney(removedAllocated + remove);
  }

  let customerPaymentsDeleted = 0;
  let customerPaymentsAdjusted = 0;
  const touchedCustomerIds = new Set();

  for (const paymentId of affectedPayments) {
    const result = await reconcileCustomerPaymentHeader(client, paymentId, {
      saleId,
      saleNumber,
      actor,
    });
    if (result.deleted) customerPaymentsDeleted += 1;
    if (result.adjusted) customerPaymentsAdjusted += 1;
    if (result.customerId) touchedCustomerIds.add(String(result.customerId));
  }

  for (const customerId of touchedCustomerIds) {
    await client.query(
      `UPDATE aif_shop_customers
       SET updated_by=$2, updated_at=now()
       WHERE id=$1`,
      [customerId, actor],
    );
  }

  return {
    keptAllocated,
    removedAllocated,
    allocationsChanged,
    customerPaymentsDeleted,
    customerPaymentsAdjusted,
  };
}

function buildRouteHandler({ pool }) {
  if (!pool) throw new Error("adminSaleLineDelete: pool is required");

  return async function deleteAdminShopSaleLine(req, res) {
    const lineId = text(req.params.lineId);
    const requestedMode = normCode(req.query.mode || req.body?.mode || "permanent");
    const mode = ["restore_stock", "restore", "restock", "stock_restore"].includes(requestedMode)
      ? "restore_stock"
      : ["permanent", "delete_only", "history_only", "no_stock_change"].includes(requestedMode)
        ? "permanent"
        : null;

    if (!lineId) {
      return res.status(400).json({
        error: "Hiányzik az eladási sor azonosítója.",
        code: "sale_line_id_required",
      });
    }
    if (!mode) {
      return res.status(400).json({
        error: "Érvénytelen törlési mód. Válaszd a készlet-visszaállítást vagy a végleges törlést.",
        code: "invalid_sale_line_delete_mode",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lineResult = await client.query(
        `SELECT
           sl.*,
           s.sale_number, s.location_id, s.customer_id, s.status AS sale_status,
           s.sale_type, s.payment_status, s.subtotal AS sale_subtotal,
           s.discount_total AS sale_discount_total, s.total AS sale_total,
           s.paid_total AS sale_paid_total, s.balance_due AS sale_balance_due,
           l.code AS location_code, l.name AS location_name
         FROM aif_shop_sale_lines sl
         JOIN aif_shop_sales s ON s.id=sl.sale_id
         JOIN aif_locations l ON l.id=s.location_id
         WHERE sl.id::text=$1
         FOR UPDATE OF sl, s`,
        [lineId],
      );

      if (!lineResult.rowCount) {
        const error = new Error("Az eladási sor nem található, vagy már törölve lett.");
        error.statusCode = 404;
        error.code = "sale_line_not_found";
        throw error;
      }

      const line = lineResult.rows[0];
      const actor = actorFrom(req);
      let restoredQty = 0;

      // Készlet-visszaállítás továbbra is csak lezárt, valódi variánshoz kötött eladásnál.
      if (mode === "restore_stock") {
        if (line.sale_status !== "completed") {
          const error = new Error("Készlet-visszaállítás csak lezárt eladásnál végezhető. Ennél a sornál használd a végleges törlést, vagy ellenőrizd előbb az állapotát.");
          error.statusCode = 409;
          error.code = "sale_line_restore_requires_completed_sale";
          throw error;
        }
        if (!line.variant_id) {
          const error = new Error("Ehhez a régi eladási sorhoz nincs termékváltozat kapcsolva, ezért a készlet nem állítható vissza biztonságosan. A sor csak készletmódosítás nélküli végleges törléssel távolítható el.");
          error.statusCode = 409;
          error.code = "sale_line_variant_missing";
          throw error;
        }

        const stockResult = await client.query(
          `SELECT qty, reserved_qty
           FROM aif_stock
           WHERE location_id=$1 AND variant_id=$2
           FOR UPDATE`,
          [line.location_id, line.variant_id],
        );

        const beforeQty = stockResult.rowCount ? Number(stockResult.rows[0].qty || 0) : 0;
        const reservedQty = stockResult.rowCount ? Number(stockResult.rows[0].reserved_qty || 0) : 0;
        restoredQty = Math.max(0, Number(line.quantity || 0));
        const afterQty = beforeQty + restoredQty;

        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, updated_at=now()`,
          [line.location_id, line.variant_id, afterQty, reservedQty],
        );

        const movementLogged = await insertSaleRestoreMovement(client, {
          locationId: line.location_id,
          variantId: line.variant_id,
          qtyDelta: restoredQty,
          qtyBefore: beforeQty,
          qtyAfter: afterQty,
          actor,
          raw: {
            reason: "admin_shop_sale_line_delete_restore",
            saleId: String(line.sale_id),
            saleLineId: String(line.id),
            saleNumber: line.sale_number,
            productTitle: line.product_title || null,
            productCode: line.product_code || null,
            barcode: line.barcode || null,
            quantity: restoredQty,
            locationCode: line.location_code,
            locationName: line.location_name,
          },
        });

        if (!movementLogged) {
          const error = new Error("A készlet visszaállt volna, de a készletmozgás naplózása nem sikerült, ezért a teljes műveletet visszavontam.");
          error.statusCode = 500;
          error.code = "sale_line_restore_movement_failed";
          throw error;
        }
      }

      // A sor törölhető akkor is, ha a teszteladásra már tartozásbefizetés került.
      // Az egész pénzügyi kapcsolatot ugyanebben a DB tranzakcióban visszabontjuk.
      await client.query(`DELETE FROM aif_shop_sale_lines WHERE id=$1`, [line.id]);

      const remainingResult = await client.query(
        `SELECT
           count(*)::int AS line_count,
           COALESCE(sum(quantity),0)::int AS item_count,
           COALESCE(sum(list_price * quantity),0)::numeric AS subtotal,
           COALESCE(sum(discount_amount),0)::numeric AS discount_total,
           COALESCE(sum(line_total),0)::numeric AS total
         FROM aif_shop_sale_lines
         WHERE sale_id=$1`,
        [line.sale_id],
      );

      const remaining = remainingResult.rows[0] || {};
      const remainingLineCount = Number(remaining.line_count || 0);
      const remainingItemCount = Number(remaining.item_count || 0);
      const remainingTotal = Math.max(0, roundMoney(remaining.total));

      // Először a normál, közvetlen fizetéseket igazítjuk a megmaradt értékhez.
      const directPaymentRows = await client.query(
        `SELECT COALESCE(sum(amount),0)::numeric AS total
         FROM aif_shop_sale_payments
         WHERE sale_id=$1 AND customer_payment_id IS NULL`,
        [line.sale_id],
      );
      const directPaymentOriginal = Math.max(0, roundMoney(directPaymentRows.rows[0]?.total));
      const directPaymentTarget = Math.min(remainingTotal, directPaymentOriginal);
      const directPaid = await resizePaymentRows(client, {
        saleId: line.sale_id,
        targetAmount: directPaymentTarget,
      });

      // Majd a kliens-tartozásbefizetés allocation + linked payment + payment header
      // hármast is visszabontjuk / arányosan visszavágjuk.
      const financialRollback = await reconcileCustomerAllocationsForSale(client, {
        saleId: line.sale_id,
        saleNumber: line.sale_number,
        remainingTotal,
        directPaid,
        actor,
      });

      const totalPaid = Math.min(
        remainingTotal,
        roundMoney(directPaid + financialRollback.keptAllocated),
      );
      const balanceDue = Math.max(0, roundMoney(remainingTotal - totalPaid));
      let saleDeleted = false;

      if (remainingLineCount <= 0) {
        await client.query(`DELETE FROM aif_shop_sales WHERE id=$1`, [line.sale_id]);
        saleDeleted = true;
      } else {
        const paymentStatus = balanceDue <= EPS
          ? "paid"
          : totalPaid > EPS
            ? "partial"
            : line.sale_type === "credit"
              ? "credit"
              : "unpaid";

        await client.query(
          `UPDATE aif_shop_sales
           SET subtotal=$2,
               discount_total=$3,
               total=$4,
               paid_total=$5,
               balance_due=$6,
               payment_status=$7,
               updated_at=now()
           WHERE id=$1`,
          [
            line.sale_id,
            Math.max(0, roundMoney(remaining.subtotal)),
            Math.max(0, roundMoney(remaining.discount_total)),
            remainingTotal,
            totalPaid,
            balanceDue,
            paymentStatus,
          ],
        );

        await client.query(
          `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
           VALUES ($1,'line_deleted',$2,$3,$4::jsonb)`,
          [
            line.sale_id,
            actor,
            mode === "restore_stock"
              ? "Eladási sor törölve készlet-visszaállítással és pénzügyi visszabontással."
              : "Eladási sor végleg törölve készletmódosítás nélkül, pénzügyi visszabontással.",
            JSON.stringify({
              mode,
              lineId: String(line.id),
              saleNumber: line.sale_number,
              variantId: line.variant_id ? String(line.variant_id) : null,
              productTitle: line.product_title || null,
              productCode: line.product_code || null,
              barcode: line.barcode || null,
              quantity: Number(line.quantity || 0),
              lineTotal: roundMoney(line.line_total),
              restoredQty,
              locationId: String(line.location_id),
              locationCode: line.location_code,
              locationName: line.location_name,
              financialRollback,
            }),
          ],
        );
      }

      if (line.customer_id) {
        await client.query(
          `UPDATE aif_shop_customers
           SET updated_by=$2, updated_at=now()
           WHERE id=$1`,
          [line.customer_id, actor],
        );
      }

      await client.query("COMMIT");

      return res.json({
        ok: true,
        mode,
        lineId: String(line.id),
        saleId: String(line.sale_id),
        saleNumber: line.sale_number,
        saleDeleted,
        stockRestored: mode === "restore_stock",
        restoredQty,
        remainingLineCount,
        remainingItemCount,
        remainingTotal,
        financialRollback: {
          ...financialRollback,
          directPaymentBefore: directPaymentOriginal,
          directPaymentAfter: directPaid,
          totalPaidAfter: totalPaid,
          balanceDueAfter: balanceDue,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("AIF admin shop sale line delete failed", error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "Az eladási sor törlése nem sikerült.",
        code: error?.code || "admin_sale_line_delete_failed",
      });
    } finally {
      client.release();
    }
  };
}

export function registerAdminSaleLineDeleteRoutes(router, deps = {}) {
  if (!router) throw new Error("adminSaleLineDelete: router is required");
  const requireAdminOrSecret = deps.requireAdminOrSecret || ((_req, _res, next) => next());
  router.delete(
    "/sale-lines/:lineId",
    requireAdminOrSecret,
    buildRouteHandler(deps),
  );
  return router;
}

export function createAdminSaleLineDeleteRouter(deps = {}) {
  const router = express.Router();
  return registerAdminSaleLineDeleteRoutes(router, deps);
}

export default createAdminSaleLineDeleteRouter;
