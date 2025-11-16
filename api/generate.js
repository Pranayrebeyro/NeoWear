// api/generate.js
// Vercel serverless function to proxy requests to Google Generative API
// Make sure GEMINI_API_KEY is set in Vercel Environment Variables.

export default async function handler(req, res) {
  // Basic CORS for browser clients (restrict origin in production)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // read body (works across Vercel runtimes)
    const body = req.body && Object.keys(req.body).length ? req.body : await new Promise((resolve, reject) => {
      let d = "";
      req.on("data", (c) => d += c);
      req.on("end", () => {
        try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); }
      });
      req.on("error", reject);
    });

    const { prompt, model = "gemini-2.0-flash", imageBase64 } = body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    // Build request for Google Generative API (generateContent)
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`;

    const parts = [{ text: prompt }];
    if (imageBase64) {
      // assume JPEG by default — change if needed
      parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    if (!r.ok) {
      // forward error body for debugging
      return res.status(r.status).send(text);
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (e) {
      // non-JSON response — forward as plain text
      return res.status(200).send(text);
    }
  } catch (err) {
    console.error("api/generate error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}
