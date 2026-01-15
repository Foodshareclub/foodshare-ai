FROM rust:1.84-slim AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/llm-proxy /usr/local/bin/
CMD ["llm-proxy"]
