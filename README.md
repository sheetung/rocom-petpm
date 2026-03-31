# rocom-petplus-node

一个适合部署到 1Panel 的单容器版本，包含：

- Vue 3 前端
- Fastify API
- SQLite 数据库存储
- 蛋组查询
- 可配对宠物查询
- 求蛋广场发布与检索

## 技术栈

- Vue 3 + Vite
- Fastify
- SQLite
- Docker

## 本地开发

1. `npm install`
2. `npm run dev:api`
3. `npm run dev:web`

前端默认运行在 `5173`，并把 `/api` 代理到 `3000`。

## Docker 运行

### 构建镜像

```bash
docker build -t rocom-petplus-node .
```

### 运行容器

```bash
docker run -d \
  --name rocom-petplus \
  -p 3000:3000 \
  -v $(pwd)/apps/api/storage:/app/apps/api/storage \
  rocom-petplus-node
```

### 或使用 compose

```bash
docker compose up -d --build
```

## 1Panel 部署思路

推荐直接用 Docker / Compose 部署，不再拆分静态站点和 Node 服务。

容器启动后：

- 首页由 Node 直接提供 Vue 构建产物
- `/api/*` 由同一个 Node 服务提供
- SQLite 数据保存在挂载目录 `apps/api/storage`

你只需要在 1Panel 中：

1. 上传整个项目目录
2. 用 Docker Compose 或容器方式启动
3. 把域名反向代理到容器端口 `3000`

## 数据库

SQLite 文件默认位置：

- `apps/api/storage/app.db`

首次启动 API 时会自动建表并导入：

- `data/pets.json`

## 生产反向代理示例

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
