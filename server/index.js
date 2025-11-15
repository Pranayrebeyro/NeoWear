import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.GEMINI_API_KEY;

// ---------------- MULTIMODAL GEMINI CALL ---------------- //

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, model = "gemini-2.0-flash", imageBase64 } = req.body;

    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

    const parts = [{ text: prompt }];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      });
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 300
      }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const txt = await r.text();

    if (!r.ok) {
      console.error("Gemini Error:", txt);
      return res.status(r.status).send(txt);
    }

    const json = JSON.parse(txt);
    return res.json(json);

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 TryMate Proxy running at http://localhost:${PORT}`)
);
