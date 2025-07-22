import express from "express";
import multer from "multer";
import cors from "cors";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // allow up to 50MB

// ✅ Enable CORS for all origins
app.use(cors({ origin: "*" }));

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ Gang Sheet backend is running!");
});

// ✅ Gang sheet generation route
app.post("/generate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const qty = parseInt(req.body.quantity) || 1;
    const rotate = req.body.rotate === "true";

    const GANG_WIDTH = 22 * 72;  // 22 inches
    const GANG_HEIGHT = 36 * 72; // 36 inches
    const gangDoc = await PDFDocument.create();

    const buffer = req.file.buffer;
    let imgWidthInPts, imgHeightInPts;

    let imgEmbed;

    if (req.file.mimetype === "image/png") {
      // PNG -> PDF
      const metadata = await sharp(buffer).metadata();
      imgWidthInPts = (metadata.width / 300) * 72;
      imgHeightInPts = (metadata.height / 300) * 72;

      const tempPDF = await PDFDocument.create();
      const tempPage = tempPDF.addPage([imgWidthInPts, imgHeightInPts]);
      const pngImage = await tempPDF.embedPng(buffer);
      tempPage.drawImage(pngImage, { x: 0, y: 0, width: imgWidthInPts, height: imgHeightInPts });

      const tempPdfBytes = await tempPDF.save();
      const tempLoaded = await PDFDocument.load(tempPdfBytes);
      imgEmbed = await gangDoc.embedPage(tempLoaded.getPage(0));

    } else if (req.file.mimetype === "application/pdf") {
      // PDF
      const pdf = await PDFDocument.load(buffer);
      const firstPage = pdf.getPages()[0];
      const { width, height } = firstPage.getSize();
      imgWidthInPts = width;
      imgHeightInPts = height;
      imgEmbed = await gangDoc.embedPage(firstPage);
    } else {
      return res.status(400).send("Unsupported file type");
    }

    if (rotate) {
      [imgWidthInPts, imgHeightInPts] = [imgHeightInPts, imgWidthInPts];
    }

    const cols = Math.floor(GANG_WIDTH / imgWidthInPts);
    const rows = Math.floor(GANG_HEIGHT / imgHeightInPts);

    const totalPerSheet = cols * rows;
    const sheetsNeeded = Math.ceil(qty / totalPerSheet);

    for (let s = 0; s < sheetsNeeded; s++) {
      const page = gangDoc.addPage([GANG_WIDTH, GANG_HEIGHT]);
      let placed = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (placed >= qty) break;
          const x = c * imgWidthInPts;
          const y = GANG_HEIGHT - (r + 1) * imgHeightInPts;

          page.drawPage(imgEmbed, {
            x,
            y,
            width: imgWidthInPts,
            height: imgHeightInPts,
            rotate: rotate ? { type: "degrees", angle: 90 } : undefined
          });

          placed++;
        }
      }
    }

    const finalPdf = await gangDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=gangsheet.pdf");
    res.send(Buffer.from(finalPdf));

  } catch (err) {
    console.error(err);
    res.status(500).send("Error merging PDF");
  }
});

// ✅ Use Render’s provided PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
