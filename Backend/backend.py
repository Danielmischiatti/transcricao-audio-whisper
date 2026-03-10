from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import tempfile
import os
import subprocess

LIMITE_BYTES = 500 * 1024 * 1024  # 500 MB
FORMATOS_VIDEO = {".mp4", ".mkv", ".avi", ".mov", ".m4v"}

app = Flask(__name__)

# Permite chamadas do frontend no Vercel
CORS(app, origins=[
    "http://localhost:3000",
    "https://*.vercel.app",  # substitua pelo seu domínio Vercel depois
])

print("Carregando modelo Whisper...")
model = whisper.load_model("base")
print("Modelo carregado!")


@app.route("/transcrever", methods=["POST"])
def transcrever():
    if "audio" not in request.files:
        return jsonify({"erro": "Nenhum arquivo de áudio enviado"}), 400

    arquivo = request.files["audio"]

    if arquivo.filename == "":
        return jsonify({"erro": "Arquivo inválido"}), 400

    # Valida tamanho
    arquivo.seek(0, 2)
    tamanho = arquivo.tell()
    arquivo.seek(0)
    if tamanho > LIMITE_BYTES:
        return jsonify({"erro": f"Arquivo muito grande ({round(tamanho/1024/1024)}MB). O limite é 500MB. Dica: extraia só o áudio antes de enviar."}), 413

    sufixo = os.path.splitext(arquivo.filename)[-1].lower() or ".ogg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=sufixo) as tmp:
        arquivo.save(tmp.name)
        caminho_tmp = tmp.name

    # Se for vídeo, extrai só o áudio com ffmpeg
    caminho_audio = caminho_tmp
    if sufixo in FORMATOS_VIDEO:
        caminho_audio = caminho_tmp + ".mp3"
        try:
            subprocess.run([
                "ffmpeg", "-y", "-i", caminho_tmp,
                "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k",
                caminho_audio
            ], check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            os.unlink(caminho_tmp)
            return jsonify({"erro": "Erro ao extrair áudio do vídeo"}), 500

    try:
        resultado = model.transcribe(caminho_audio, language="pt")
        texto = resultado["text"].strip()
        segmentos = [
            {
                "inicio": round(s["start"], 2),
                "fim": round(s["end"], 2),
                "texto": s["text"].strip(),
            }
            for s in resultado["segments"]
        ]
        return jsonify({"transcricao": texto, "segmentos": segmentos})
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        os.unlink(caminho_tmp)
        if caminho_audio != caminho_tmp and os.path.exists(caminho_audio):
            os.unlink(caminho_audio)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)