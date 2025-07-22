import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { PDFDocument } from 'pdf-lib';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Allow CORS for all domains (so your test.html can call it)
app.use(cors());

// ✅ Temporary storage for uploads
const upload = multer({ dest: 'uploads/' });

// ✅ Simple health check
app.get('/', (req, res) => {
  res.send('✅ Gang Sheet Backend is running!');
});

// ✅ Merge endpoint
app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const rotate = req.body.rotate === 'true';
    const qty = parseInt(req.body.qty || '1', 10);

    const ext = path.extname(req.file.originalname).toLowerCase();
    const gangSheetWidth = 22; // inches
    const gangSheetHeight = 36; // inches
    const dpi = 300;
    const sheetPxWidth = gangSheetWidth * dpi;
    const sheetPxHeight = gangSheetHeight * dpi;

    let imageWidthInches, imageHeightInches;

    if (ext === '.png') {
      // ✅ Handle PNG
      const img = await loadImage(req.file.path);

      let imgWidth = img.width;
      let imgHeight = img.height;

      if (rotate) [imgWidth, imgHeight] = [imgHeight, imgWidth];

      imageWidthInches = imgWidth / dpi;
      imageHeightInches = imgHeight / dpi;

      const across = Math.floor(gangSheetWidth / imageWidthInches);
      const down = Math.ceil(qty / across);

      const totalHeightNeeded = down * imageHeightInches;
      const gangSheetPages = Math.ceil(totalHeightNeeded / gangSheetHeight);

      const pdfDoc = await PDFDocument.create();

      let remainingQty = qty;
      for (let pageIndex = 0; pageIndex < gangSheetPages; pageIndex++) {
        const page = pdfDoc.addPage([sheetPxWidth, sheetPxHeight]);
        const canvas = createCanvas(sheetPxWidth, sheetPxHeight);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, sheetPxWidth, sheetPxHeight);

        let placedOnThisPage = 0;

        for (let row = 0; row < Math.floor(sheetPxHeight / (imgHeight)); row++) {
          for (let col = 0; col < Math.floor(sheetPxWidth / (imgWidth)); col++) {
            if (remainingQty <= 0) break;

            const x = col * imgWidth;
            const y = row * imgHeight;

            ctx.save();
            if (rotate) {
              ctx.translate(x + imgHeight / 2, y + imgWidth / 2);
              ctx.rotate(-Math.PI / 2);
              ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2);
            } else {
              ctx.drawImage(img, x, y);
            }
            ctx.restore();

            remainingQty--;
            placedOnThisPage++;
          }
          if (remainingQty <= 0) break;
        }

        const pngBuffer = canvas.toBuffer('image/png');
        const embeddedPng = await pdfDoc.embedPng(pngBuffer);
        const { width, height } = embeddedPng.scale(1);

        page.drawImage(embeddedPng, {
          x: 0,
          y: 0,
          width,
          height
        });
      }

      const pdfBytes = await pdfDoc.save();
      fs.unlinkSync(req.file.path); // cleanup

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="gangsheet.pdf"');
      return res.send(Buffer.from(pdfBytes));
    } else if (ext === '.pdf') {
      // ✅ Handle PDF (place PDF pages on gangsheet)
      const existingPdfBytes = fs.readFileSync(req.file.path);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const gangSheetDoc = await PDFDocument.create();

      const pdfPage = await gangSheetDoc.embedPage(pdfDoc.getPage(0));
      const { width: origW, height: origH } = pdfPage;

      let w = origW;
      let h = origH;
      if (rotate) [w, h] = [h, w];

      const across = Math.floor((gangSheetWidth * dpi) / w);
      const down = Math.ceil(qty / across);

      const totalHeightNeeded = down * h;
      const gangSheetPages = Math.ceil(totalHeightNeeded / (gangSheetHeight * dpi));

      let remainingQty = qty;
      for (let p = 0; p < gangSheetPages; p++) {
        const page = gangSheetDoc.addPage([gangSheetWidth * dpi, gangSheetHeight * dpi]);

        for (let row = 0; row < Math.floor((gangSheetHeight * dpi) / h); row++) {
          for (let col = 0; col < across; col++) {
            if (remainingQty <= 0) break;

            page.drawPage(pdfPage, {
              x: col * w,
              y: (gangSheetHeight * dpi) - (row + 1) * h,
              width: w,
              height: h
            });

            remainingQty--;
          }
          if (remainingQty <= 0) break;
        }
      }

      const pdfBytes = await gangSheetDoc.save();
      fs.unlinkSync(req.file.path);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="gangsheet.pdf"');
      return res.send(Buffer.from(pdfBytes));
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PNG or PDF.' });
    }
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Error merging file' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gang Sheet backend running on port ${PORT}`);
});
