# Multi-stage build: Rust binary in distroless image
FROM rust:latest AS builder

RUN apt-get update && apt-get install -y musl-tools libssl-dev pkg-config

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release -p blockchain-core --bin blockchain-node

# Runtime stage
FROM gcr.io/distroless/cc-debian12

COPY --from=builder /app/target/release/blockchain-node /blockchain-node

# CloudWatch agent config
ENV PORT=9944
ENV RUST_LOG=blockchain_core=info

EXPOSE ${PORT}

ENTRYPOINT ["/blockchain-node"]