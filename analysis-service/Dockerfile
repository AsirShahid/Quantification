FROM python:3.12-slim@sha256:09f7da3bc104798d0afb40bc08d23ab2da20a76130cec1f2ef170848f5d85217
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    TMPDIR=/tmp
RUN apt-get update \
    && apt-get install -y --no-install-recommends libopenjp2-7 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY analysis-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN groupadd --system --gid 10001 kidneyquant \
    && useradd --system --uid 10001 --gid kidneyquant --home-dir /nonexistent --shell /usr/sbin/nologin kidneyquant
COPY --chown=10001:10001 analysis-service/main.py ./
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
