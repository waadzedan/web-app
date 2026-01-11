import express from "express";
import { db } from "../../server.js";


const router = express.Router();

// Admin – list yearbooks
router.get("/yearbooks", async (req, res) => {
  try {
    const snap = await db.collection("yearbooks").get();
    const yearbooks = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    res.json({ yearbooks });
  } catch (err) {
    res.status(500).json({ error: "failed" });
  }
});

export default router;
