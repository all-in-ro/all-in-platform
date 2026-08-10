import express from "express";
import createAifAdminSaleLineDeleteRouter from "./adminSaleLineDelete.js";
import createAifAdminCustomersOverviewRouter from "./adminCustomersOverview.js";
import createAifAdminShopOverviewRouter from "./adminShopOverview.js";

/**
 * /admin-shops modul gyűjtő.
 * Új admin-shop funkciót már külön route fájlba tegyünk és itt mountoljuk.
 */
export default function createAifAdminShopsRouter(deps) {
  const router = express.Router();
  router.use(createAifAdminSaleLineDeleteRouter(deps));
  router.use(createAifAdminCustomersOverviewRouter(deps));
  router.use(createAifAdminShopOverviewRouter(deps));
  return router;
}
