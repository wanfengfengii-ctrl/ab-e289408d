# syntax=docker/dockerfile:1

# -------- 依赖 --------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# -------- 构建 --------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# -------- 一次性审核服务：跑测试 + 构建检查，退出码即结论 --------
FROM node:22-alpine AS verify
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `docker compose run --rm verify`：成功退出码 0，失败非 0
CMD ["sh", "-c", "npm test && npm run build"]

# -------- 静态服务（nginx） --------
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
