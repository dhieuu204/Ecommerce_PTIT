# Một Dockerfile dùng chung cho 4 service NestJS. Chọn service bằng SERVICE, build từ thư mục gốc repo:
#   docker build -f services/Dockerfile --build-arg SERVICE=user-service -t san/user-service .
# Khi chạy: áp migration Prisma của service rồi bật app (xem infra/docker-compose.yml, profile "app").
FROM node:22-alpine

ARG SERVICE
RUN test -n "$SERVICE" || (echo "Thiếu --build-arg SERVICE=<ten>-service" && exit 1)
RUN corepack enable

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY services/${SERVICE} services/${SERVICE}

# Chỉ cài thư viện của service này và gói chung nó dùng; postinstall build sẵn packages/*
RUN pnpm install --frozen-lockfile --filter "@san/${SERVICE}..."
RUN pnpm --filter "@san/${SERVICE}" build

ENV NODE_ENV=production
WORKDIR /repo/services/${SERVICE}
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
