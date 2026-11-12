FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && \
    apt-get install -y \
    --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf \
    /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install \
    --no-cache-dir \
    -r requirements.txt

# Fail deployment at BUILD time if a MediaPipe update removes the FaceMesh
# API required by main.py. This check uses no images or personal data.
RUN python -c "import mediapipe as mp; assert hasattr(mp, 'solutions') and hasattr(mp.solutions.face_mesh, 'FaceMesh'), 'Legacy FaceMesh API is missing'; print('FaceMesh dependency OK:', mp.__version__)"

COPY . .

# Only the isolated staging AI branch enables *shadow-only* PAD inference.
# Download a tiny, SHA256-pinned Apache-2.0 ONNX model during build, never at
# request time. Fail the build if source/checksum/model runtime is invalid.
# The classifier cannot mark someone live, verified, or authenticated.
ENV VOLUNSERVE_PASSIVE_PAD_SHADOW=1
RUN python download_passive_pad_model.py && \
    python -c "from passive_pad_shadow import readiness; status = readiness(); assert status['modelLoaded'] and not status['independentPadValidated'], status; print('PASS experimental PAD shadow model load; NOT certified liveness')"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]