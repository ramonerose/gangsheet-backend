import express from "express";
import multer from "multer";
import cors from "cors";   // ✅ Import CORS
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import fs from "fs";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: "*" })); // ✅ Allow requests from any domain

// Default route
app.get("/", (req, res) => {
  res.send("✅ Gang Sheet backend is running!");
});

app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const count = parseInt(quantity) || 1;
    const rotate90 = rotate === "true";

    // Create a blank 22x36 inch sheet (1584x2592 points)
    const sheetWidthInches = 22;
    const sheetHeightInches = 36;
    const pointsPerInch = 72;
    const sheetWidth = sheetWidthInches * pointsPerInch;
    const sheetHeight = sheetHeightInches * pointsPerInch;

    const sheetDoc = await PDFDocument.create();
    const blankPage = sheetDoc.addPage([sheetWidth, sheetHeight]);

    const fileBuffer = req.file.buffer;
    const fileType = req.file.originalname.toLowerCase().endsWith(".png")
      ? "png"
      : "pdf";

    let embedWidth, embedHeight, embedPdf;

    if (fileType === "png") {
      let imgBuffer = fileBuffer;

      // ✅ Auto-rotate PNG if needed
      if (rotate90) {
        imgBuffer = await sharp(fileBuffer).rotate(90).toBuffer();
      }

      const img = await sheetDoc.embedPng(imgBuffer);
      embedWidth = img.width;
      embedHeight = img.height;

      // Create a temporary single-page PDF to embed repeatedly
      const tempDoc = await PDFDocument.create();
      const tempPage = tempDoc.addPage([embedWidth, embedHeight]);
      tempPage.drawImage(img, { x: 0, y: 0, width: embedWidth, height: embedHeight });
      embedPdf = await sheetDoc.embedPdf(await tempDoc.save());
    } else {
      // Handle PDF uploads
      const uploadedPdf = await PDFDocument.load(fileBuffer);
      let [firstPage] = await sheetDoc.embedPdf(await uploadedPdf.save());
      if (rotate90) firstPage = firstPage.rotate(90);
      embedWidth = firstPage.width;
      embedHeight = firstPage.height;
      embedPdf = [firstPage];
    }

    const margin = 0.125 * pointsPerInch;
    const usableWidth = sheetWidth - margin * 2;
    const usableHeight = sheetHeight - margin * 2;

    const cols = Math.floor(usableWidth / (embedWidth + margin));
    const rows = Math.floor(usableHeight / (embedHeight + margin));
    const perSheet = cols * rows;

    let placed = 0;
    let page = blankPage;

    for (let i = 0; i < count; i++) {
      const col = placed % cols;
      const row = Math.floor(placed / cols);

      const x = margin + col * (embedWidth + margin);
      const y = sheetHeight - margin - (row + 1) * (embedHeight + margin);

      page.drawPage(embedPdf[0]);

      placed++;
      if (placed >= perSheet && i + 1 < count) {
        page = sheetDoc.addPage([sheetWidth, sheetHeight]);
        placed = 0;
      }
    }

    const pdfBytes = await sheetDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=gangsheet.pdf");
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("Error generating PDF");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
