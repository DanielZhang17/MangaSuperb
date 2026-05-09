# MangaSuperb 项目指南

MangaSuperb 是一个使用 Flask、Redis RQ 与 Cloudflare R2 构建的漫画生成平台。后端负责账号注册、角色/脚本/漫画的管理以及长耗时任务的调度，前端使用Vite + React 19 + React Router 7 + Tailwind v4 构建UI。
[Demo视频](https://meeting.tencent.com/cw/l6MbjM0mb9)
---

## 1. 项目结构

```
├─ app.py                    # Flask 入口
├─ init_db.py                # 数据库初始化脚本
├─ worker.py                 # RQ Worker 启动入口
├─ mangasuperb/              # 业务代码（蓝图、服务、扩展）
│   ├─ routes/               # REST API 蓝图（auth/characters/comics/...）
│   ├─ services/
│   │   ├─ ai_provider.py    # AI 提供商抽象层（Gemini / 第三方 OpenAI 兼容接口）
│   │   ├─ generation.py     # 脚本生成与角色描述优化
│   │   └─ jobs.py           # RQ 后台任务实现（大纲→分镜→渲染→导出）
│   ├─ static/               # 前端静态文件
│   ├─ extensions.py         # SQLAlchemy、Redis、RQ 初始化
│   └─ __init__.py           # create_app 工厂
├─ models.py                 # SQLAlchemy 模型定义
├─ tests/                    # pytest 测试
└─ docs/
    └─ system_design.md      # 架构设计
    └─ workflows.md
    └─ MangaSuperb_PRD.docx  # 产品需求文档


```

---

## 2. 环境准备

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 根据部署环境自行调整
npm install -g pnpm
cd frontend/
pnpm install
pnpm dev

```

- 数据库默认使用 PostgreSQL（`.env` 中配置 `POSTGRES_*`）。如果同时配置了 `DATABASE_URL`，默认仍以 `POSTGRES_*` 为准；设置 `DATABASE_URL_MODE=url` 才会强制使用完整 URL。
- 队列依赖 Redis（`.env` 中配置 `REDIS_*`）。如果同时配置了 `REDIS_URL`，默认仍以 `REDIS_*` 为准；设置 `REDIS_URL_MODE=url` 才会强制使用完整 URL。
- R2/Gemini 等外部服务需要在 `.env` 提供凭证。
- AI 提供商可通过 `IMAGE_PROVIDER` 和 `TEXT_PROVIDER` 独立切换：
  - `gemini`（默认）：使用 Google Gemini SDK，需配置 `GEMINI_API_KEY`。
  - `third_party`：使用任意 OpenAI 兼容接口，需配置 `THIRD_PARTY_API_URL`、`THIRD_PARTY_API_KEY`、`THIRD_PARTY_IMAGE_MODEL`、`THIRD_PARTY_TEXT_MODEL`。
- 生成阶段 Prompt Optimization 默认关闭。若要在后台启用额外文本模型优化，可设置：
  - `GENERATION_PROMPT_OPTIMIZATION_ENABLED=true`
  - `GENERATION_PROMPT_OPTIMIZATION_SCOPES=shot_split,page_render`
  启用后，`shot_split` 每个漫画流程最多多一次文本模型调用，`page_render` 每页最多多一次文本模型调用。

---

## 3. 常用命令

| 目的             | 命令示例 |
|------------------|----------|
| 初始化数据库     | `python init_db.py` |
| 启动开发服务器   | `python app.py` （提示：调试环境下使用 Flask 内置 server，正式环境使用 gunicorn/uwsgi） |
| 启动 RQ Worker   | `python worker.py`（若任务一直 queued/deferred，请确认 worker 是否运行） |
| 运行测试         | `python -m pytest` |
| 前端代码检查     | `pnpm lint` |
| 检查实时健康状态 | `curl http://localhost:5000/health`（含 database / redis / r2 / rq_workers） |

### Docker / Compose

项目提供一个多阶段 Docker 镜像：构建阶段编译 `frontend/dist`，运行阶段用 Flask/Gunicorn 直接服务 API 与前端静态文件。同一个镜像通过不同命令运行 API、RQ worker 和数据库初始化任务。

```bash
# 使用宿主机已有 .env、数据库目录和日志目录
MANGASUPERB_ENV_FILE=/path/to/.env \
MANGASUPERB_DB_DATA=/path/to/postgres-data \
MANGASUPERB_LOG_DIR=/path/to/logs \
docker compose --env-file /path/to/.env up --build -d postgres redis

# 首次部署或空库时初始化表结构
MANGASUPERB_ENV_FILE=/path/to/.env \
MANGASUPERB_DB_DATA=/path/to/postgres-data \
MANGASUPERB_LOG_DIR=/path/to/logs \
docker compose --env-file /path/to/.env --profile tools run --rm init-db

# 启动 Web 与 Worker
MANGASUPERB_ENV_FILE=/path/to/.env \
MANGASUPERB_DB_DATA=/path/to/postgres-data \
MANGASUPERB_LOG_DIR=/path/to/logs \
docker compose --env-file /path/to/.env up -d api worker
```

- `.env` 不会被打进镜像；Compose 通过 `env_file` 加载，并只读挂载到 `/app/.env`。
- 真实凭据可以直接放在外部 `.env` 中使用。默认优先读取 `POSTGRES_*` / `REDIS_*`；如果你只想使用完整连接串，设置 `DATABASE_URL_MODE=url` / `REDIS_URL_MODE=url`。
- 为了复用本机开发 `.env`，Docker entrypoint 默认会把 `DATABASE_URL` / `REDIS_URL` 以及 `POSTGRES_HOST` / `REDIS_HOST` 中的 `localhost` 或 `127.0.0.1` 改写成 `host.docker.internal`；如需关闭，设置 `DOCKER_REWRITE_LOCALHOST_URLS=false`。
- 日志目录挂载到 `/app/logs`，`LOG_FILE` 默认写入 `/app/logs/mangasuperb.log`，也包括 `logs/gemini_prompts.log` 这类运行时文件。
- PostgreSQL 数据目录默认挂载到 `./docker-data/postgres`，也可通过 `MANGASUPERB_DB_DATA` 指向已有数据目录。
- 对外端口默认是 `5000`，可通过 `APP_PORT` 覆盖；容器内部端口读取 `.env` 中的 `PORT`，默认 5000。

---

## 4. 关键设计说明

- **Blueprint 分层**：每个业务实体（账号、角色、脚本、漫画、任务）都拥有独立路由文件，API 层保持轻量，将复杂逻辑委托给 `mangasuperb/services`。
- **AI 提供商抽象**：`services/ai_provider.py` 提供 `get_image_provider()` / `get_text_provider()` 工厂函数，所有 AI 调用都通过该层路由，可在运行时通过 `IMAGE_PROVIDER` / `TEXT_PROVIDER` 环境变量切换 Gemini 或第三方 OpenAI 兼容接口，无需修改业务代码。
- **异步任务**：所有耗时操作（脚本生成、角色优化、漫画生成、PDF 导出等）均通过 Redis RQ 执行，`/api/jobs/<id>` 可查看状态；返回结构包含 `worker_snapshot`，便于排查 worker 是否在线。
- **导出流程**：`process_export_stage` 会优先使用封面（若存在）生成 PDF/ZIP，然后合并漫画页；生成的 URL 存于 `comic.pdf_url`、`comic.zip_url`、`comic.cover_image_url`。
- **日志与排查**：`services/jobs.py` 中每个阶段都会记录 `job_id` 与执行情况；`/health` 增加 `rq_workers` 字段，帮助观察活跃 worker。

---
