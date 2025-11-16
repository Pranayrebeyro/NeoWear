// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import "./App.css";

/*
  TryMate - App.jsx (Vercel endpoint)
  Make sure you replace the PROXY_ENDPOINT with your actual Vercel URL:
    https://<your-vercel-app>.vercel.app/api/generate
*/
const DEFAULT_MODEL = "gemini-2.0-flash";
// <-- replace the domain below with your deployed Vercel app domain
const PROXY_ENDPOINT = "https://your-vercel-app.vercel.app/api/generate";

export default function App() {
  // UI state
  const [theme, setTheme] = useState(() => localStorage.getItem("tm_theme") || "light");
  const [image, setImage] = useState(null);
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  // vendor state
  const [isVendorOpen, setIsVendorOpen] = useState(() => JSON.parse(localStorage.getItem("tm_vendor_open") || "false"));
  const [vendorItems, setVendorItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tm_vendor_items") || "[]"); } catch { return []; }
  });
  const [vendorForm, setVendorForm] = useState({ id:null, name:"", type:"T-Shirt", price:"", size:"M", color:"", description:"", imageFile:null });
  const vendorFileRef = useRef(null);

  // persist theme & vendor items
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("tm_theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("tm_vendor_items", JSON.stringify(vendorItems)); }, [vendorItems]);
  useEffect(() => { localStorage.setItem("tm_vendor_open", JSON.stringify(isVendorOpen)); }, [isVendorOpen]);

  // toast auto-dismiss
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id); }, [toast]);

  // drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e) => { e.preventDefault(); el.classList.add("drag-over"); };
    const onDragLeave = () => el.classList.remove("drag-over");
    const onDrop = (e) => { e.preventDefault(); el.classList.remove("drag-over"); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => { el.removeEventListener("dragover", onDragOver); el.removeEventListener("dragleave", onDragLeave); el.removeEventListener("drop", onDrop); };
  }, []);

  // helpers
  const toBase64 = (file) => new Promise((resolve, reject) => {
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
  const onFileInput = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
  const removeImage = () => { setImage(null); if (fileRef.current) fileRef.current.value = ""; setResults([]); setToast("Image removed"); };
  const resetAll = () => { removeImage(); setCategory(""); setResults([]); setError(""); setToast("Reset complete"); };

  // local fallback suggestions
  const generateLocalMock = async () => {
    await new Promise((r) => setTimeout(r, 450));
    const tmpl = {
      "T-Shirt":["Pair with slim dark jeans and white canvas sneakers.","Layer under a denim jacket.","Tuck into high-waisted shorts for summer."],
      "Dress":["Add a denim jacket and ankle boots.","Pair with delicate sandals.","Tuck a slim belt at the waist for evening."]
    };
    return tmpl[category] || ["Pair with dark jeans and crisp sneakers.","Style with a neutral jacket and boots.","Add a minimal accessory to finish the look."];
  };

  // proxy call to Vercel function
  const callProxyGenerate = async ({ model = DEFAULT_MODEL, promptText = "", imageBase64 = null }) => {
    const payload = { model, prompt: promptText };
    if (imageBase64) payload.imageBase64 = imageBase64;

    // network call
    const resp = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Server ${resp.status}: ${txt}`);
    }
    return resp.json();
  };

  // extract suggestions (robust)
  const extractSuggestionsFromResponse = (json) => {
    if (!json) return null;
    // multiple possible shapes - try common ones
    const tryTextFields = (o) => {
      if (!o) return null;
      if (typeof o === "string") return o;
      if (Array.isArray(o)) {
        for (const e of o) {
          const s = tryTextFields(e);
          if (s) return s;
        }
      } else if (typeof o === "object") {
        for (const k of Object.keys(o)) {
          const s = tryTextFields(o[k]);
          if (s) return s;
        }
      }
      return null;
    };

    const possible = tryTextFields(json);
    if (!possible) return null;
    // split into 1-3 suggestions
    const lines = possible.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 3) return lines.slice(0,3);
    const sentences = possible.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
    return sentences.length ? sentences.slice(0,3) : [possible];
  };

  // main
  const getRecommendation = async () => {
    setToast(null); setError(""); setResults([]);
    if (!image) { setError("Please upload an image first."); return; }
    if (!category) { setError("Please choose a category."); return; }
    setLoading(true);
    try {
      const base64 = await toBase64(image);
      const prompt = `You are a helpful fashion assistant. Analyze this image and provide 3 short styling suggestions for a ${category}.`;
      try {
        const json = await callProxyGenerate({ model: DEFAULT_MODEL, promptText: prompt, imageBase64: base64 });
        console.log("Proxy response:", json);
        const suggestions = extractSuggestionsFromResponse(json);
        if (suggestions && suggestions.length) { setResults(suggestions); setToast("Recommendations ready (model)"); setLoading(false); return; }
      } catch (err) {
        console.error("Proxy call error:", err);
        // network or server error -> inform user
        if (err.message?.includes("Failed to fetch") || err.message?.includes("ECONNREFUSED") || err.message?.includes("NetworkError")) {
          setError("Cannot reach backend. Ensure Vercel function deployed and PROXY_ENDPOINT set correctly.");
        } else {
          setError(err.message);
        }
      }
      // fallback
      const local = await generateLocalMock();
      setResults(local.slice(0,3));
      setToast("Recommendations ready (local demo)");
    } catch (e) {
      console.error(e);
      setError("Failed to prepare recommendations.");
    } finally {
      setLoading(false);
    }
  };

  // suggestions actions
  const speakText = (text) => { if (!("speechSynthesis" in window)) { setToast("Speech not supported"); return; } const u = new SpeechSynthesisUtterance(text); u.lang="en-US"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); };
  const copyText = async (text) => { try { await navigator.clipboard.writeText(text); setToast("Copied"); } catch { setToast("Copy failed"); } };
  const downloadTextAsFile = (text, i) => { const b = new Blob([text], { type: "text/plain" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href=u; a.download=`tryMate_reco_${i+1}.txt`; a.click(); URL.revokeObjectURL(u); setToast("Downloaded"); };

  // vendor helpers
  const handleVendorInput = (k,v) => setVendorForm(s => ({ ...s, [k]: v }));
  const onVendorImageChange = (e) => { const f = e.target.files?.[0]; if (!f) return; if (!f.type.startsWith("image/")) { setToast("Vendor image must be image"); return; } if (f.size > 1024*1024) { setToast("Vendor image <1MB"); return; } setVendorForm(s => ({ ...s, imageFile: f })); };
  const clearVendorForm = () => setVendorForm({ id:null, name:"", type:"T-Shirt", price:"", size:"M", color:"", description:"", imageFile:null });
  const saveVendorItem = (e) => { e?.preventDefault(); if (!vendorForm.name || !vendorForm.price) { setToast("Provide name & price"); return; } let imageUrl = null; if (vendorForm.imageFile) imageUrl = URL.createObjectURL(vendorForm.imageFile); if (vendorForm.id) { setVendorItems(items => items.map(it => it.id === vendorForm.id ? { ...it, name:vendorForm.name, type:vendorForm.type, price:vendorForm.price, size:vendorForm.size, color:vendorForm.color, description:vendorForm.description, imageUrl: vendorForm.imageFile ? imageUrl : it.imageUrl } : it)); setToast("Item updated"); } else { const newItem = { id: Date.now().toString(), name:vendorForm.name, type:vendorForm.type, price:vendorForm.price, size:vendorForm.size, color:vendorForm.color, description:vendorForm.description, imageUrl }; setVendorItems(s => [newItem, ...s]); setToast("Item added"); } clearVendorForm(); if (vendorFileRef.current) vendorFileRef.current.value = ""; };
  const editVendorItem = (id) => { const it = vendorItems.find(i => i.id === id); if (!it) return; setVendorForm({ id: it.id, name: it.name, type: it.type, price: it.price, size: it.size||"M", color: it.color||"", description: it.description||"", imageFile: null }); setIsVendorOpen(true); };
  const deleteVendorItem = (id) => { if (!window.confirm("Delete this item?")) return; setVendorItems(s => s.filter(i => i.id !== id)); setToast("Deleted"); };
  const renderVendorImage = (it) => it.imageUrl || null;

  return (
    <div className="tm-root" role="application">
      <header className="tm-header">
        <div className="brand"><div className="logo">👗</div><div><h1 className="brand-title">TryMate</h1><div className="brand-sub">AI Fashion Recommender</div></div></div>
        <div className="header-actions">
          <button className="theme-toggle" aria-label="Toggle theme" onClick={() => setTheme(t => t==="light" ? "dark" : "light")}>{theme==="light" ? "🌙 Dark" : "☀️ Light"}</button>
          <button className="theme-toggle" aria-pressed={isVendorOpen} onClick={() => setIsVendorOpen(s=>!s)}>🧾 Vendor</button>
        </div>
      </header>

      <main className="tm-main">
        <section className="left-col">
          <div ref={dropRef} className="upload-card" tabIndex={0} aria-label="File upload area" onKeyDown={(e)=>{ if (e.key==="Enter") fileRef.current?.click(); }} onClick={()=>fileRef.current?.click()}>
            {image ? (
              <>
                <div className="preview-inner"><img src={URL.createObjectURL(image)} alt="preview" className="preview-img"/><button className="remove-image" onClick={(e)=>{ e.stopPropagation(); removeImage(); }}>✖</button></div>
                <div className="meta-row"><div className="meta-left"><div className="meta-item"><strong>{image.name}</strong></div><div className="meta-item subtle">{(image.size/1024).toFixed(0)} KB • {image.type.split("/")[1]}</div></div><div className="meta-right"><button className="small-btn" onClick={(e)=>{ e.stopPropagation(); setToast("Preview cleared"); removeImage(); }}>Replace</button></div></div>
              </>
            ) : (
              <div className="drop-placeholder"><div className="big-icon">📤</div><div className="drop-title">Click or drop an image here</div><div className="drop-sub">PNG / JPG — under 1MB</div><div className="drop-hint">Press Enter to open file picker</div></div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileInput} />
          </div>

          <div className="controls">
            <label className="label">Select category</label>
            <select className="select" value={category} onChange={(e)=>setCategory(e.target.value)}><option value="">-- Choose category --</option><option value="T-Shirt">T-Shirt</option><option value="Shirt">Shirt</option><option value="Pants">Pants</option><option value="Jeans">Jeans</option><option value="Dress">Dress</option><option value="Skirt">Skirt</option><option value="Shoes">Shoes</option><option value="Jacket">Jacket</option></select>

            <div className="action-row"><button className="btn primary" onClick={getRecommendation} disabled={loading}>Get Recommendation</button><button className="btn ghost" onClick={resetAll}>Reset</button></div>

            <div className="hint-row"><div className="hint">Model:</div><div className="hint strong">{DEFAULT_MODEL}</div></div>
            {error && <div className="error">{error}</div>}
          </div>
        </section>

        <section className="right-col">
          <div className="panel">
            <h3 className="panel-title">AI Recommendations</h3>
            {!results.length && !loading && <div className="empty"><div className="empty-emoji">🤖</div><div className="empty-text">No recommendations yet. Upload an item and click <strong>Get Recommendation</strong>.</div></div>}
            {loading && <div className="loading-block"><div className="spinner" aria-hidden></div><div className="loading-text">Analyzing image & preparing suggestions…</div></div>}
            {results.length>0 && <ul className="results-list" role="list">{results.map((r,i)=>(
              <li key={i} className="result-item"><div className="result-index">{i+1}</div><div className="result-body"><div className="result-text">{r}</div><div className="result-actions"><button className="icon-btn" onClick={()=>copyText(r)}>📋</button><button className="icon-btn" onClick={()=>speakText(r)}>🔊</button><button className="icon-btn" onClick={()=>downloadTextAsFile(r,i)}>⬇️</button></div></div></li>
            ))}</ul>}
          </div>

          <div className="panel small"><h4 className="panel-title">Quick actions</h4><div className="small-actions"><button className="tiny" onClick={()=>{ setResults([]); setToast("Cleared suggestions"); }}>Clear Suggestions</button><button className="tiny" onClick={()=>{ if (!results.length) setResults(["Pair with dark jeans and white sneakers.","Layer with a denim jacket.","Add a leather belt for polish."]); setToast("Added demo suggestions"); }}>Load Demo</button></div><div className="credits">UI mode • Local demo suggestions for demo & presentation</div></div>

          {isVendorOpen && (
            <div className="panel vendor-panel">
              <h4 className="panel-title">Vendor Dashboard</h4>

              <form onSubmit={saveVendorItem} style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input className="select" placeholder="Item name" value={vendorForm.name} onChange={(e)=>handleVendorInput("name",e.target.value)} style={{flex:2,minWidth:0}} /><select className="select" value={vendorForm.type} onChange={(e)=>handleVendorInput("type",e.target.value)} style={{flex:1,minWidth:0}}><option>T-Shirt</option><option>Shirt</option><option>Pants</option><option>Jeans</option><option>Dress</option><option>Skirt</option><option>Shoes</option><option>Jacket</option></select></div>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input className="select" placeholder="Price (e.g. 799)" value={vendorForm.price} onChange={(e)=>handleVendorInput("price",e.target.value)} style={{flex:1,minWidth:0}} /><input className="select" placeholder="Size (S/M/L)" value={vendorForm.size} onChange={(e)=>handleVendorInput("size",e.target.value)} style={{width:90,minWidth:0}} /><input className="select" placeholder="Color" value={vendorForm.color} onChange={(e)=>handleVendorInput("color",e.target.value)} style={{width:120,minWidth:0}} /></div>

                <textarea className="select" placeholder="Short description" value={vendorForm.description} onChange={(e)=>handleVendorInput("description",e.target.value)} rows={2} />

                <div style={{display:"flex",gap:8,alignItems:"center",width:"100%",flexWrap:"wrap"}}><input ref={vendorFileRef} type="file" accept="image/*" onChange={onVendorImageChange} style={{width:"100%",maxWidth:"100%"}} /><div style={{fontSize:12,color:"var(--muted)"}}>Image optional — under 1MB</div></div>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn primary" type="submit">{vendorForm.id ? "Update Item" : "Add Item"}</button><button className="btn ghost" type="button" onClick={() => { clearVendorForm(); if (vendorFileRef.current) vendorFileRef.current.value = ""; setToast("Form cleared"); }}>Clear</button></div>
              </form>

              <div style={{marginTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontWeight:700}}>Your Catalog ({vendorItems.length})</div><div style={{fontSize:12,color:"var(--muted)"}}>Local only • persisted in browser</div></div>

                {vendorItems.length===0 ? <div className="empty"><div className="empty-text">No items yet — add dresses or other products here.</div></div> : (
                  <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:10}}>
                    {vendorItems.map(it => (
                      <li key={it.id} style={{display:"flex",gap:8,alignItems:"center",background:"linear-gradient(180deg, rgba(0,0,0,0.02), transparent)",padding:8,borderRadius:8}}>
                        <div style={{width:64,height:64,flex:"0 0 64px",borderRadius:8,overflow:"hidden",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{renderVendorImage(it) ? <img src={renderVendorImage(it)} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={it.name} /> : <div style={{fontSize:24}}>🧾</div>}</div>
                        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>{it.name} <span style={{fontSize:12,color:"var(--muted)"}}>• {it.type}</span></div><div style={{fontSize:13,color:"var(--muted)"}}>₹ {it.price} • {it.size} {it.color ? `• ${it.color}` : ""}</div>{it.description && <div style={{fontSize:13,marginTop:6}}>{it.description}</div>}</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}><button className="icon-btn" title="Edit" onClick={() => editVendorItem(it.id)}>✏️</button><button className="icon-btn" title="Delete" onClick={() => deleteVendorItem(it.id)}>🗑️</button></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="tm-footer"><div>Made with ❤️ • TryMate</div><div className="footer-right">v1 • UI upgrade</div></footer>

      {loading && <div className="overlay" aria-hidden><div className="overlay-card"><div className="spinner large" /><div className="overlay-text">Processing — please wait…</div></div></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
