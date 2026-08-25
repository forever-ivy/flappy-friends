FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:3.22
ARG PB_VERSION=0.39.11
ARG TARGETARCH
# 若宿主机执行过 docker/fetch-pocketbase.sh（docker/pocketbase 已存在）则直接使用，
# 构建全程不需要访问 GitHub；否则构建时在线下载发布包。
COPY docker ./docker
RUN apk add --no-cache ca-certificates wget \
    && mkdir -p /pb \
    && if [ -f ./docker/pocketbase ]; then install -m 0755 ./docker/pocketbase /pb/pocketbase; \
    else apk add --no-cache unzip \
    && case "$TARGETARCH" in amd64) PB_ARCH=amd64 ;; arm64) PB_ARCH=arm64 ;; *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; esac \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /pb \
    && rm /tmp/pocketbase.zip; \
    fi
WORKDIR /pb
COPY pb_hooks ./pb_hooks
COPY pb_migrations ./pb_migrations
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=web /app/dist ./pb_public
RUN chmod +x ./pocketbase ./docker-entrypoint.sh
VOLUME ["/pb/pb_data"]
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
