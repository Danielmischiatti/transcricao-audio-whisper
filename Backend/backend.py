from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import tempfile
import os

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

    sufixo = os.path.splitext(arquivo.filename)[-1] or ".ogg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=sufixo) as tmp:
        arquivo.save(tmp.name)
        caminho_tmp = tmp.name

    try:
        resultado = model.transcribe(caminho_tmp, language="pt")
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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
