import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Allow frontend access
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// ✅ DPI constant for scaling (most print workflows use 300 DPI)
const PRINT_DPI = 300;

// ✅ Utility: Scale pixels → inches → PDF points
function pxToPDFPoints(px) {
  const inches = px / PRINT_DPI; // convert to inches
  return inches * 72; // convert to PDF points
}

// ✅ Merge Route
app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const numCopies = parseInt(quantity) || 1;
    const rotateFlag = rotate === 'true';
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let singleImagePDF;

    if (ext === '.png') {
      console.log('✅ Processing PNG with DPI scaling...');
      const metadata = await sharp(filePath).metadata();
      console.log(`✅ PNG metadata: ${metadata.width}x${metadata.height}px`);

      const widthPDF = pxToPDFPoints(metadata.width);
      const heightPDF = pxToPDFPoints(metadata.height);

      console.log(`✅ Target print size: ${(metadata.width / PRINT_DPI).toFixed(2)}" x ${(metadata.height / PRINT_DPI).toFixed(2)}"`);

      const pngBuffer = fs.readFileSync(filePath);
      const tempDoc = await PDFDocument.create();
      const embeddedImage = await tempDoc.embedPng(pngBuffer);

      const page = tempDoc.addPage([widthPDF, heightPDF]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: widthPDF,
        height: heightPDF,
      });

      singleImagePDF = await tempDoc.save();

    } else if (ext === '.pdf') {
      console.log('✅ Processing PDF...');
      singleImagePDF = fs.readFileSync(filePath);

    } else {
      return res.status(400).json({ error: 'Only PNG and PDF are supported.' });
    }

    // ✅ Create gang sheet document
    const gangSheetDoc = await PDFDocument.create();
    const embeddedSource = await gangSheetDoc.embedPdf(singleImagePDF);

    const [sourcePage] = await gangSheetDoc.embedPdf(singleImagePDF);
    const { width, height } = sourcePage;

    const margin = 10;
    const gap = 10;

    const maxWidth = 3300;  // ~11 inches
    const maxHeight = 5100; // ~17 inches

    let x = margin;
    let y = maxHeight - height - margin;

    let page = gangSheetDoc.addPage([maxWidth, maxHeight]);

    for (let i = 0; i < numCopies; i++) {
      if (x + width + margin > maxWidth) {
        x = margin;
        y -= height + gap;
      }

      if (y < margin) {
        page = gangSheetDoc.addPage([maxWidth, maxHeight]);
        x = margin;
        y = maxHeight - height - margin;
      }

      page.drawPage(embeddedSource[0], {
        x,
        y,
        width,
        height,
        rotate: rotateFlag ? { angle: Math.PI / 2 } : undefined,
      });

      x += width + gap;
    }

    const finalPDF = await gangSheetDoc.save();

    // ✅ Cleanup temp file
    fs.unlinkSync(filePath);

    console.log('✅ Gang sheet generated successfully!');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=gangsheet.pdf');
    res.send(Buffer.from(finalPDF));

  } catch (err) {
    console.error('❌ Error generating gang sheet:', err);
    res.status(500).json({ error: 'Failed to generate gang sheet', details: err.message });
  }
});

// ✅ Root route to confirm backend is live
app.get('/', (req, res) => {
  res.send('✅ Gang Sheet backend is running with DPI scaling!');
});

// ✅ Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
