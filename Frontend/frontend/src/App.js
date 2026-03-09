import { useState, useRef, useCallback } from "react";

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

// Exportar como TXT
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

// Exportar como DOCX usando docx.js via CDN (carregado dinamicamente)
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
            new TextRun({ text: `[${formatTime(s.inicio)} → ${formatTime(s.fim)}]  `, bold: true, size: 20, color: "888680" }),
            new TextRun({ text: s.texto, size: 22 }),
          ],
          spacing: { after: 120 },
        })
      );
    });
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo || "transcricao"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Componente de loading animado
function LoadingSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "36px 32px" }}>
      <div style={{ position: "relative", width: 48, height: 48 }}>
        <div style={{
          position: "absolute", inset: 0,
          border: "2px solid var(--border)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: 6,
          border: "2px solid transparent",
          borderTopColor: "var(--muted)",
          borderRadius: "50%",
          animation: "spin 1.2s linear infinite reverse",
        }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
          Transcrevendo...
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          Isso pode levar alguns segundos
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Dropdown de exportação
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
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        exportar
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
          bottom: "calc(100% + 6px)",
          right: 0,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          minWidth: 120,
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
    try {
      await exportDOCX(result.transcricao, result.segmentos, nomeBase);
    } catch (e) {
      alert("Erro ao exportar DOCX: " + e.message);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F6F3",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Instrument Serif', Georgia, serif",
      color: "#1a1a1a",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #F7F6F3;
          --surface: #FFFFFF;
          --border: #E5E3DC;
          --text: #1a1a1a;
          --muted: #888680;
          --accent: #1a1a1a;
          --accent-light: #f0efe8;
          --error: #C1392B;
          --radius: 12px;
        }

        body { background: var(--bg); }
        .mono { font-family: 'Geist Mono', monospace; }

        .header {
          padding: 32px 40px 0;
          display: flex; align-items: center; justify-content: space-between;
        }
        .logo { font-size: 18px; letter-spacing: -0.02em; }
        .logo span { font-style: italic; color: var(--muted); }

        .main {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 48px 24px; gap: 40px;
        }

        .hero { text-align: center; max-width: 480px; }
        .hero h1 {
          font-size: clamp(36px, 6vw, 54px);
          font-weight: 400; letter-spacing: -0.03em;
          line-height: 1.1; margin-bottom: 14px;
        }
        .hero h1 em { font-style: italic; color: var(--muted); }
        .hero p {
          font-family: 'Geist Mono', monospace;
          font-size: 12px; color: var(--muted); line-height: 1.7;
        }

        .card {
          width: 100%; max-width: 520px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.05);
        }

        .dropzone {
          padding: 44px 32px; cursor: pointer;
          transition: background 0.2s; text-align: center;
          border-bottom: 1px solid var(--border);
        }
        .dropzone:hover, .dropzone.active { background: var(--accent-light); }
        .dropzone-icon {
          width: 44px; height: 44px; background: var(--accent-light);
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; margin: 0 auto 16px; transition: background 0.2s;
        }
        .dropzone:hover .dropzone-icon { background: var(--border); }
        .dropzone-title { font-size: 16px; letter-spacing: -0.01em; margin-bottom: 6px; }
        .dropzone-sub {
          font-family: 'Geist Mono', monospace;
          font-size: 11px; color: var(--muted); letter-spacing: 0.04em;
        }

        .file-info {
          display: flex; align-items: center; gap: 12px;
          padding: 18px 32px; border-bottom: 1px solid var(--border);
          background: var(--accent-light);
        }
        .file-icon {
          width: 34px; height: 34px; background: var(--surface);
          border: 1px solid var(--border); border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; font-size: 15px;
        }
        .file-name {
          font-size: 14px; letter-spacing: -0.01em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
        }
        .file-size {
          font-family: 'Geist Mono', monospace;
          font-size: 11px; color: var(--muted); flex-shrink: 0;
        }

        .actions {
          padding: 18px 32px; display: flex; gap: 10px; align-items: center;
        }

        .btn-primary {
          flex: 1; background: var(--accent); color: #fff;
          border: none; border-radius: 8px; padding: 11px 24px;
          font-family: 'Geist Mono', monospace; font-size: 13px;
          letter-spacing: 0.02em; cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.82; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }

        .btn-ghost {
          background: transparent; border: 1px solid var(--border);
          border-radius: 8px; padding: 10px 14px;
          font-family: 'Geist Mono', monospace; font-size: 12px;
          color: var(--muted); cursor: pointer; transition: all 0.15s;
        }
        .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

        .dropdown-item {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 10px 16px;
          background: none; border: none;
          font-family: 'Geist Mono', monospace; font-size: 12px;
          color: var(--text); cursor: pointer; text-align: left;
          transition: background 0.15s;
        }
        .dropdown-item:hover { background: var(--accent-light); }
        .dropdown-item + .dropdown-item { border-top: 1px solid var(--border); }

        .result { animation: fadeUp 0.3s ease forwards; }

        .result-header {
          padding: 14px 32px;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border);
        }
        .result-label {
          font-family: 'Geist Mono', monospace;
          font-size: 10px; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--muted);
        }
        .result-btns { display: flex; gap: 8px; align-items: center; }

        .result-text {
          padding: 24px 32px; font-size: 16px;
          line-height: 1.8; letter-spacing: -0.01em;
          border-bottom: 1px solid var(--border);
        }

        .seg-toggle {
          padding: 13px 32px;
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; transition: background 0.15s;
          border-bottom: 1px solid var(--border);
        }
        .seg-toggle:hover { background: var(--accent-light); }
        .seg-label {
          font-family: 'Geist Mono', monospace;
          font-size: 11px; color: var(--muted); letter-spacing: 0.05em;
        }
        .seg-arrow { font-size: 9px; color: var(--muted); transition: transform 0.2s; }
        .seg-arrow.open { transform: rotate(180deg); }

        .seg-item {
          display: grid; grid-template-columns: 48px 1fr;
          gap: 14px; padding: 11px 32px;
          border-bottom: 1px solid var(--border); align-items: baseline;
        }
        .seg-item:last-child { border-bottom: none; }
        .seg-time {
          font-family: 'Geist Mono', monospace;
          font-size: 10px; color: var(--muted); letter-spacing: 0.03em;
        }
        .seg-text { font-size: 14px; line-height: 1.65; }

        .error-box {
          padding: 14px 32px; background: #fff8f7;
          border-bottom: 1px solid #fad7d3;
          display: flex; gap: 10px; align-items: flex-start;
        }
        .error-dot {
          width: 5px; height: 5px; background: var(--error);
          border-radius: 50%; margin-top: 6px; flex-shrink: 0;
        }
        .error-msg {
          font-family: 'Geist Mono', monospace;
          font-size: 12px; color: var(--error); line-height: 1.5;
        }

        .footer {
          padding: 24px 40px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .footer-txt { font-family: 'Geist Mono', monospace; font-size: 11px; color: var(--muted); }
        .footer-sep { width: 3px; height: 3px; background: var(--border); border-radius: 50%; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .header { padding: 20px 20px 0; }
          .main { padding: 32px 16px; gap: 28px; }
          .hero h1 { font-size: 34px; }
          .dropzone { padding: 32px 20px; }
          .file-info, .actions, .result-header, .result-text,
          .seg-toggle, .seg-item, .error-box { padding-left: 20px; padding-right: 20px; }
          .seg-item { grid-template-columns: 40px 1fr; gap: 10px; }
          .footer { padding: 20px; }
        }
      `}</style>

      <header className="header">
        <div className="logo">transcreve<span>.ai</span></div>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>whisper / small</span>
      </header>

      <main className="main">
        {!result && !loading && (
          <div className="hero">
            <h1>Áudio para texto,<br /><em>sem complicação</em></h1>
            <p>Envie um arquivo de áudio e receba<br />a transcrição em segundos.</p>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
                  <button className="btn-ghost" onClick={copiar}>{copied ? "✓ copiado" : "copiar"}</button>
                  <ExportDropdown onExportTXT={handleExportTXT} onExportDOCX={handleExportDOCX} />
                  <button className="btn-ghost" onClick={resetar}>nova</button>
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
              <button className="btn-ghost" onClick={resetar}>cancelar</button>
            </div>
          )}

          {!file && !result && !loading && (
            <div className="actions">
              <button className="btn-primary" onClick={() => inputRef.current.click()}>
                Selecionar arquivo
              </button>
            </div>
          )}

          {error && !loading && (
            <div className="actions">
              <button className="btn-primary" onClick={transcrever}>→ Tentar novamente</button>
              <button className="btn-ghost" onClick={resetar}>cancelar</button>
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
      </footer>
    </div>
  );
}