FROM python:3.11-slim
RUN adduser --disabled-password --gecos "" keiro
WORKDIR /app
COPY --chown=keiro:keiro requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=1000 -r requirements.txt
COPY --chown=keiro:keiro . .
ENV PYTHONPATH=/app/intelligence:/app/generated/python
USER keiro
ENTRYPOINT ["python", "-u", "intelligence/main.py"]
