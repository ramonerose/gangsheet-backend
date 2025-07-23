import express from "express";
import multer from "multer";
import cors from "cors";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "fs";

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// ==== CONFIG ====
const SHEET_WIDTH_IN = 22; // gang sheet width in inches
const SHEET_HEIGHT_IN = 24; // gang sheet height in inches
const DPI = 300; // print resolution
const MARGIN_IN = 0.5; // margin around sheet
const GAP_IN = 0.25; // spacing between logos

// === HELPER to convert inches → PDF points ===
const inchToPoints = (inch) => inch * 72; // PDF-lib uses points (72 pt/inch)

// === MAIN MERGE ROUTE ===
app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const rotate90 = rotate === "true" || rotate === true;
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const totalQty = parseInt(quantity) || 1;

    // === Create a blank PDF gang sheet ===
    const doc = await PDFDocument.create();

    // Convert sheet size to points for PDF
    const sheetWidthPts = inchToPoints(SHEET_WIDTH_IN);
    const sheetHeightPts = inchToPoints(SHEET_HEIGHT_IN);

    // Determine image width/height in inches
    let logoWidthIn = 0;
    let logoHeightIn = 0;

    if (mimeType === "image/png") {
      const meta = await sharp(fileBuffer).metadata();
      // Convert pixels → inches at 300 dpi
      logoWidthIn = meta.width / DPI;
      logoHeightIn = meta.height / DPI;
    } else if (mimeType === "application/pdf") {
      const uploadedPDF = await PDFDocument.load(fileBuffer);
      const [firstPage] = uploadedPDF.getPages();
      const { width, height } = firstPage.getSize();
      // width/height are already in points → convert to inches
      logoWidthIn = width / 72;
      logoHeightIn = height / 72;
    }

    // If rotation requested, swap width/height
    if (rotate90) {
      const tmp = logoWidthIn;
      logoWidthIn = logoHeightIn;
      logoHeightIn = tmp;
    }

    // Placement math
    const usableWidthIn = SHEET_WIDTH_IN - MARGIN_IN * 2;
    const usableHeightIn = SHEET_HEIGHT_IN - MARGIN_IN * 2;

    const logosPerRow = Math.floor(
      (usableWidthIn + GAP_IN) / (logoWidthIn + GAP_IN)
    );
    const rowsPerSheet = Math.floor(
      (usableHeightIn + GAP_IN) / (logoHeightIn + GAP_IN)
    );

    const logosPerSheet = logosPerRow * rowsPerSheet;

    // Calculate how many sheets needed
    const totalSheets = Math.ceil(totalQty / logosPerSheet);

    // Now generate each sheet
    for (let s = 0; s < totalSheets; s++) {
      const page = doc.addPage([sheetWidthPts, sheetHeightPts]);

      let placedCount = 0;
      let xIn = MARGIN_IN;
      let yIn = SHEET_HEIGHT_IN - MARGIN_IN - logoHeightIn; // start from top

      for (let r = 0; r < rowsPerSheet; r++) {
        xIn = MARGIN_IN; // reset x each row

        for (let c = 0; c < logosPerRow; c++) {
          const currentLogoIndex = s * logosPerSheet + placedCount;
          if (currentLogoIndex >= totalQty) break;

          // Draw image or PDF page
          if (mimeType === "image/png") {
            const pngImage = await doc.embedPng(fileBuffer);
            const drawWidthPts = inchToPoints(logoWidthIn);
            const drawHeightPts = inchToPoints(logoHeightIn);

            page.drawImage(pngImage, {
              x: inchToPoints(xIn),
              y: inchToPoints(yIn),
              width: drawWidthPts,
              height: drawHeightPts,
              rotate: rotate90 ? { degrees: 90 } : undefined,
            });
          } else if (mimeType === "application/pdf") {
            const uploadedPDF = await PDFDocument.load(fileBuffer);
            const [firstPage] = await doc.copyPages(uploadedPDF, [0]);
            const pdfPageEmbed = firstPage;

            page.drawPage(pdfPageEmbed, {
              x: inchToPoints(xIn),
              y: inchToPoints(yIn),
              width: inchToPoints(logoWidthIn),
              height: inchToPoints(logoHeightIn),
            });
          }

          placedCount++;
          xIn += logoWidthIn + GAP_IN;
        }

        // move down for next row
        yIn -= logoHeightIn + GAP_IN;
        if (s * logosPerSheet + placedCount >= totalQty) break;
      }
    }

    // Save final gang sheet PDF
    const finalPdfBytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=gangsheet.pdf"
    );
    res.send(Buffer.from(finalPdfBytes));
  } catch (err) {
    console.error("Error generating gang sheet:", err);
    res.status(500).json({ error: "Failed to generate gang sheet" });
  }
});

// Root test
app.get("/", (req, res) => {
  res.send("✅ Gang Sheet backend is running!");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
