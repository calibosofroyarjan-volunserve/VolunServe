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

# Staging-only deploy gate: do not start a new AI instance until real
# Tesseract OCR, MediaPipe and birthday/barangay synthetic suites pass.
# These tests use DEMO fixtures only, no private ID, account or network.
RUN python -m unittest -v test_document_screening.py test_profile_consistency.py test_face_box_dedup.py test_ai_runtime_smoke.py test_synthetic_document_pipeline.py test_document_precheck.py

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]