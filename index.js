import express from "express";
import multer from "multer";
import { PDFDocument, degrees } from "pdf-lib";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Constants for sheet and spacing
const SHEET_WIDTH_INCH = 22;
const SHEET_HEIGHT_INCH = 36;
const SAFE_MARGIN_INCH = 0.125;
const SPACING_INCH = 0.5;
const POINTS_PER_INCH = 72; // PDF uses points (1 inch = 72 pts)

app.use(express.static("public"));

app.post("/generate", upload.array("files"), async (req, res) => {
  try {
    const files = req.files;
    const quantities = JSON.parse(req.body.quantities || "[]");
    const rotations = JSON.parse(req.body.rotations || "[]");

    const pdfDoc = await PDFDocument.create();
    const sheetWidthPts = SHEET_WIDTH_INCH * POINTS_PER_INCH;
    const sheetHeightPts = SHEET_HEIGHT_INCH * POINTS_PER_INCH;

    let page = pdfDoc.addPage([sheetWidthPts, sheetHeightPts]);

    let x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
    let y = sheetHeightPts - SAFE_MARGIN_INCH * POINTS_PER_INCH;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const quantity = quantities[i] || 1;
      const rotation = rotations[i] || 0;

      let imgWidthPts, imgHeightPts, embedRef;

      if (file.mimetype === "image/png") {
        // PNG embedding
        const img = await pdfDoc.embedPng(file.buffer);
        imgWidthPts = img.width;
        imgHeightPts = img.height;
        embedRef = img;

      } else if (file.mimetype === "application/pdf") {
        // Import first page of PDF
        const tempPdf = await PDFDocument.load(file.buffer);
        const [importedPage] = await pdfDoc.copyPages(tempPdf, [0]);
        embedRef = importedPage;

        // Get original PDF size in points
        const { width, height } = importedPage.getSize();
        imgWidthPts = width;
        imgHeightPts = height;

      } else {
        console.warn(`Unsupported file type: ${file.mimetype}`);
        continue;
      }

      for (let q = 0; q < quantity; q++) {
        // Check if it fits horizontally; if not, move to next row
        if (x + imgWidthPts + SAFE_MARGIN_INCH * POINTS_PER_INCH > sheetWidthPts) {
          x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
          y -= imgHeightPts + SPACING_INCH * POINTS_PER_INCH;
        }

        // If it doesn’t fit vertically, create a new page
        if (y - imgHeightPts - SAFE_MARGIN_INCH * POINTS_PER_INCH < 0) {
          page = pdfDoc.addPage([sheetWidthPts, sheetHeightPts]);
          x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
          y = sheetHeightPts - SAFE_MARGIN_INCH * POINTS_PER_INCH;
        }

        // Draw based on type
        if (file.mimetype === "image/png") {
          page.drawImage(embedRef, {
            x,
            y: y - imgHeightPts,
            width: imgWidthPts,
            height: imgHeightPts,
            rotate: degrees(rotation),
          });
        } else if (file.mimetype === "application/pdf") {
          page.drawPage(embedRef, {
            x,
            y: y - imgHeightPts,
            xScale: 1,
            yScale: 1,
          });
        }

        // Move x forward for next placement
        x += imgWidthPts + SPACING_INCH * POINTS_PER_INCH;
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=gangsheet.pdf");
    res.send(pdfBytes);

  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
