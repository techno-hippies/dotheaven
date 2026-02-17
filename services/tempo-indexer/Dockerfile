FROM oven/bun:1.3.8

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV PONDER_TELEMETRY_DISABLED=1

EXPOSE 42069

CMD ["./node_modules/.bin/ponder", "start", "--schema", "tempo_indexer", "--hostname", "0.0.0.0", "--port", "42069"]
