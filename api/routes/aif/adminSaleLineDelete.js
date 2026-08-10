import express from "express";

// Admin eladási sor törlése. Ezt a fájlt módosítsuk, ha később a teszteladások
// teljes, biztonságos visszavonását bővítjük.
export default function createAifAdminSaleLineDeleteRouter(deps) {
  const {
    pool, requireAdminOrSecret, ensureAifShopSalesSchema, insertStockMovementSafe,
    actorFrom, text, normCode, aifNumber,
  } = deps;
  const router = express.Router();

  router.delete("/sale-lines/:lineId", requireAdminOrSecret, async (req, res) => {
    const lineId = text(req.params.lineId);
    const requestedMode = normCode(req.query.mode || req.body?.mode || "permanent");
    const mode = ["restore_stock", "restore", "restock", "stock_restore"].includes(requestedMode)
      ? "restore_stock"
      : ["permanent", "delete_only", "history_only", "no_stock_change"].includes(requestedMode)
        ? "permanent"
        : null;

    if (!lineId) return res.status(400).json({ error: "Hiányzik az eladási sor azonosítója." });
    if (!mode) {
      return res.status(400).json({
        error: "Érvénytelen törlési mód. Válaszd a készlet-visszaállítást vagy a végleges törlést.",
        code: "invalid_sale_line_delete_mode",
      });
    }

    const client = await pool.connect();
    try {
      await ensureAifShopSalesSchema();
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
        [lineId]
      );
      if (!lineResult.rowCount) {
        const error = new Error("Az eladási sor nem található, vagy már törölve lett.");
        error.statusCode = 404;
        throw error;
      }
      const line = lineResult.rows[0];

      const allocationResult = await client.query(
        `SELECT count(*)::int AS allocations
         FROM aif_shop_customer_payment_allocations
         WHERE sale_id=$1`,
        [line.sale_id]
      );
      if (Number(allocationResult.rows[0]?.allocations || 0) > 0) {
        const error = new Error("Ehhez a vásárláshoz már külön tartozásbefizetés kapcsolódik. A sort csak a kapcsolt befizetés rendezése után lehet törölni, különben a kliens pénzügyi előzménye sérülne.");
        error.statusCode = 409;
        error.code = "sale_line_has_customer_payment_allocations";
        throw error;
      }

      const linkedPaymentResult = await client.query(
        `SELECT count(*)::int AS linked_payments
         FROM aif_shop_sale_payments
         WHERE sale_id=$1 AND customer_payment_id IS NOT NULL`,
        [line.sale_id]
      );
      if (Number(linkedPaymentResult.rows[0]?.linked_payments || 0) > 0) {
        const error = new Error("Ehhez a vásárláshoz kliens-tartozásbefizetés kapcsolódik. A sort automatikusan nem törlöm, mert a befizetés összegét is módosítani kellene.");
        error.statusCode = 409;
        error.code = "sale_line_has_linked_customer_payment";
        throw error;
      }

      const actor = actorFrom(req);
      let restoredQty = 0;

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
          [line.location_id, line.variant_id]
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
          [line.location_id, line.variant_id, afterQty, reservedQty]
        );

        const movementLogged = await insertStockMovementSafe(client, {
          movementType: "return",
          sourceType: "manual_stock_edit",
          sourcePrefix: "sale_restore",
          fallbackSourceType: "manual_stock_edit",
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
          throw error;
        }
      }

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
        [line.sale_id]
      );
      const remaining = remainingResult.rows[0] || {};
      const remainingLineCount = Number(remaining.line_count || 0);
      const remainingItemCount = Number(remaining.item_count || 0);
      const remainingTotal = Math.max(0, aifNumber(remaining.total));
      let saleDeleted = false;

      if (remainingLineCount <= 0) {
        await client.query(`DELETE FROM aif_shop_sales WHERE id=$1`, [line.sale_id]);
        saleDeleted = true;
      } else {
        const paymentsResult = await client.query(
          `SELECT id, amount
           FROM aif_shop_sale_payments
           WHERE sale_id=$1 AND customer_payment_id IS NULL
           ORDER BY paid_at ASC, created_at ASC, id ASC
           FOR UPDATE`,
          [line.sale_id]
        );
        const paymentSum = paymentsResult.rows.reduce((sum, payment) => sum + Math.max(0, aifNumber(payment.amount)), 0);
        const desiredPaidTotal = Math.min(remainingTotal, paymentSum);
        let amountLeft = desiredPaidTotal;
        for (const payment of paymentsResult.rows) {
          const originalAmount = Math.max(0, aifNumber(payment.amount));
          const nextAmount = Math.min(originalAmount, amountLeft);
          amountLeft = Math.max(0, amountLeft - nextAmount);
          if (nextAmount > 0.005) {
            await client.query(`UPDATE aif_shop_sale_payments SET amount=$2 WHERE id=$1`, [payment.id, nextAmount]);
          } else {
            await client.query(`DELETE FROM aif_shop_sale_payments WHERE id=$1`, [payment.id]);
          }
        }

        const balanceDue = Math.max(0, remainingTotal - desiredPaidTotal);
        const paymentStatus = balanceDue <= 0.005
          ? "paid"
          : desiredPaidTotal > 0.005
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
            Math.max(0, aifNumber(remaining.subtotal)),
            Math.max(0, aifNumber(remaining.discount_total)),
            remainingTotal,
            desiredPaidTotal,
            balanceDue,
            paymentStatus,
          ]
        );

        await client.query(
          `INSERT INTO aif_shop_sale_events (sale_id, event_type, actor, note, payload)
           VALUES ($1,'line_deleted',$2,$3,$4::jsonb)`,
          [
            line.sale_id,
            actor,
            mode === "restore_stock" ? "Eladási sor törölve készlet-visszaállítással." : "Eladási sor végleg törölve készletmódosítás nélkül.",
            JSON.stringify({
              mode,
              lineId: String(line.id),
              saleNumber: line.sale_number,
              variantId: line.variant_id ? String(line.variant_id) : null,
              productTitle: line.product_title || null,
              productCode: line.product_code || null,
              barcode: line.barcode || null,
              quantity: Number(line.quantity || 0),
              lineTotal: aifNumber(line.line_total),
              restoredQty,
              locationId: String(line.location_id),
              locationCode: line.location_code,
              locationName: line.location_name,
            }),
          ]
        );
      }

      await client.query("COMMIT");
      res.json({
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
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF admin shop sale line delete failed", error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || "Az eladási sor törlése nem sikerült.",
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });



  return router;
}
