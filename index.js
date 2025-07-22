import express from "express";
import multer from "multer";
import cors from "cors";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import fs from "fs/promises";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Enable CORS for ALL origins
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// Simple test route
app.get("/", (req, res) => {
  res.send("✅ Gang Sheet backend is running with full CORS!");
});

// Main merge route
app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const qty = parseInt(quantity) || 1;
    const shouldRotate = rotate === "true";

    const gangWidth = 22 * 72;  // 22 inches
    const gangHeight = 36 * 72; // 36 inches

    const gangPdf = await PDFDocument.create();
    const gangPage = gangPdf.addPage([gangWidth, gangHeight]);

    const fileBuffer = req.file.buffer;
    const fileType = req.file.originalname.toLowerCase();

    let imagePdf;

    if (fileType.endsWith(".png")) {
      const pngBuffer = await sharp(fileBuffer).toFormat("png").toBuffer();
      imagePdf = await PDFDocument.create();
      const pngImage = await imagePdf.embedPng(pngBuffer);
      const pngDims = pngImage.scale(1);
      const page = imagePdf.addPage([pngDims.width, pngDims.height]);
      page.drawImage(pngImage, { x: 0, y: 0, width: pngDims.width, height: pngDims.height });
    } else if (fileType.endsWith(".pdf")) {
      imagePdf = await PDFDocument.load(fileBuffer);
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const embeddedPages = await gangPdf.embedPdf(await imagePdf.save());
    const embeddedPage = embeddedPages[0];
    const { width, height } = embeddedPage;

    const finalWidth = shouldRotate ? height : width;
    const finalHeight = shouldRotate ? width : height;

    const cols = Math.floor(gangWidth / finalWidth);
    const rows = Math.ceil(qty / cols);

    let placed = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (placed >= qty) break;
        let x = c * finalWidth;
        let y = gangHeight - (r + 1) * finalHeight;
        gangPage.drawPage(embeddedPage, {
          x,
          y,
          rotate: shouldRotate ? { type: "degrees", angle: 90 } : undefined,
        });
        placed++;
      }
    }

    const pdfBytes = await gangPdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=gangsheet.pdf");
    res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error merging file" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
