FROM python:3.10-slim

# Instala ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia e instala dependências
COPY Backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o backend
COPY Backend/backend.py .

# Porta padrão do Hugging Face
EXPOSE 7860

# Inicia o servidor
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--timeout", "120", "backend:app"]
