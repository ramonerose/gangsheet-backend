import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, rgb } from 'pdf-lib';
import { createCanvas, loadImage } from 'canvas';

const app = express();
app.use(cors());

// Temporary upload storage
const upload = multer({ dest: 'uploads/' });

// Test endpoint to confirm server is live
app.get('/ping', (req, res) => {
  res.json({ message: "✅ Backend is live and responding!" });
});

// Main gang sheet merging endpoint
app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const { quantity, rotate } = req.body;

    const gangSheetWidth = 22; // inches
    const dpi = 300; 
    const pxPerInch = dpi;

    let imageBuffer;

    if (req.file.mimetype === 'application/pdf') {
      // Extract first page of PDF as image
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();

      // Create a blank canvas for the extracted page
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      imageBuffer = canvas.toBuffer('image/png');
    } else {
      imageBuffer = fs.readFileSync(filePath);
    }

    // Load the image and get dimensions
    let img = sharp(imageBuffer);
    if (rotate === 'true' || rotate === 'yes') {
      img = img.rotate(90);
    }
    const metadata = await img.metadata();
    const imgWidthPx = metadata.width;
    const imgHeightPx = metadata.height;

    const imagesPerRow = Math.floor((gangSheetWidth * pxPerInch) / imgWidthPx);
    const rowsNeeded = Math.ceil(quantity / imagesPerRow);

    const gangSheetHeightPx = rowsNeeded * imgHeightPx;

    // Create blank gang sheet
    const gangCanvas = createCanvas(
      gangSheetWidth * pxPerInch,
      gangSheetHeightPx
    );
    const ctx = gangCanvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, gangCanvas.width, gangCanvas.height);

    const loadedImage = await loadImage(await img.png().toBuffer());
    let x = 0, y = 0, placed = 0;

    for (let i = 0; i < quantity; i++) {
      ctx.drawImage(loadedImage, x, y, imgWidthPx, imgHeightPx);
      placed++;
      if (placed % imagesPerRow === 0) {
        x = 0;
        y += imgHeightPx;
      } else {
        x += imgWidthPx;
      }
    }

    const outPdf = await PDFDocument.create();
    const pngImage = await outPdf.embedPng(gangCanvas.toBuffer());
    const pdfPage = outPdf.addPage([
      gangCanvas.width,
      gangCanvas.height
    ]);
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: gangCanvas.width,
      height: gangCanvas.height,
    });

    const pdfBytesOut = await outPdf.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="gangsheet.pdf"');
    res.send(Buffer.from(pdfBytesOut));

    fs.unlinkSync(filePath); // cleanup

  } catch (error) {
    console.error('❌ Error merging gang sheet:', error);
    res.status(500).json({ error: 'Failed to generate gang sheet' });
  }
});

// ✅ IMPORTANT: Railway requires binding to process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Gang Sheet backend running on port ${PORT}`);
});
