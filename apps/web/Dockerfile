# Web (React) build thành file tĩnh, NGINX phục vụ và chuyển /api/<service> tới từng service.
# Build từ thư mục gốc repo: docker build -f apps/web/Dockerfile -t san/web .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile --filter "@san/web..."
RUN pnpm --filter @san/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
