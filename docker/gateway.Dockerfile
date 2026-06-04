FROM golang:1.26 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY gateway/templates /app/templates
COPY gateway/static /app/static
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o keiro-gateway ./gateway

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN adduser --disabled-password --gecos "" keiro
WORKDIR /app
COPY --from=builder --chown=keiro:keiro /app/keiro-gateway .
COPY --from=builder --chown=keiro:keiro /app/templates ./templates
COPY --from=builder --chown=keiro:keiro /app/static ./static
USER keiro
ENTRYPOINT ["/app/keiro-gateway"]