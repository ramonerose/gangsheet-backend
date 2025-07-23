import express from "express";
import multer from "multer";
import { PDFDocument, degrees } from "pdf-lib";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// constants
const SHEET_WIDTH_INCH = 22;
const SHEET_HEIGHT_INCH = 36;
const SAFE_MARGIN_INCH = 0.125;
const SPACING_INCH = 0.5;
const POINTS_PER_INCH = 72;

app.use(express.static("public"));

app.post("/generate", upload.array("images"), async (req, res) => {
  try {
    const files = req.files;
    const quantities = JSON.parse(req.body.quantities || "[]");
    const rotations = JSON.parse(req.body.rotations || "[]");

    const pdfDoc = await PDFDocument.create();
    const sheetWidth = SHEET_WIDTH_INCH * POINTS_PER_INCH;
    const sheetHeight = SHEET_HEIGHT_INCH * POINTS_PER_INCH;

    let page = pdfDoc.addPage([sheetWidth, sheetHeight]);

    let x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
    let y = sheetHeight - SAFE_MARGIN_INCH * POINTS_PER_INCH;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const quantity = quantities[i] || 1;
      const rotation = rotations[i] || 0;

      const imgBytes = file.buffer;
      const img = await pdfDoc.embedPng(imgBytes);

      const imgWidth = img.width;
      const imgHeight = img.height;

      for (let q = 0; q < quantity; q++) {
        if (x + imgWidth + SAFE_MARGIN_INCH * POINTS_PER_INCH > sheetWidth) {
          x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
          y -= imgHeight + SPACING_INCH * POINTS_PER_INCH;
        }

        if (y - imgHeight - SAFE_MARGIN_INCH * POINTS_PER_INCH < 0) {
          page = pdfDoc.addPage([sheetWidth, sheetHeight]);
          x = SAFE_MARGIN_INCH * POINTS_PER_INCH;
          y = sheetHeight - SAFE_MARGIN_INCH * POINTS_PER_INCH;
        }

        page.drawImage(img, {
          x,
          y: y - imgHeight,
          width: imgWidth,
          height: imgHeight,
          rotate: degrees(rotation),
        });

        x += imgWidth + SPACING_INCH * POINTS_PER_INCH;
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=gangsheet.pdf");
    res.send(pdfBytes);

  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
