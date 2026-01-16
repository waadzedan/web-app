import express from "express";
import { db } from "../../server.js";


const router = express.Router();
/**
 * GET /advisors
 * מחזיר את כל היועצים האקדמיים מה־DB
 */
router.get("/advisors", async (req, res) => {
  const snap = await db.collection("academicAdvisors").get();
  res.json({
    advisors: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});
/**
 * POST /advisors/:advisorId
 * יוצר או מעדכן יועץ אקדמי לפי ID
 */
router.post("/advisors/:advisorId",  async (req, res) => {
  await db
    .collection("academicAdvisors")
    .doc(req.params.advisorId)
    .set(req.body, { merge: true });

  res.json({ ok: true });
});
/**
 * DELETE /advisors/:advisorId
 * מוחק יועץ אקדמי לפי ID
 */
router.delete("/advisors/:advisorId", async (req, res) => {
  await db.collection("academicAdvisors").doc(req.params.advisorId).delete();
  res.json({ ok: true });
});

export default router;
