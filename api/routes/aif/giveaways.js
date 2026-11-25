import express from "express";
import createGiveawayService, { GiveawayError } from "./giveawayService.js";

export default function createAifGiveawaysRouter({ pool, requireAdminOrSecret, actorFrom }) {
  if (typeof requireAdminOrSecret !== "function" || typeof actorFrom !== "function") {
    throw new Error("Giveaway routes require the existing admin authentication and actor resolver.");
  }
  const router = express.Router();
  const service = createGiveawayService({ pool });

  // This existing middleware verifies the session/secret before any read, schema access or mutation.
  router.use(requireAdminOrSecret);

  const endpoint = (work) => async (req, res) => {
    try {
      const result = await work(req);
      res.json(result);
    } catch (error) {
      if (error instanceof GiveawayError) {
        res.status(error.statusCode).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...error.details });
        return;
      }
      console.error("[AIF giveaways] Request failed", error?.stack || error);
      res.status(500).json({ error: "A nyereményjáték-művelet nem sikerült. Frissítsd az adatokat, és ellenőrizd a mentett állapotot.", code: "internal_error" });
    }
  };
  const actor = (req) => actorFrom(req);

  router.get("/meta", endpoint(() => service.meta()));
  router.get("/", endpoint(() => service.list()));
  router.post("/", endpoint((req) => service.create(req.body, actor(req))));
  router.get("/:id", endpoint((req) => service.detail(req.params.id)));
  router.patch("/:id", endpoint((req) => service.update(req.params.id, req.body, actor(req))));
  router.post("/:id/open", endpoint((req) => service.open(req.params.id, req.body, actor(req))));
  router.post("/:id/participants", endpoint((req) => service.importParticipants(req.params.id, req.body, actor(req))));
  router.patch("/:id/participants/:participantId", endpoint((req) => service.setEligibility(req.params.id, req.params.participantId, req.body, actor(req))));
  router.post("/:id/lock", endpoint((req) => service.lock(req.params.id, req.body, actor(req))));
  router.post("/:id/draw", endpoint((req) => service.draw(req.params.id, req.body, actor(req))));
  router.post("/:id/archive", endpoint((req) => service.archive(req.params.id, req.body, actor(req))));

  return router;
}
