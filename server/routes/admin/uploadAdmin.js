import express from "express";
import multer from "multer";
import path from "path";
import { exec } from "child_process";


const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

router.post(
  "/upload/yearbook",
  upload.single("file"),
  (req, res) => {
    const { yearbookId, yearbookLabel } = req.body;
    const filePath = req.file?.path;

    exec(
      `py parsers/yearbook_parser.py "${filePath}" "${yearbookId}" "${yearbookLabel}"`,
      (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: stderr });
        res.json({ ok: true });
      }
    );
  }
);

router.post(
  "/upload/labs",
  upload.single("file"),
  (req, res) => {
    const { yearId, yearLabel, semester } = req.body;
    const filePath = req.file?.path;

    exec(
      `py parsers/labs_parser.py "${filePath}" "${yearId}" "${yearLabel}" "${semester}"`,
      (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: stderr });
        res.json({ ok: true });
      }
    );
  }
);

export default router;
