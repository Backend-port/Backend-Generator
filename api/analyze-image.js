// api/analyze-image.js
// Catatan: Karena ini adalah Netlify Function, ia menggunakan format Node.js standard.
const { GoogleGenAI } = require('@google/genai');
const multer = require('multer');
const express = require('express');
const serverless = require('serverless-http'); // Diperlukan untuk membungkus Express di Netlify

// Inisialisasi Google Gen AI. Netlify akan menyediakan API Key secara otomatis 
// melalui Environment Variables di proses build.
const ai = new GoogleGenAI({});

// Konfigurasi Multer (in-memory storage untuk Netlify Function)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Wrapper untuk Netlify Function (diperlukan untuk memproses multipart form data)
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Fungsi konversi Buffer memori ke format API
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };
}

// Endpoint utama untuk analisis
app.post('/', upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'selectedLang', maxCount: 1 }, 
  { name: 'selectedRatio', maxCount: 1 }
]), async (req, res) => {
  const imageFile = req.files && req.files.imageFile ? req.files.imageFile[0] : null;

  if (!imageFile) {
    return res.status(400).json({ error: "Tidak ada file yang diunggah." });
  }

  const selectedLang = req.body.selectedLang;
  const selectedRatio = req.body.selectedRatio;

  const imageBuffer = imageFile.buffer;
  const mimeType = imageFile.mimetype;
  
  const isRawOutput = selectedLang.endsWith('-RAW');
  const outputLanguage = selectedLang.includes('EN') ? 'English' : 'Bahasa Indonesia';

  try {
    const imagePart = bufferToGenerativePart(imageBuffer, mimeType);
    let prompt;

    if (isRawOutput) {
        // MODE RAW: Minta Gemini hanya menghasilkan teks prompt akhir
        prompt = `
            Analyze the image and generate a highly detailed, single-paragraph text prompt for an AI image generator. The output must ONLY be the final prompt text and must be in ${outputLanguage}. Include the aspect ratio: ${selectedRatio}.
        `;
    } else {
        // MODE JSON: Minta Gemini menghasilkan JSON terstruktur
        prompt = `
            Analyze the image and generate a detailed description for an AI image generator. 
            The output must ONLY be a JSON object where all descriptive values are in ${outputLanguage}. 
            Use the following structure: 
            {
              "baseDescription": {
                "background": "...",
                "subjectDescription": "...",
                "visualStyle": "...",
                "lighting": "...",
                "characterTemplate": "..."
              },
              "finalPrompt": "Combine all baseDescription fields into one cohesive text prompt for an AI image generator in ${outputLanguage}. Include the following detail at the end of the prompt: 'aspect ratio: ${selectedRatio}'."
            }
        `;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [imagePart, { text: prompt }],
    });

    if (isRawOutput) {
        return res.json({ finalPrompt: response.text });
    }

    // Pemrosesan JSON
    let jsonText = response.text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.substring(7, jsonText.lastIndexOf("```")).trim();
    }
    
    const jsonOutput = JSON.parse(jsonText);
    res.json(jsonOutput);

  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      code: 500,
      message: error.message || "Gagal menganalisis gambar. Cek status API Key.",
    });
  }
});

// Ekspor handler yang dibungkus agar Netlify dapat menjalankannya
module.exports.handler = serverless(app);
