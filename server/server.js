import express from "express";
import cors from "cors";
import "dotenv/config";
import firebase_admin from "firebase-admin";
import { readFileSync } from "fs";

// routes
import yearbooksRoutes from "./routes/public/yearbooks.js";
import labsRoutes from "./routes/public/labs.js";
import advisorRoutes from "./routes/public/advisor.js";
import askRoutes from "./routes/public/ask.js";

import coursesAdminRoutes from "./routes/admin/coursesAdmin.js";
import advisorsAdminRoutes from "./routes/admin/advisorsAdmin.js";
import labsAdminRoutes from "./routes/admin/labsAdmin.js";
import uploadAdminRoutes from "./routes/admin/uploadAdmin.js";
import adminSecurityRoutes from "./routes/admin/adminSecurity.js";
import adminAuthRoutes from "./routes/admin/auth.js";


const app = express();
app.use(cors());
app.use(express.json());
app.use("/files", express.static("files"));
app.use("/api", askRoutes);
// ======================
// Firebase init
// ======================
if (!firebase_admin.apps.length) {
  firebase_admin.initializeApp({
    credential: firebase_admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const db = firebase_admin.firestore();

// =====================
// Routes
// ======================
app.use("/api", yearbooksRoutes);
app.use("/api", labsRoutes);
app.use("/api", advisorRoutes);
app.use("/api", askRoutes);

app.use("/api/admin", coursesAdminRoutes);
app.use("/api/admin", advisorsAdminRoutes);
app.use("/api/admin", labsAdminRoutes);
app.use("/api/admin", uploadAdminRoutes);
app.use("/api/admin/security", adminSecurityRoutes);
app.use("/api/admin/auth", adminAuthRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});