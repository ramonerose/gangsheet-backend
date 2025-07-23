import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
  res.send('✅ Gang Sheet backend is running!');
});

// Merge endpoint
app.post('/merge', upload.single('file'), async (req, res) => {
  try {
    const quantity = parseInt(req.body.quantity) || 1;
    const rotate = req.body.rotate === 'true';

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    // Create a new blank PDF
    const pdfDoc = await PDFDocument.create();

    // If input is a PDF
    if (fileExt === '.pdf') {
      const fileBytes = fs.readFileSync(filePath);
      const inputPdf = await PDFDocument.load(fileBytes);

      const [page] = await pdfDoc.copyPages(inputPdf, [0]);
      for (let i = 0; i < quantity; i++) {
        const newPage = pdfDoc.addPage([page.getWidth(), page.getHeight()]);
        newPage.drawPage(page);
      }

    } else {
      // Assume it's an image (PNG, JPG)
      const imgBuffer = fs.readFileSync(filePath);

      // Optionally rotate the image
      const processedImg = rotate
        ? await sharp(imgBuffer).rotate(90).toBuffer()
        : imgBuffer;

      // Embed into PDF
      const img = await pdfDoc.embedPng(processedImg);
      const { width, height } = img;

      for (let i = 0; i < quantity; i++) {
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
      }
    }

    const mergedPdfBytes = await pdfDoc.save();

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=gangsheet.pdf');
    res.send(Buffer.from(mergedPdfBytes));

  } catch (error) {
    console.error('❌ Error merging file:', error);
    res.status(500).send('Error generating gang sheet');
  }
});

// ✅ Use Railway's dynamic port
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
