import React, { useState, useRef, useEffect } from "react";
import "./App.css";

/**
 * TryMate - App.jsx (with optional client-side Gemini integration)
 *
 * WARNING: Putting an API key here exposes it to anyone who can view your JS bundle.
 * Use only for local testing or quick demos. For production, put the key on a server.
 */

// ===== Paste your Gemini API key here for local testing (NOT SAFE for production) =====
const API_KEY = "";
// ======================================================================================
const DEFAULT_MODEL = "gemini-2.0-flash";

export default function App() {
  // UI state
  const [theme, setTheme] = useState(() => localStorage.getItem("tm_theme") || "light");
  const [image, setImage] = useState(null);
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]); // array of strings
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  // Vendor dashboard state (keeps catalog)
  const [isVendorOpen, setIsVendorOpen] = useState(() =>
    JSON.parse(localStorage.getItem("tm_vendor_open") || "false")
  );
  const [vendorItems, setVendorItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tm_vendor_items") || "[]");
    } catch {
      return [];
    }
  });
  const [vendorForm, setVendorForm] = useState({
    id: null,
    name: "",
    type: "T-Shirt",
    price: "",
    size: "M",
    color: "",
    description: "",
    imageFile: null,
  });
  const vendorFileRef = useRef(null);

  // Persist theme and vendor state
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tm_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("tm_vendor_items", JSON.stringify(vendorItems));
  }, [vendorItems]);

  useEffect(() => {
    localStorage.setItem("tm_vendor_open", JSON.stringify(isVendorOpen));
  }, [isVendorOpen]);

  // Toast auto dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Drag & drop handlers
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragOver = (e) => {
      e.preventDefault();
      el.classList.add("drag-over");
    };
    const onDragLeave = () => el.classList.remove("drag-over");
    const onDrop = (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  // Helpers
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleFile = (file) => {
    setError("");
    if (!file.type.startsWith("image/")) return setError("Please upload an image file.");
    if (file.size > 1024 * 1024) return setError("Please upload an image smaller than 1MB.");
    setImage(file);
    setResults([]);
    setToast("Image loaded");
  };

  const onFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const removeImage = () => {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
    setResults([]);
    setToast("Image removed");
  };

  const resetAll = () => {
    removeImage();
    setCategory("");
    setResults([]);
    setError("");
    setToast("Reset complete");
  };

  // Local mock for recommendations (fallback)
  const generateLocalMock = async () => {
    await new Promise((r) => setTimeout(r, 600));
    const tmpl = {
      "T-Shirt": [
        "Pair with slim dark jeans and white canvas sneakers for everyday cool.",
        "Layer under a denim jacket with a neutral scarf for urban style.",
        "Tuck into high-waisted shorts with brown loafers for summer vibes.",
      ],
      Shirt: [
        "Combine with tailored chinos and leather loafers for smart-casual.",
        "Wear under a navy blazer with chinos for a polished look.",
        "Roll the sleeves, add white sneakers for an effortless refined outfit.",
      ],
      Dress: [
        "Add a denim jacket and ankle boots for a trendy layered look.",
        "Pair with delicate sandals and a straw bag for daytime elegance.",
        "Tuck a slim belt at the waist and add heels for evening style.",
      ],
      Shoes: [
        "Wear with tapered jeans and a clean tee for daily comfort.",
        "Pair with chinos and a shirt for semi-formal balance.",
        "Match with shorts and a casual tee for weekend energy.",
      ],
    };
    return tmpl[category] || [
      "Pair with dark jeans and crisp sneakers for a timeless look.",
      "Style with a neutral jacket and boots for elevated casual.",
      "Add a minimal accessory (watch or chain) to finish the outfit.",
    ];
  };

  // Call the Generative API (client-side). If API_KEY is empty or call fails -> fallback to local mock.
  const callGeminiGenerate = async ({ model = DEFAULT_MODEL, promptText = "", imageBase64 = null }) => {
    if (!API_KEY || API_KEY.trim() === "" || API_KEY === "<PASTE_YOUR_GEMINI_API_KEY_HERE>") {
      throw new Error("No API key provided (client-side).");
    }

    // Choose endpoint - many examples use generateText or generateContent. We'll attempt generateText.
    // If your account requires a different endpoint shape, you may need to adapt the request body.
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateText?key=${API_KEY}`;

    // Minimal request body: send prompt text, optionally attach the base64 as context in the prompt.
    let prompt = promptText;
    if (imageBase64) {
      // We attach a short hint describing there's an image. Many APIs allow image attachments in special fields;
      // attaching base64 inline in text isn't ideal, but some servers accept it. If your account expects a binary
      // image field, you'll need a server that forwards multipart/JSON — see server example.
      prompt += `\n\n[IMAGE_BASE64:${imageBase64.slice(0, 200)}...]\nProvide 3 short styling suggestions for this item in the category ${category}.`;
    }

    const body = {
      // This shape may vary between API versions. If your project requires a different shape, adapt accordingly.
      prompt: prompt,
      maxOutputTokens: 256,
      temperature: 0.7,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Generative API error: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    return json;
  };

  // Extract text suggestions from common response shapes. Returns an array of strings.
  const extractSuggestionsFromResponse = (json) => {
    if (!json) return null;

    // Heuristic 1: new-style candidate content arrays
    // e.g. { candidates: [ { output: [{ content: "..." }] } ] } or { output: [{ content: "..." }] }
    try {
      // handle: json.candidates[0].output[0].content
      const cand = json.candidates?.[0];
      if (cand) {
        const out0 = cand.output?.[0];
        if (out0 && typeof out0.content === "string") {
          return splitToSuggestions(out0.content);
        }
      }
    } catch (e) {}

    try {
      // handle: json.output[0].content
      const out0 = json.output?.[0];
      if (out0 && typeof out0.content === "string") {
        return splitToSuggestions(out0.content);
      }
    } catch (e) {}

    // Older / other shapes: json.text or json.outputText or json.result
    if (typeof json.text === "string") return splitToSuggestions(json.text);
    if (typeof json.outputText === "string") return splitToSuggestions(json.outputText);
    if (typeof json.result === "string") return splitToSuggestions(json.result);

    // As a last fallback, find any first string deeply
    const findFirstString = (obj) => {
      if (!obj) return null;
      if (typeof obj === "string") return obj;
      if (Array.isArray(obj)) {
        for (const el of obj) {
          const s = findFirstString(el);
          if (s) return s;
        }
      } else if (typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const s = findFirstString(obj[k]);
          if (s) return s;
        }
      }
      return null;
    };
    const anyText = findFirstString(json);
    if (anyText) return splitToSuggestions(anyText);

    // nothing usable
    return null;
  };

  // Utility: split returned text into up to 3 suggestion strings
  const splitToSuggestions = (text) => {
    if (!text) return [];
    // split using numbered list or newlines
    // Normalize bullets and numbers to split
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // If many short lines, return first 3 lines
    if (lines.length >= 3) return lines.slice(0, 3);

    // Otherwise split by sentence punctuation (.), ? or ; into pieces
    const sentences = text
      .split(/(?<=\.)\s+|(?<=\?)\s+|(?<=\!)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length >= 3) return sentences.slice(0, 3);

    // fallback: return single-element array with whole text
    return [text.trim()];
  };

  // Main recommendation call
  const getRecommendation = async () => {
    setToast(null);
    setError("");
    setResults([]);
    if (!image) {
      setError("Please upload an image first.");
      return;
    }
    if (!category) {
      setError("Please choose a category.");
      return;
    }

    setLoading(true);
    try {
      // convert image to base64 for potential inclusion
      const base64 = await toBase64(image);

      // If a client API key is present in this file, try calling Gemini.
      if (API_KEY && API_KEY.trim() !== "" && API_KEY !== "<PASTE_YOUR_GEMINI_API_KEY_HERE>") {
        try {
          const promptText = `You are a fashion assistant. Provide 3 concise styling suggestions for this item in the category "${category}". Keep suggestions short (one sentence each).`;
          const json = await callGeminiGenerate({ model: DEFAULT_MODEL, promptText, imageBase64: base64 });
          const suggestions = extractSuggestionsFromResponse(json);
          if (suggestions && suggestions.length) {
            setResults(suggestions.slice(0, 3));
            setToast("Recommendations ready (from Gemini)");
            setLoading(false);
            return;
          } else {
            // if API returned but we couldn't parse, fall back to mock
            console.warn("Generative API returned but no parseable text, falling back to local mock", json);
          }
        } catch (apiErr) {
          console.error("Gemini call error:", apiErr);
          // continue to fallback
        }
      }

      // Fallback: local mock suggestions
      const suggestions = await generateLocalMock();
      setResults(suggestions.slice(0, 3));
      setToast("Recommendations ready (local demo)");
    } catch (e) {
      console.error(e);
      setError("Failed to prepare recommendations.");
    } finally {
      setLoading(false);
    }
  };

  // Actions on each suggestion
  const speakText = (text) => {
    if (!("speechSynthesis" in window)) {
      setToast("Speech not supported");
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard");
    } catch {
      setToast("Copy failed");
    }
  };

  const downloadTextAsFile = (text, index) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tryMate_reco_${index + 1}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Downloaded suggestion");
  };

  // ---------------- Vendor dashboard functions ----------------
  const handleVendorInput = (k, v) => {
    setVendorForm((s) => ({ ...s, [k]: v }));
  };

  const onVendorImageChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setToast("Vendor image must be an image file");
      return;
    }
    if (f.size > 1024 * 1024) {
      setToast("Vendor image must be < 1MB");
      return;
    }
    setVendorForm((s) => ({ ...s, imageFile: f }));
  };

  const clearVendorForm = () =>
    setVendorForm({ id: null, name: "", type: "T-Shirt", price: "", size: "M", color: "", description: "", imageFile: null });

  const saveVendorItem = async (e) => {
    e?.preventDefault();
    if (!vendorForm.name || !vendorForm.price) {
      setToast("Please provide name and price");
      return;
    }

    let imageUrl = null;
    if (vendorForm.imageFile) {
      imageUrl = URL.createObjectURL(vendorForm.imageFile);
    }

    if (vendorForm.id) {
      setVendorItems((items) =>
        items.map((it) =>
          it.id === vendorForm.id
            ? {
                ...it,
                name: vendorForm.name,
                type: vendorForm.type,
                price: vendorForm.price,
                size: vendorForm.size,
                color: vendorForm.color,
                description: vendorForm.description,
                imageUrl: vendorForm.imageFile ? imageUrl : it.imageUrl,
              }
            : it
        )
      );
      setToast("Item updated");
    } else {
      const newItem = {
        id: Date.now().toString(),
        name: vendorForm.name,
        type: vendorForm.type,
        price: vendorForm.price,
        size: vendorForm.size,
        color: vendorForm.color,
        description: vendorForm.description,
        imageUrl,
      };
      setVendorItems((s) => [newItem, ...s]);
      setToast("Item added to catalog");
    }

    clearVendorForm();
    if (vendorFileRef.current) vendorFileRef.current.value = "";
  };

  const editVendorItem = (id) => {
    const it = vendorItems.find((i) => i.id === id);
    if (!it) return;
    setVendorForm({
      id: it.id,
      name: it.name,
      type: it.type,
      price: it.price,
      size: it.size || "M",
      color: it.color || "",
      description: it.description || "",
      imageFile: null,
    });
    setIsVendorOpen(true);
  };

  const deleteVendorItem = (id) => {
    if (!window.confirm("Delete this item from your catalog?")) return;
    setVendorItems((s) => s.filter((i) => i.id !== id));
    setToast("Item deleted");
  };

  const renderVendorImage = (it) => {
    if (it.imageUrl) return it.imageUrl;
    return null;
  };

  return (
    <div className="tm-root" role="application">
      <header className="tm-header">
        <div className="brand">
          <div className="logo">👗</div>
          <div>
            <h1 className="brand-title">TryMate</h1>
            <div className="brand-sub">AI Fashion Recommender</div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="theme-toggle"
            aria-label="Toggle theme"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="Toggle theme"
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>

          <button
            className="theme-toggle"
            aria-pressed={isVendorOpen}
            onClick={() => setIsVendorOpen((s) => !s)}
            title="Open Vendor Dashboard"
          >
            🧾 Vendor
          </button>
        </div>
      </header>

      <main className="tm-main">
        <section className="left-col">
          <div
            ref={dropRef}
            className="upload-card"
            tabIndex={0}
            aria-label="File upload drop area"
            onKeyDown={(e) => {
              if (e.key === "Enter") fileRef.current?.click();
            }}
            onClick={() => fileRef.current?.click()}
          >
            {image ? (
              <>
                <div className="preview-inner">
                  <img src={URL.createObjectURL(image)} alt="Uploaded preview" className="preview-img" />
                  <button className="remove-image" onClick={(e) => { e.stopPropagation(); removeImage(); }} aria-label="Remove image">✖</button>
                </div>

                <div className="meta-row">
                  <div className="meta-left">
                    <div className="meta-item"><strong>{image.name}</strong></div>
                    <div className="meta-item subtle">{(image.size / 1024).toFixed(0)} KB • {image.type.split("/")[1]}</div>
                  </div>
                  <div className="meta-right">
                    <button className="small-btn" onClick={(e) => { e.stopPropagation(); setToast("Preview cleared"); removeImage(); }}>Replace</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="drop-placeholder">
                <div className="big-icon">📤</div>
                <div className="drop-title">Click or drop an image here</div>
                <div className="drop-sub">Supported: PNG/JPG — under 1MB</div>
                <div className="drop-hint">Press Enter to open file picker</div>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileInput} />
          </div>

          <div className="controls">
            <label className="label">Select category</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">-- Choose category --</option>
              <option value="T-Shirt">T-Shirt</option>
              <option value="Shirt">Shirt</option>
              <option value="Pants">Pants</option>
              <option value="Jeans">Jeans</option>
              <option value="Dress">Dress</option>
              <option value="Skirt">Skirt</option>
              <option value="Shoes">Shoes</option>
              <option value="Jacket">Jacket</option>
            </select>

            <div className="action-row">
              <button className="btn primary" onClick={getRecommendation} disabled={loading}>Get Recommendation</button>
              <button className="btn ghost" onClick={resetAll}>Reset</button>
            </div>

            <div className="hint-row">
              <div className="hint">Model:</div>
              <div className="hint strong">{DEFAULT_MODEL}</div>
            </div>

            {error && <div className="error">{error}</div>}
          </div>
        </section>

        <section className="right-col">
          <div className="panel">
            <h3 className="panel-title">AI Recommendations</h3>

            {!results.length && !loading && (
              <div className="empty">
                <div className="empty-emoji">🤖</div>
                <div className="empty-text">No recommendations yet. Upload an item and click <strong>Get Recommendation</strong>.</div>
              </div>
            )}

            {loading && (
              <div className="loading-block">
                <div className="spinner" aria-hidden />
                <div className="loading-text">Analyzing image & preparing suggestions…</div>
              </div>
            )}

            {results.length > 0 && (
              <ul className="results-list" role="list">
                {results.map((r, i) => (
                  <li key={i} className="result-item">
                    <div className="result-index">{i + 1}</div>
                    <div className="result-body">
                      <div className="result-text">{r}</div>
                      <div className="result-actions">
                        <button className="icon-btn" title="Copy" onClick={() => copyText(r)} aria-label={`Copy suggestion ${i + 1}`}>📋</button>
                        <button className="icon-btn" title="Speak" onClick={() => speakText(r)} aria-label={`Speak suggestion ${i + 1}`}>🔊</button>
                        <button className="icon-btn" title="Download" onClick={() => downloadTextAsFile(r, i)} aria-label={`Download suggestion ${i + 1}`}>⬇️</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel small">
            <h4 className="panel-title">Quick actions</h4>
            <div className="small-actions">
              <button className="tiny" onClick={() => { setResults([]); setToast("Cleared suggestions"); }}>Clear Suggestions</button>
              <button className="tiny" onClick={() => { if (!results.length) setResults(["Pair with dark jeans and white sneakers.", "Layer with a denim jacket.", "Add a leather belt for polish."]); setToast("Added demo suggestions"); }}>Load Demo</button>
            </div>
            <div className="credits">UI mode • Local demo suggestions for demo & presentation</div>
          </div>

          {isVendorOpen && (
            <div className="panel vendor-panel">
              <h4 className="panel-title">Vendor Dashboard</h4>

              <form onSubmit={saveVendorItem} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="select" placeholder="Item name" value={vendorForm.name} onChange={(e) => handleVendorInput("name", e.target.value)} style={{ flex: 2, minWidth: 0 }} />
                  <select className="select" value={vendorForm.type} onChange={(e) => handleVendorInput("type", e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                    <option>T-Shirt</option>
                    <option>Shirt</option>
                    <option>Pants</option>
                    <option>Jeans</option>
                    <option>Dress</option>
                    <option>Skirt</option>
                    <option>Shoes</option>
                    <option>Jacket</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="select" placeholder="Price (e.g. 799)" value={vendorForm.price} onChange={(e) => handleVendorInput("price", e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                  <input className="select" placeholder="Size (S/M/L)" value={vendorForm.size} onChange={(e) => handleVendorInput("size", e.target.value)} style={{ width: 90, minWidth: 0 }} />
                  <input className="select" placeholder="Color" value={vendorForm.color} onChange={(e) => handleVendorInput("color", e.target.value)} style={{ width: 120, minWidth: 0 }} />
                </div>

                <textarea className="select" placeholder="Short description" value={vendorForm.description} onChange={(e) => handleVendorInput("description", e.target.value)} rows={2} />

                <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
                  <input ref={vendorFileRef} type="file" accept="image/*" onChange={onVendorImageChange} style={{ width: "100%", maxWidth: "100%" }} />
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Image optional — under 1MB</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary" type="submit">{vendorForm.id ? "Update Item" : "Add Item"}</button>
                  <button className="btn ghost" type="button" onClick={() => { clearVendorForm(); if (vendorFileRef.current) vendorFileRef.current.value = ""; setToast("Form cleared"); }}>Clear</button>
                </div>
              </form>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Your Catalog ({vendorItems.length})</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Local only • persisted in browser</div>
                </div>

                {vendorItems.length === 0 ? (
                  <div className="empty"><div className="empty-text">No items yet — add dresses or other products here.</div></div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {vendorItems.map((it) => (
                      <li key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "linear-gradient(180deg, rgba(0,0,0,0.02), transparent)", padding: 8, borderRadius: 8 }}>
                        <div style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 8, overflow: "hidden", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {renderVendorImage(it) ? <img src={renderVendorImage(it)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={it.name} /> : <div style={{ fontSize: 24 }}>🧾</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{it.name} <span style={{ fontSize: 12, color: "var(--muted)" }}>• {it.type}</span></div>
                          <div style={{ fontSize: 13, color: "var(--muted)" }}>₹ {it.price} • {it.size} {it.color ? `• ${it.color}` : ""}</div>
                          {it.description && <div style={{ fontSize: 13, marginTop: 6 }}>{it.description}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button className="icon-btn" title="Edit" onClick={() => editVendorItem(it.id)}>✏️</button>
                          <button className="icon-btn" title="Delete" onClick={() => deleteVendorItem(it.id)}>🗑️</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="tm-footer">
        <div>Made with ❤️ • TryMate</div>
        <div className="footer-right">v1 • UI upgrade</div>
      </footer>

      {/* Loader overlay */}
      {loading && (
        <div className="overlay" aria-hidden>
          <div className="overlay-card">
            <div className="spinner large" />
            <div className="overlay-text">Processing — please wait…</div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
