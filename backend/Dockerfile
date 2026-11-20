# ---------- збирання ----------
FROM node:22-bookworm-slim AS build
# openssl потрібен рушію міграцій Prisma; python3/make/g++ на випадок збирання bcrypt з джерел
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall запускає prisma generate
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- виконання ----------
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production TZ=Europe/Kyiv
WORKDIR /app
# Залишаємо dev-залежності: tsx потрібен для npm run seed усередині контейнера
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src/integrity-index/integrity-formula.ts ./src/integrity-index/integrity-formula.ts
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3000
# Міграції застосовуються при кожному старті (ідемпотентно)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
