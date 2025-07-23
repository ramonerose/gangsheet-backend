
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 8080;

// CORS setup
app.use(cors());
app.use(express.static('public'));

// Convert pixels to inches with DPI awareness
const pixelsToInches = (pixels, dpi = 300) => pixels / dpi;

// Generate gang sheet PDF
app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    const { quantity, rotate } = req.body;
    const filePath = req.file.path;

    // Get image metadata
    const imageMeta = await sharp(filePath).metadata();
    const dpi = imageMeta.density || 300; // default to 300 DPI if missing
    const widthInches = pixelsToInches(imageMeta.width, dpi);
    const heightInches = pixelsToInches(imageMeta.height, dpi);

    // Define sheet size (defaulting to 22x36 inches)
    const sheetWidthInches = 22;
    const sheetHeightInches = 36;

    const pdfDoc = await PDFDocument.create();
    const sheet = pdfDoc.addPage([sheetWidthInches * 72, sheetHeightInches * 72]); // 72 points per inch

    // Embed image
    const imgBuffer = await fs.promises.readFile(filePath);
    const embeddedImage = await pdfDoc.embedPng(imgBuffer);

    const imgWidthPoints = widthInches * 72;
    const imgHeightPoints = heightInches * 72;

    const qty = parseInt(quantity) || 1;
    const rotateFlag = rotate === 'true';

    let x = 0, y = sheetHeightInches * 72 - imgHeightPoints;
    for (let i = 0; i < qty; i++) {
      if (x + imgWidthPoints > sheetWidthInches * 72) {
        x = 0;
        y -= imgHeightPoints;
      }
      if (y < 0) break; // stop if sheet full

      sheet.drawImage(embeddedImage, {
        x,
        y,
        width: imgWidthPoints,
        height: imgHeightPoints,
        rotate: rotateFlag ? { degrees: 90 } : undefined,
      });

      x += imgWidthPoints;
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="gangsheet.pdf"');
    res.send(Buffer.from(pdfBytes));

    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error merging images:', error);
    res.status(500).send('Error generating gang sheet PDF');
  }
});

app.get('/', (req, res) => {
  res.send('✅ Gang Sheet backend is running with full DPI-aware scaling!');
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
