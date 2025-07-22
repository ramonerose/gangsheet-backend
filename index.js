import express from "express";
import multer from "multer";
import { PDFDocument, degrees } from "pdf-lib";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const SHEET_WIDTH_INCH = 22;
const SHEET_HEIGHT_INCH = 36;
const SAFE_MARGIN_INCH = 0.125;
const SPACING_INCH = 0.5;
const POINTS_PER_INCH = 72;
const PNG_DPI = 300;

app.get("/", (req, res) => {
  res.send("✅ Gang Sheet backend (Fixed PNG scaling) is running!");
});

app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const qty = parseInt(req.query.qty || "10");
    const rotateAngle = parseInt(req.query.rotate || "0");
    const uploadedFile = req.file.buffer;
    const filename = req.file.originalname.toLowerCase();

    const gangDoc = await PDFDocument.create();
    const sheetWidthPts = SHEET_WIDTH_INCH * POINTS_PER_INCH;
    const sheetHeightPts = SHEET_HEIGHT_INCH * POINTS_PER_INCH;
    const gangPage = gangDoc.addPage([sheetWidthPts, sheetHeightPts]);

    let embeddedObj;
    let originalWidthPts;
    let originalHeightPts;
    let isPDF = false;

    if (filename.endsWith(".pdf")) {
      const srcDoc = await PDFDocument.load(uploadedFile);
      [embeddedObj] = await gangDoc.embedPdf(await srcDoc.save());
      originalWidthPts = embeddedObj.width;
      originalHeightPts = embeddedObj.height;
      isPDF = true;
    } else if (filename.endsWith(".png")) {
      const embeddedPng = await gangDoc.embedPng(uploadedFile);
      const pxWidth = embeddedPng.width;
      const pxHeight = embeddedPng.height;
      const inchesWidth = pxWidth / PNG_DPI;
      const inchesHeight = pxHeight / PNG_DPI;
      originalWidthPts = inchesWidth * POINTS_PER_INCH;
      originalHeightPts = inchesHeight * POINTS_PER_INCH;
      embeddedObj = embeddedPng;
    } else {
      throw new Error("Unsupported file type. Upload PDF or PNG.");
    }

    const isRotated = rotateAngle === 90 || rotateAngle === 270;
    const logoWidthPts = isRotated ? originalHeightPts : originalWidthPts;
    const logoHeightPts = isRotated ? originalWidthPts : originalHeightPts;

    const marginPts = SAFE_MARGIN_INCH * POINTS_PER_INCH;
    const spacingPts = SPACING_INCH * POINTS_PER_INCH;

    const usableWidth = sheetWidthPts - marginPts * 2;
    const usableHeight = sheetHeightPts - marginPts * 2;

    const perRow = Math.floor((usableWidth + spacingPts) / (logoWidthPts + spacingPts));
    const perCol = Math.floor((usableHeight + spacingPts) / (logoHeightPts + spacingPts));

    console.log(`🧠 Can fit ${perRow} logos across × ${perCol} down`);

    let placed = 0;

    for (let row = 0; row < perCol && placed < qty; row++) {
      for (let col = 0; col < perRow && placed < qty; col++) {
        const baseX = marginPts + col * (logoWidthPts + spacingPts);
        const baseY = sheetHeightPts - marginPts - (row + 1) * logoHeightPts - row * spacingPts;

        if (rotateAngle === 90) {
          if (isPDF) {
            gangPage.drawPage(embeddedObj, {
              x: baseX + logoWidthPts,
              y: baseY,
              width: originalWidthPts,
              height: originalHeightPts,
              rotate: degrees(90)
            });
          } else {
            gangPage.drawImage(embeddedObj, {
              x: baseX + logoWidthPts,
              y: baseY,
              width: originalWidthPts,
              height: originalHeightPts,
              rotate: degrees(90)
            });
          }
        } else {
          if (isPDF) {
            gangPage.drawPage(embeddedObj, {
              x: baseX,
              y: baseY,
              width: originalWidthPts,
              height: originalHeightPts
            });
          } else {
            gangPage.drawImage(embeddedObj, {
              x: baseX,
              y: baseY,
              width: originalWidthPts,
              height: originalHeightPts
            });
          }
        }

        placed++;
      }
    }

    console.log(`✅ Placed ${placed} logos`);

    const finalPDF = await gangDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.send(finalPDF);

  } catch (err) {
    console.error("❌ MERGE ERROR:", err);
    res.status(500).send("❌ Error merging file");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));