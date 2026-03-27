from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import whisper
import tempfile
import os
import subprocess
import json

LIMITE_BYTES = 500 * 1024 * 1024  # 500 MB
FORMATOS_VIDEO = {".mp4", ".mkv", ".avi", ".mov", ".m4v"}

app = Flask(__name__)

CORS(app, origins=[
    "http://localhost:3000",
    "https://*.vercel.app",
])

print("Carregando modelo Whisper...")
model = whisper.load_model("base")
print("Modelo carregado!")


def transcrever_em_chunks(caminho_audio):
    """
    Usa o Whisper normalmente mas emite cada segmento via SSE
    assim que fica pronto, sem esperar o áudio inteiro terminar.
    """
    resultado = model.transcribe(
        caminho_audio,
        language="pt",
        verbose=False,
    )

    texto_completo = resultado["text"].strip()
    segmentos = resultado["segments"]

    # Emite segmento a segmento via SSE
    for seg in segmentos:
        payload = {
            "tipo": "segmento",
            "texto": seg["text"].strip(),
            "inicio": round(seg["start"], 2),
            "fim": round(seg["end"], 2),
        }
        yield f"data: {json.dumps(payload)}\n\n"

    # Emite evento final com o texto completo consolidado
    final = {
        "tipo": "fim",
        "transcricao": texto_completo,
        "segmentos": [
            {
                "inicio": round(s["start"], 2),
                "fim": round(s["end"], 2),
                "texto": s["text"].strip(),
            }
            for s in segmentos
        ],
    }
    yield f"data: {json.dumps(final)}\n\n"


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
        return jsonify({
            "erro": f"Arquivo muito grande ({round(tamanho/1024/1024)}MB). O limite é 500MB."
        }), 413

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
        except subprocess.CalledProcessError:
            os.unlink(caminho_tmp)
            return jsonify({"erro": "Erro ao extrair áudio do vídeo"}), 500

    def gerar_e_limpar():
        try:
            yield from transcrever_em_chunks(caminho_audio)
        except Exception as e:
            erro = {"tipo": "erro", "mensagem": str(e)}
            yield f"data: {json.dumps(erro)}\n\n"
        finally:
            # Limpa arquivos temporários ao final do stream
            if os.path.exists(caminho_tmp):
                os.unlink(caminho_tmp)
            if caminho_audio != caminho_tmp and os.path.exists(caminho_audio):
                os.unlink(caminho_audio)

    return Response(
        stream_with_context(gerar_e_limpar()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # desativa buffer no Nginx/HuggingFace
        },
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)