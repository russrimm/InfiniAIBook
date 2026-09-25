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
# Whiteboard videos render with Python; everything else works without it.
# Uncomment to enable them in the container:
# RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
#  && pip3 install --break-system-packages numpy pillow imageio-ffmpeg \
#  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/whiteboard ./scripts/whiteboard
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
