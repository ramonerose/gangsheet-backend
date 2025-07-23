import express from "express";
import multer from "multer";
import cors from "cors";
import sharp from "sharp";
import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });

// Utility: Ensure temp + output folders exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir("uploads");
ensureDir("output");

// --- HELPER: Generate gang sheet for PNGs ---
async function generatePngGangSheet(filePath, quantity) {
  console.log("🔍 Reading PNG metadata...");
  const metadata = await sharp(filePath).metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;
  console.log(`✅ Detected PNG size: ${imgWidth}x${imgHeight}`);

  // Margin between images
  const margin = 20;

  // Decide how many images per row
  const imagesPerRow = Math.floor(2000 / (imgWidth + margin)); // fit within ~2000px width
  const rows = Math.ceil(quantity / imagesPerRow);

  const sheetWidth = imagesPerRow * (imgWidth + margin) + margin;
  const sheetHeight = rows * (imgHeight + margin) + margin;

  console.log(`🖨️ Gang sheet layout → ${imagesPerRow} per row, ${rows} rows`);
  console.log(`📄 Gang sheet size → ${sheetWidth}x${sheetHeight}`);

  // Create a blank sheet
  let base = sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Load PNG buffer once
  const imgBuffer = await sharp(filePath).toBuffer();

  let composites = [];
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < imagesPerRow; col++) {
      if (count >= quantity) break;
      composites.push({
        input: imgBuffer,
        top: margin + row * (imgHeight + margin),
        left: margin + col * (imgWidth + margin),
      });
      count++;
    }
  }

  return base.composite(composites).png().toBuffer();
}

// --- HELPER: Generate gang sheet for PDFs ---
async function generatePdfGangSheet(filePath, quantity) {
  console.log("🔍 Reading PDF...");
  const existingPdf = await PDFDocument.load(fs.readFileSync(filePath));
  const firstPage = existingPdf.getPage(0);
  const { width: pdfWidth, height: pdfHeight } = firstPage.getSize();

  console.log(`✅ Detected PDF page size: ${pdfWidth}x${pdfHeight}`);

  const margin = 20;
  const imagesPerRow = Math.floor(2000 / (pdfWidth + margin));
  const rows = Math.ceil(quantity / imagesPerRow);

  const sheetWidth = imagesPerRow * (pdfWidth + margin) + margin;
  const sheetHeight = rows * (pdfHeight + margin) + margin;

  console.log(`🖨️ Gang sheet layout → ${imagesPerRow} per row, ${rows} rows`);
  console.log(`📄 Gang sheet size → ${sheetWidth}x${sheetHeight}`);

  // Create a new PDF for gang sheet
  const gangPdf = await PDFDocument.create();
  const page = gangPdf.addPage([sheetWidth, sheetHeight]);

  // Embed the original PDF page once
  const [embeddedPage] = await gangPdf.embedPdf(await existingPdf.save(), [0]);

  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < imagesPerRow; col++) {
      if (count >= quantity) break;
      const x = margin + col * (pdfWidth + margin);
      const y = sheetHeight - pdfHeight - margin - row * (pdfHeight + margin);
      page.drawPage(embeddedPage, { x, y, width: pdfWidth, height: pdfHeight });
      count++;
    }
  }

  return await gangPdf.save();
}

// --- MAIN MERGE ENDPOINT ---
app.post("/merge", upload.single("file"), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const qty = parseInt(quantity) || 1;
    const rotateFlag = rotate === "true";
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    console.log(`📂 Uploaded file: ${req.file.originalname}`);
    console.log(`📦 Quantity: ${qty}, Rotate: ${rotateFlag}`);

    let outputBuffer;
    let outputType;

    if (fileExt === ".png") {
      outputBuffer = await generatePngGangSheet(filePath, qty);
      outputType = "image/png";
    } else if (fileExt === ".pdf") {
      outputBuffer = await generatePdfGangSheet(filePath, qty);
      outputType = "application/pdf";
    } else {
      return res.status(400).send("Unsupported file type. Use PNG or PDF.");
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.setHeader("Content-Type", outputType);
    res.send(outputBuffer);

  } catch (err) {
    console.error("❌ Error generating gang sheet:", err);
    res.status(500).send("Error generating gang sheet");
  }
});

app.listen(PORT, () => console.log(`✅ Gang Sheet Backend running on port ${PORT}`));
