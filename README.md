# rocom-petplus-node

一个基于 Vue + Node + SQLite 的单容器 Docker 版本，包含：

- 蛋组查询
- 可配对宠物查询
- 求蛋广场发布与检索

## 技术栈

- Vue 3 + Vite
- Fastify
- SQLite
- Docker

## 项目结构

- `apps/web`：前端源码
- `apps/api`：Node API 与 SQLite 访问逻辑
- `apps/api/storage`：SQLite 数据文件目录
- `data/pets.json`：宠物与蛋组种子数据
- `Dockerfile`：单容器构建文件
- `docker-compose.yaml.example`：Docker Compose 示例配置

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动 API

```bash
npm run dev:api
```

3. 启动前端

```bash
npm run dev:web
```

默认情况下：

- 前端运行在 `http://localhost:5173`
- API 运行在 `http://localhost:3000`

## 构建前端

```bash
npm run build:web
```

构建产物会输出到：

- `apps/web/dist`

## Docker 部署

### 构建镜像

```bash
docker build -t rocom-petplus-node .
```

### 启动容器

```bash
docker run -d \
  --name rocom-petplus \
  -p 3000:3000 \
  -v $(pwd)/apps/api/storage:/app/apps/api/storage \
  rocom-petplus-node
```

### 使用 compose

```bash
cp docker-compose.yaml.example docker-compose.yaml
```

按需修改 `docker-compose.yaml` 里的构建参数：

- `VITE_UMAMI_SRC`
- `VITE_UMAMI_WEBSITE_ID`

例如：

```yaml
args:
  VITE_UMAMI_SRC: "https://anal.moontung.top/script.js"
  VITE_UMAMI_WEBSITE_ID: "your-website-id"
```

然后启动：

```bash
docker compose -f docker-compose.yaml up -d --build
```

## 访问方式

容器启动后，服务默认监听：

- `http://localhost:3000`

Node 会同时提供：

- 前端页面
- `/api/*` 接口
- `pet-img` 静态资源

## 数据持久化

SQLite 文件默认位置：

- `apps/api/storage/app.db`

首次启动时会自动：

1. 创建数据库
2. 建表
3. 导入 `data/pets.json`

为了避免容器重建导致数据丢失，请务必挂载：

- `apps/api/storage`

## 常用命令

查看容器日志：

```bash
docker logs rocom-petplus
```

停止并删除容器：

```bash
docker rm -f rocom-petplus
```

使用 compose 查看日志：

```bash
docker compose -f docker-compose.yaml logs -f
```
