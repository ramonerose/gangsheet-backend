import express from "express";
import multer from "multer";
import cors from "cors";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer temp uploads
const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("✅ Simplified Gang Sheet backend is running!");
});

// 🔹 Simplified merge: only places ONE design at original size
app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    console.log(`📂 Received file: ${req.file.originalname} (${ext})`);

    let finalPdf;

    if (ext === ".png") {
      // ✅ Handle PNG: preserve original size
      const metadata = await sharp(filePath).metadata();
      console.log(`✅ PNG metadata: ${metadata.width}x${metadata.height}`);

      const imgBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.create();
      const embeddedImage = await pdfDoc.embedPng(imgBuffer);

      const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height,
      });

      finalPdf = await pdfDoc.save();
    } else if (ext === ".pdf") {
      // ✅ Handle PDF: just return first page
      const existingPdf = await PDFDocument.load(fs.readFileSync(filePath));
      const pdfDoc = await PDFDocument.create();
      const [page] = await pdfDoc.copyPages(existingPdf, [0]);
      pdfDoc.addPage(page);
      finalPdf = await pdfDoc.save();
      console.log("✅ Extracted first PDF page successfully");
    } else {
      return res.status(400).send("❌ Unsupported file type. Only PNG or PDF allowed.");
    }

    fs.unlinkSync(filePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=single_gangsheet.pdf");
    res.send(Buffer.from(finalPdf));

    console.log("✅ Successfully returned single-page PDF");

  } catch (err) {
    console.error("❌ Simplified backend error:", err);
    res.status(500).send("Server failed to process file");
  }
});

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "✅ backend alive" });
});

app.listen(PORT, () => {
  console.log(`✅ Simplified backend running on port ${PORT}`);
});
