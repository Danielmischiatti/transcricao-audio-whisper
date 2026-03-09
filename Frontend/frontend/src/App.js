import { useState, useRef, useCallback } from "react";

// Em produção usa a URL do Render, em desenvolvimento usa localhost
const API_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/transcrever`
  : "http://localhost:5000/transcrever";

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
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
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

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

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "48px 24px",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      color: "#e8e4d9",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .drop-zone {
          border: 1.5px dashed #2e2e3e;
          border-radius: 16px;
          padding: 40px 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s ease;
          background: #10101a;
        }
        .drop-zone:hover, .drop-zone.active {
          border-color: #7c6af7;
          background: #13132a;
          box-shadow: 0 0 40px #7c6af710;
        }

        .btn {
          background: #7c6af7;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px 36px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn:hover:not(:disabled) {
          background: #9b8dfb;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px #7c6af730;
        }
        .btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid #2e2e3e;
          color: #a09cb0;
          border-radius: 8px;
          padding: 8px 18px;
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-ghost:hover {
          border-color: #7c6af7;
          color: #7c6af7;
        }

        .pill {
          display: inline-block;
          background: #1a1a2e;
          border: 1px solid #2e2e3e;
          border-radius: 99px;
          padding: 4px 14px;
          font-size: 11px;
          color: #7c6af7;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .segment {
          display: flex;
          gap: 16px;
          padding: 10px 0;
          border-bottom: 1px solid #1a1a2a;
          font-size: 13px;
          line-height: 1.6;
          align-items: flex-start;
        }
        .segment:last-child { border-bottom: none; }
        .segment-time {
          color: #7c6af7;
          font-size: 11px;
          white-space: nowrap;
          padding-top: 2px;
          min-width: 54px;
        }

        .wave {
          display: flex;
          gap: 4px;
          align-items: center;
          height: 28px;
        }
        .wave span {
          width: 3px;
          background: #7c6af7;
          border-radius: 2px;
          animation: wave 1.2s ease-in-out infinite;
        }
        .wave span:nth-child(2) { animation-delay: 0.1s; }
        .wave span:nth-child(3) { animation-delay: 0.2s; }
        .wave span:nth-child(4) { animation-delay: 0.3s; }
        .wave span:nth-child(5) { animation-delay: 0.4s; }

        @keyframes wave {
          0%, 100% { height: 8px; opacity: 0.4; }
          50% { height: 24px; opacity: 1; }
        }

        .fade-in {
          animation: fadeIn 0.4s ease forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <span className="pill" style={{ marginBottom: 16, display: "inline-block" }}>Whisper AI</span>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(32px, 5vw, 52px)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          marginBottom: 12,
        }}>
          Transcrição<br />
          <span style={{ color: "#7c6af7" }}>de Áudio</span>
        </h1>
        <p style={{ color: "#6b6880", fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
          Envie qualquer áudio e receba a transcrição em segundos usando OpenAI Whisper.
        </p>
      </div>

      {/* Card principal */}
      <div style={{
        width: "100%",
        maxWidth: 600,
        background: "#0e0e1a",
        border: "1px solid #1e1e2e",
        borderRadius: 20,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>

        {/* Drop zone */}
        <div
          className={`drop-zone${dragging ? " active" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.ogg,.mp3,.wav,.m4a,.flac,.webm"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {file ? (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎙️</div>
              <div style={{ color: "#e8e4d9", fontWeight: 500, fontSize: 14 }}>{file.name}</div>
              <div style={{ color: "#6b6880", fontSize: 12, marginTop: 4 }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
              <div style={{ color: "#a09cb0", fontSize: 14, marginBottom: 4 }}>
                Arraste um áudio ou clique para selecionar
              </div>
              <div style={{ color: "#4a4a5a", fontSize: 12 }}>
                .mp3 · .wav · .ogg · .m4a · .flac · .webm
              </div>
            </div>
          )}
        </div>

        {/* Botão transcrever */}
        <button
          className="btn"
          onClick={transcrever}
          disabled={!file || loading}
          style={{ alignSelf: "center", minWidth: 180 }}
        >
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <div className="wave">
                <span/><span/><span/><span/><span/>
              </div>
              Transcrevendo...
            </span>
          ) : "→ Transcrever"}
        </button>

        {/* Erro */}
        {error && (
          <div className="fade-in" style={{
            background: "#1a0a0a",
            border: "1px solid #5a1a1a",
            borderRadius: 10,
            padding: "14px 18px",
            color: "#e87070",
            fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              background: "#0a0a14",
              border: "1px solid #1e1e2e",
              borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: "#7c6af7", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Transcrição
                </span>
                <button className="btn-ghost" onClick={copiar}>
                  {copied ? "✓ Copiado!" : "Copiar"}
                </button>
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "#e8e4d9" }}>
                {result.transcricao}
              </p>
            </div>

            {result.segmentos && result.segmentos.length > 1 && (
              <div style={{
                background: "#0a0a14",
                border: "1px solid #1e1e2e",
                borderRadius: 12,
                padding: 20,
              }}>
                <div style={{ fontSize: 11, color: "#7c6af7", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
                  Segmentos
                </div>
                {result.segmentos.map((s, i) => (
                  <div key={i} className="segment">
                    <span className="segment-time">{formatTime(s.inicio)}</span>
                    <span style={{ color: "#c8c4d9" }}>{s.texto}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn-ghost"
              style={{ alignSelf: "center" }}
              onClick={() => { setFile(null); setResult(null); }}
            >
              + Nova transcrição
            </button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 32, color: "#3a3a4a", fontSize: 12, textAlign: "center" }}>
        Powered by OpenAI Whisper
      </p>
    </div>
  );
}