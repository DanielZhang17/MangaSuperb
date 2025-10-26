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
│   ├─ services/             # Gemini 调用、任务编排、导出逻辑
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

- 数据库默认使用 PostgreSQL（`.env` 中配置 `POSTGRES_*`）。
- 队列依赖 Redis（`REDIS_URL`）。
- R2/Gemini 等外部服务需要在 `.env` 提供凭证。

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

---

## 4. 关键设计说明

- **Blueprint 分层**：每个业务实体（账号、角色、脚本、漫画、任务）都拥有独立路由文件，API 层保持轻量，将复杂逻辑委托给 `mangasuperb/services`。
- **异步任务**：所有耗时操作（脚本生成、角色优化、漫画生成、PDF 导出等）均通过 Redis RQ 执行，`/api/jobs/<id>` 可查看状态；返回结构包含 `worker_snapshot`，便于排查 worker 是否在线。
- **导出流程**：`process_export_stage` 会优先使用封面（若存在）生成 PDF/ZIP，然后合并漫画页；生成的 URL 存于 `comic.pdf_url`、`comic.zip_url`、`comic.cover_image_url`。
- **日志与排查**：`services/jobs.py` 中每个阶段都会记录 `job_id` 与执行情况；`/health` 增加 `rq_workers` 字段，帮助观察活跃 worker。

---


