# InfiniAIBook — self-contained production image.
#   docker compose up -d        (see docker-compose.yml)
# The app needs Node 22.5+ for the built-in node:sqlite module.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
# Whiteboard, motion and composed training videos render with Python, and
# background music is mixed with it; everything else works without it.
# Enable them with: docker build --build-arg WITH_PYTHON=true .
ARG WITH_PYTHON=false
RUN if [ "$WITH_PYTHON" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
      && pip3 install --no-cache-dir --break-system-packages numpy pillow imageio-ffmpeg \
      && rm -rf /var/lib/apt/lists/*; \
    fi
ENV PYTHON_BIN=python3
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/whiteboard ./scripts/whiteboard
COPY --from=build /app/scripts/motion ./scripts/motion
COPY --from=build /app/scripts/audio ./scripts/audio
COPY --from=build /app/scripts/training ./scripts/training
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
