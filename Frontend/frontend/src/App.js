import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/transcrever`
  : "http://localhost:5000/transcrever";

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function exportTXT(transcricao, segmentos, nomeArquivo) {
  let conteudo = "TRANSCRIÇÃO\n";
  conteudo += "=".repeat(40) + "\n\n";
  conteudo += transcricao + "\n\n";
  if (segmentos && segmentos.length > 1) {
    conteudo += "\nSEGMENTOS COM TIMESTAMP\n";
    conteudo += "=".repeat(40) + "\n\n";
    segmentos.forEach(s => {
      conteudo += `[${formatTime(s.inicio)} --> ${formatTime(s.fim)}] ${s.texto}\n`;
    });
  }
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo || "transcricao"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportDOCX(transcricao, segmentos, nomeArquivo) {
  if (!window.docx) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/docx/7.8.2/docx.umd.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;

  const children = [
    new Paragraph({
      text: "Transcrição",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: transcricao, size: 24 })],
      spacing: { after: 400, line: 360 },
    }),
  ];

  if (segmentos && segmentos.length > 1) {
    children.push(
      new Paragraph({
        text: "Segmentos com Timestamp",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );
    segmentos.forEach(s => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${formatTime(s.inicio)} → ${formatTime(s.fim)}]  `, bold: true, size: 20, color: "888888" }),
            new TextRun({ text: s.texto, size: 22 }),
          ],
          spacing: { after: 120 },
        })
      );
    });
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo || "transcricao"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function LoadingSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "48px 32px" }}>
      <div style={{ position: "relative", width: 52, height: 52 }}>
        <div style={{
          position: "absolute", inset: 0,
          border: "2px solid #2a2a2a",
          borderTopColor: "#ffffff",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: 7,
          border: "2px solid transparent",
          borderTopColor: "#555",
          borderRadius: "50%",
          animation: "spin 1.3s linear infinite reverse",
        }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#ffffff", marginBottom: 6, letterSpacing: "0.04em" }}>
          TRANSCREVENDO
        </div>
        <div style={{ fontSize: 13, color: "#666", letterSpacing: "0.06em" }}>
          AGUARDE ALGUNS INSTANTES
        </div>
      </div>
    </div>
  );
}

function ExportDropdown({ onExportTXT, onExportDOCX }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const handleBlur = () => setTimeout(() => setOpen(false), 150);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        className="btn-ghost"
        onClick={() => setOpen(o => !o)}
        onBlur={handleBlur}
        style={{ display: "flex", alignItems: "center", gap: 7 }}
      >
        EXPORTAR
        <span style={{
          fontSize: 8,
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>▲</span>
      </button>
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          right: 0,
          background: "#1a1a1a",
          border: "1px solid #2e2e2e",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          minWidth: 130,
          zIndex: 10,
        }}>
          <button className="dropdown-item" onMouseDown={onExportTXT}>
            <span>📄</span> TXT
          </button>
          <button className="dropdown-item" onMouseDown={onExportDOCX}>
            <span>📝</span> DOCX
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const inputRef = useRef();

  // Título da aba do navegador
  useEffect(() => {
    document.title = "Transcreve.ai";
  }, []);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const transcrever = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("audio", file);
    try {
      const res = await fetch(API_URL, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || "Erro desconhecido");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copiar = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.transcricao);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetar = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setShowSegments(false);
  };

  const nomeBase = file ? file.name.replace(/\.[^.]+$/, "") : "transcricao";
  const handleExportTXT = () => exportTXT(result.transcricao, result.segmentos, nomeBase);
  const handleExportDOCX = async () => {
    try { await exportDOCX(result.transcricao, result.segmentos, nomeBase); }
    catch (e) { alert("Erro ao exportar DOCX: " + e.message); }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Gotham SSm A', 'Gotham SSm B', 'Gotham', 'Montserrat', sans-serif",
      color: "#f0f0f0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0d0d0d;
          --surface: #161616;
          --surface2: #1e1e1e;
          --border: #2a2a2a;
          --border2: #333;
          --text: #f0f0f0;
          --muted: #666;
          --muted2: #888;
          --accent: #ffffff;
          --accent-dim: #1a1a1a;
          --error: #e05555;
          --radius: 14px;
        }

        body { background: var(--bg); }

        .header {
          padding: 36px 48px 0;
          display: flex; align-items: center; justify-content: space-between;
        }

        .logo {
          font-size: 20px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text); cursor: pointer;
        }
        .logo span { color: var(--muted2); font-weight: 300; }

        .badge {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          border: 1px solid var(--border);
          border-radius: 99px;
          padding: 4px 12px;
        }

        .main {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 56px 24px; gap: 44px;
        }

        .hero { text-align: center; max-width: 560px; }
        .hero h1 {
          font-size: clamp(40px, 5vw, 62px);
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.1;
          margin-bottom: 18px;
          text-transform: uppercase;
          color: var(--text);
        }
        .hero h1 span { color: var(--muted); font-weight: 300; }
        .hero p {
          font-size: 15px;
          font-weight: 300;
          color: var(--muted2);
          line-height: 1.7;
          letter-spacing: 0.03em;
        }

        .card {
          width: 100%; max-width: 580px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.3);
        }

        .dropzone {
          padding: 52px 40px; cursor: pointer;
          transition: background 0.2s; text-align: center;
          border-bottom: 1px solid var(--border);
        }
        .dropzone:hover, .dropzone.active { background: var(--surface2); }

        .dropzone-icon {
          width: 52px; height: 52px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px; transition: background 0.2s;
        }
        .dropzone:hover .dropzone-icon {
          background: var(--border);
        }

        .dropzone-title {
          font-size: 18px; font-weight: 500;
          letter-spacing: 0.04em; text-transform: uppercase;
          margin-bottom: 8px; color: var(--text);
        }
        .dropzone-sub {
          font-size: 12px; font-weight: 300;
          color: var(--muted); letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .file-info {
          display: flex; align-items: center; gap: 14px;
          padding: 20px 40px; border-bottom: 1px solid var(--border);
          background: var(--surface2);
        }
        .file-icon {
          width: 38px; height: 38px; background: var(--border);
          border-radius: 8px; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0; font-size: 16px;
        }
        .file-name {
          font-size: 15px; font-weight: 400; letter-spacing: 0.02em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
        }
        .file-size {
          font-size: 12px; font-weight: 300;
          color: var(--muted); flex-shrink: 0; letter-spacing: 0.06em;
        }

        .actions {
          padding: 20px 40px; display: flex; gap: 12px; align-items: center;
        }

        .btn-primary {
          flex: 1; background: #ffffff; color: #0d0d0d;
          border: none; border-radius: 8px; padding: 14px 28px;
          font-family: inherit; font-size: 14px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          cursor: pointer; transition: opacity 0.2s, transform 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.25; cursor: not-allowed; }

        .btn-ghost {
          background: transparent; border: 1px solid var(--border2);
          border-radius: 8px; padding: 13px 16px;
          font-family: inherit; font-size: 12px; font-weight: 500;
          color: var(--muted2); cursor: pointer; transition: all 0.15s;
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

        .dropdown-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 12px 18px;
          background: none; border: none;
          font-family: inherit; font-size: 13px; font-weight: 400;
          color: var(--text); cursor: pointer; text-align: left;
          letter-spacing: 0.06em; text-transform: uppercase;
          transition: background 0.15s;
        }
        .dropdown-item:hover { background: var(--surface2); }
        .dropdown-item + .dropdown-item { border-top: 1px solid var(--border); }

        .result { animation: fadeUp 0.3s ease forwards; }

        .result-header {
          padding: 16px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border);
        }
        .result-label {
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
        }
        .result-btns { display: flex; gap: 8px; align-items: center; }

        .result-text {
          padding: 28px 40px; font-size: 17px; font-weight: 300;
          line-height: 1.85; letter-spacing: 0.01em;
          border-bottom: 1px solid var(--border);
          color: var(--text);
        }

        .seg-toggle {
          padding: 14px 40px;
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; transition: background 0.15s;
          border-bottom: 1px solid var(--border);
        }
        .seg-toggle:hover { background: var(--surface2); }
        .seg-label {
          font-size: 11px; font-weight: 500;
          color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase;
        }
        .seg-arrow { font-size: 9px; color: var(--muted); transition: transform 0.2s; }
        .seg-arrow.open { transform: rotate(180deg); }

        .seg-item {
          display: grid; grid-template-columns: 56px 1fr;
          gap: 16px; padding: 13px 40px;
          border-bottom: 1px solid var(--border); align-items: baseline;
        }
        .seg-item:last-child { border-bottom: none; }
        .seg-time {
          font-size: 11px; font-weight: 500;
          color: var(--muted); letter-spacing: 0.06em;
        }
        .seg-text { font-size: 15px; font-weight: 300; line-height: 1.65; color: var(--text); }

        .error-box {
          padding: 16px 40px; background: #1a0e0e;
          border-bottom: 1px solid #3a1a1a;
          display: flex; gap: 12px; align-items: flex-start;
        }
        .error-dot {
          width: 6px; height: 6px; background: var(--error);
          border-radius: 50%; margin-top: 7px; flex-shrink: 0;
        }
        .error-msg {
          font-size: 13px; font-weight: 400;
          color: var(--error); line-height: 1.5; letter-spacing: 0.02em;
        }

        .footer {
          padding: 28px 48px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .footer-txt {
          font-size: 11px; font-weight: 400;
          color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase;
        }
        .footer-sep { width: 3px; height: 3px; background: var(--border2); border-radius: 50%; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 640px) {
          .header { padding: 24px 20px 0; }
          .logo { font-size: 16px; }
          .main { padding: 36px 16px; gap: 32px; }
          .hero h1 { font-size: 36px; }
          .hero p { font-size: 14px; }
          .dropzone { padding: 40px 20px; }
          .file-info, .actions, .result-header, .result-text,
          .seg-toggle, .seg-item, .error-box { padding-left: 20px; padding-right: 20px; }
          .seg-item { grid-template-columns: 44px 1fr; gap: 10px; }
          .footer { padding: 20px; }
        }
      `}</style>

      {/* Header */}
      <header className="header">
        <a href="/" style={{ textDecoration: "none" }} className="logo">Transcreve<span>.ai</span></a>
        <div className="badge">Whisper / Base</div>
      </header>

      {/* Main */}
      <main className="main">

        {!result && !loading && (
          <div className="hero">
            <h1 style={{ whiteSpace: "nowrap" }}>Áudio para <span>texto</span></h1>
            <p>Envie qualquer arquivo de áudio e receba<br />a transcrição completa em segundos.</p>
          </div>
        )}

        <div className="card">

          {!file && !result && !loading && (
            <div
              className={`dropzone${dragging ? " active" : ""}`}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current.click()}
            >
              <input
                ref={inputRef} type="file"
                accept="audio/*,.ogg,.mp3,.wav,.m4a,.flac,.webm"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="dropzone-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 16V8m0 0l-3 3m3-3l3 3"/>
                  <path d="M20 16.7A4 4 0 0017 9h-1.3A7 7 0 104 15.3"/>
                </svg>
              </div>
              <div className="dropzone-title">Arraste um arquivo de áudio</div>
              <div className="dropzone-sub">ou clique para selecionar · mp3 wav ogg m4a flac</div>
            </div>
          )}

          {file && !result && !loading && (
            <div className="file-info">
              <div className="file-icon">🎵</div>
              <div className="file-name">{file.name}</div>
              <div className="file-size">{formatSize(file.size)}</div>
            </div>
          )}

          {loading && <LoadingSpinner />}

          {error && !loading && (
            <div className="error-box">
              <div className="error-dot" />
              <div className="error-msg">{error}</div>
            </div>
          )}

          {result && !loading && (
            <div className="result">
              <div className="result-header">
                <span className="result-label">Transcrição</span>
                <div className="result-btns">
                  <button className="btn-ghost" onClick={copiar}>{copied ? "✓ Copiado" : "Copiar"}</button>
                  <ExportDropdown onExportTXT={handleExportTXT} onExportDOCX={handleExportDOCX} />
                  <button className="btn-ghost" onClick={resetar}>Nova</button>
                </div>
              </div>
              <div className="result-text">{result.transcricao}</div>

              {result.segmentos && result.segmentos.length > 1 && (
                <>
                  <div className="seg-toggle" onClick={() => setShowSegments(s => !s)}>
                    <span className="seg-label">{result.segmentos.length} segmentos com timestamp</span>
                    <span className={`seg-arrow${showSegments ? " open" : ""}`}>▲</span>
                  </div>
                  {showSegments && (
                    <div>
                      {result.segmentos.map((s, i) => (
                        <div key={i} className="seg-item">
                          <span className="seg-time">{formatTime(s.inicio)}</span>
                          <span className="seg-text">{s.texto}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {file && !result && !loading && (
            <div className="actions">
              <button className="btn-primary" onClick={transcrever}>→ Transcrever</button>
              <button className="btn-ghost" onClick={resetar}>Cancelar</button>
            </div>
          )}

          {!file && !result && !loading && (
            <div className="actions">
              <button className="btn-primary" onClick={() => inputRef.current.click()}>
                Selecionar Arquivo
              </button>
            </div>
          )}

          {error && !loading && (
            <div className="actions">
              <button className="btn-primary" onClick={transcrever}>→ Tentar Novamente</button>
              <button className="btn-ghost" onClick={resetar}>Cancelar</button>
            </div>
          )}

        </div>
      </main>

      <footer className="footer">
        <span className="footer-txt">OpenAI Whisper</span>
        <div className="footer-sep" />
        <span className="footer-txt">Hugging Face</span>
        <div className="footer-sep" />
        <span className="footer-txt">Vercel</span>
        <div className="footer-sep" />
        <span className="footer-txt">by daniel mischiatti</span>
      </footer>
    </div>
  );
}