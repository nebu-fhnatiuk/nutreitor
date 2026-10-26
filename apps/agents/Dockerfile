# syntax=docker/dockerfile:1
# Servicio de agentes (Python/FastAPI). Corre separado de la API NestJS; consume
# el mismo Postgres bajo RLS con el rol nutreitor_agents (ver ADR 0013).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# CA de RDS para verificar el certificado de la base (sslmode=verify-full, ADR 0047).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
