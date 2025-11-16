// api/generate.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body && Object.keys(req.body).length ? req.body : await new Promise((resolve, reject) => {
      let d = "";
      req.on("data", c => d += c);
      req.on("end", () => resolve(JSON.parse(d || "{}")));
      req.on("error", reject);
    });

    const { prompt, model = "gemini-2.0-flash", imageBase64 } = body;
    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`;
    const parts = [{ text: prompt }];
    if (imageBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });

    const payload = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.8, maxOutputTokens: 300 } };

    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).send(txt);
    try { res.status(200).json(JSON.parse(txt)); } catch { res.status(200).send(txt); }
  } catch (err) {
    console.error("Function error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
}
