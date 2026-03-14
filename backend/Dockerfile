# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the C++ binary
# ─────────────────────────────────────────────────────────────────────────────
FROM gcc:13 AS builder

# Install CMake (needed to build with FetchContent for nlohmann/json)
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy source
COPY CMakeLists.txt .
COPY src/ src/

# Configure & build in Release mode
# FetchContent will download nlohmann/json at configure time
RUN cmake -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_CXX_STANDARD=20 \
    && cmake --build build --config Release --target shift_elite_server -j$(nproc)

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Minimal runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Runtime C++ standard libraries + wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /build/build/shift_elite_server /usr/local/bin/shift_elite_server

# Render injects PORT at runtime. Default 10000 matches Render's free tier.
ENV PORT=10000

# Data directory for disk-based storage
RUN mkdir -p /data

# Static port number — EXPOSE doesn't expand env vars
EXPOSE 10000

# Health check — uses the /api/health endpoint the C++ server already exposes
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

ENTRYPOINT ["/bin/sh", "-c", "exec /usr/local/bin/shift_elite_server --port ${PORT} --data /data"]
