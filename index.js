import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: 'uploads/' });

// ✅ Set desired PRINT WIDTH in inches
const FIXED_WIDTH_INCHES = 6.5;
const POINTS_PER_INCH = 72;

app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const numCopies = parseInt(quantity) || 1;
    const rotateFlag = rotate === 'true';
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let singleImagePDF;

    if (ext === '.png') {
      console.log('✅ Processing PNG with FIXED size...');

      // Read PNG dimensions
      const metadata = await sharp(filePath).metadata();
      const originalWidth = metadata.width;
      const originalHeight = metadata.height;
      console.log(`Original PNG size: ${originalWidth}px x ${originalHeight}px`);

      // ✅ Force fixed width in inches → convert to points
      const fixedWidthPoints = FIXED_WIDTH_INCHES * POINTS_PER_INCH;
      const aspectRatio = originalHeight / originalWidth;
      const fixedHeightPoints = fixedWidthPoints * aspectRatio;

      console.log(`✅ Forcing to ${FIXED_WIDTH_INCHES}" wide → ${fixedWidthPoints}pt wide x ${fixedHeightPoints.toFixed(2)}pt high`);

      const pngBuffer = fs.readFileSync(filePath);
      const tempDoc = await PDFDocument.create();
      const embeddedImage = await tempDoc.embedPng(pngBuffer);

      const page = tempDoc.addPage([fixedWidthPoints, fixedHeightPoints]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: fixedWidthPoints,
        height: fixedHeightPoints
      });

      singleImagePDF = await tempDoc.save();

    } else if (ext === '.pdf') {
      console.log('✅ Processing PDF...');
      singleImagePDF = fs.readFileSync(filePath);

    } else {
      return res.status(400).json({ error: 'Only PNG and PDF are supported.' });
    }

    // ✅ Create gang sheet
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

    fs.unlinkSync(filePath);

    console.log('✅ Gang sheet generated successfully with FIXED WIDTH!');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=gangsheet.pdf');
    res.send(Buffer.from(finalPDF));

  } catch (err) {
    console.error('❌ Error generating gang sheet:', err);
    res.status(500).json({ error: 'Failed to generate gang sheet', details: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('✅ Gang Sheet backend running with HARD-LOCKED image sizing!');
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
