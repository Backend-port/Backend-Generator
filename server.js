// server.js

// 1. Impor Modul & Muat Environment Variables (Wajib!)
const express = require("express");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config(); // MEMUAT GEMINI_API_KEY DARI ENVIRONMENT VARIABLES

const app = express();
const port = 8080;

// 2. Inisialisasi Google Gen AI (Otomatis membaca GEMINI_API_KEY)
const ai = new GoogleGenAI({});

// Konfigurasi Multer: Menyimpan file sementara di memori
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// PENTING: Untuk menerima file (imageFile) dan field teks (rasio/bahasa)
const imageUpload = upload.fields([
  { name: "imageFile", maxCount: 1 },
  { name: "selectedLang", maxCount: 1 }, // Dari dropdown bahasa
  { name: "selectedRatio", maxCount: 1 }, // Dari dropdown rasio
]);

// Fungsi konversi Buffer memori ke format API
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

// 3. Tambahkan CORS agar frontend bisa memanggil backend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// 4. Endpoint POST untuk analisis gambar
// MENGGUNAKAN imageUpload untuk menerima file DAN teks
app.post("/analyze-image", imageUpload, async (req, res) => {
  const imageFile =
    req.files && req.files.imageFile ? req.files.imageFile[0] : null;

  if (!imageFile) {
    return res.status(400).json({ error: "Tidak ada file yang diunggah." });
  }

  // Ambil data dari req.body (dikirim dari formData frontend)
  const selectedLang = req.body.selectedLang;
  const selectedRatio = req.body.selectedRatio;

  const imageBuffer = imageFile.buffer;
  const mimeType = imageFile.mimetype;

  // Tentukan mode output yang diminta
  const isRawOutput = selectedLang.endsWith("-RAW");
  const outputLanguage = selectedLang.includes("EN")
    ? "English"
    : "Bahasa Indonesia";

  try {
    const imagePart = bufferToGenerativePart(imageBuffer, mimeType);
    let prompt;

    if (isRawOutput) {
      // MODE RAW: Minta Gemini hanya menghasilkan teks prompt akhir
      prompt = `
            Analyze the image and generate a highly detailed, single-paragraph text prompt for an AI image generator. The output must ONLY be the final prompt text and must be in ${outputLanguage}. Include the following detail at the end of the prompt: 'aspect ratio: ${selectedRatio}'.
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
      // Jika mode RAW, kirimkan teks prompt sebagai respons JSON sederhana
      return res.json({ finalPrompt: response.text });
    }

    // Pemrosesan JSON (untuk mode JSON-ID dan JSON-EN)
    let jsonText = response.text.trim();

    // Hapus markdown JSON jika ada (```json ... ```)
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.substring(7, jsonText.lastIndexOf("```")).trim();
    }

    const jsonOutput = JSON.parse(jsonText);

    // Kirim JSON yang dihasilkan kembali
    res.json(jsonOutput);
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Error 500 (Internal Server Error)
    res.status(500).json({
      code: 500,
      message:
        error.message ||
        "Gagal menganalisis gambar. Pastikan Kunci API valid dan terhubung.",
    });
  }
});

// 5. Melayani file statis (index.html)
app.use(express.static("./"));

app.listen(port, () => {
  console.log(`Server berjalan di port ${port}`);
});
