## MangaSuperb API 工作流示例：从角色到多页漫画

本文档演示如何使用 MangaSuperb 的主要后端接口，从创建角色开始，一直到利用该角色生成多页漫画。示例请求均假设客户端已完成登录（会话/Token 处理见 `auth` 模块）。

---

### 1. 创建角色并触发形象生成

**Endpoint**：`POST /api/characters`  
**用途**：保存角色描述，同时入队角色形象生成任务（RQ）。

**请求示例**

```json
{
  "name": "Celeste",
  "description": "A starborn swordswoman who glows with cosmic light.",
  "sex": "female",
  "is_public": false,
  "style_prompt": "High-contrast shōnen ink style with ethereal highlights."
}
```

**成功响应示例**

```json
{
  "character": {
    "id": 42,
    "user_id": 7,
    "name": "Celeste",
    "description": "A starborn swordswoman who glows with cosmic light.",
    "sex": "female",
    "is_public": false,
    "style_prompt": "High-contrast shōnen ink style with ethereal highlights.",
    "optimized_description": null,
    "image_status": "pending",
    "image_job_id": "rq:job:1a2b3c",
    "image_url": null,
    "image_error": null,
    "created_at": "2025-01-15T12:34:56.123456",
    "updated_at": "2025-01-15T12:34:56.123456"
  },
  "job_id": "rq:job:1a2b3c"
}
```

> 提示：`image_status` 初始为 `pending`。当 worker 完成任务后会写入 `image_url`，`image_status` 变为 `completed`。

---

### 2. 查询角色任务状态

**Endpoint**：`GET /api/jobs/<job_id>`  
**用途**：查看队列任务状态，并在角色任务完成后获取最终字段。

**请求示例**

```
GET /api/jobs/rq:job:1a2b3c
```

**完成后的响应示例**

```json
{
  "job_id": "rq:job:1a2b3c",
  "rq_status": "finished",
  "character": {
    "id": 42,
    "image_status": "completed",
    "image_url": "https://cdn.example.com/character_42_20250115.png",
    "image_error": null
  },
  "worker_snapshot": {
    "status": "active",
    "active": 1,
    "workers": ["worker-01"],
    "queued": 0,
    "deferred": 0,
    "failed": 0
  }
}
```

---

### 3. 手动创建漫画（不使用 `/api/jobs`）

若希望完全手动控制脚本、面板与渲染流程，可直接调用 `comics`、`stories`、`panels` 相关接口。

#### 3.1 创建漫画骨架

**Endpoint**：`POST /api/comics`  
**用途**：保存自定义脚本 JSON，并初始化 `Comic` + `Script` 记录（不会自动触发队列任务）。

```json
{
  "title": "Starfall Chronicle",
  "story": "Celeste discovers a rogue AI in the orbital ruins.",
  "style": "Classic manga black and white linework.",
  "aspect_ratio": "16:9",
  "characters": [
    {
      "id": 42,
      "order_index": 1,
      "role": "protagonist"
    }
  ]
}
```

**成功响应示例**

```json
{
  "comic": {
    "id": 200,
    "title": "Starfall Chronicle",
    "status": "pending",
    "style_description": "Classic manga black and white linework.",
    "aspect_ratio": "16:9",
    "pages": [],
    "workflow_stages": [],
    "characters": [
      {
        "character_id": 42,
        "role": "protagonist",
        "order_index": 1
      }
    ]
  },
  "script": {
    "id": 480,
    "title": "Starfall Chronicle",
    "content": "{\"story\": \"Celeste discovers a rogue AI in the orbital ruins.\", \"style_description\": \"Classic manga black and white linework.\", \"aspect_ratio\": \"16:9\", \"characters\": [...]}"
  }
}
```

#### 3.2 手动编写大纲并同步角色

**Endpoint**：`POST /api/stories/<comic_id>`  
**用途**：提交章节摘要，必要时重新绑定角色；会清空旧的面板和布局。

```json
{
  "sections": [
    {"title": "Arrival", "summary": "Celeste docks at the shattered moonbase."},
    {"title": "Encounter", "summary": "She confronts the rogue AI in the command dome."}
  ],
  "characters": [
    {"id": 42, "order_index": 1, "role": "protagonist"}
  ]
}
```

**响应要点**
- `comic.workflow_stage` 设为 `"shots"`，`workflow_status` 变为 `"pending"`。
- `outline_sections` 将返回最新的章节列表。

#### 3.3 编辑或新增面板

- 自动生成：可选择调用 `POST /api/jobs` (`story_optimization`) 让系统根据大纲生成面板。
- 手动维护：可以直接向数据库插入面板（不推荐）或调用 `PATCH /api/panels/<panel_id>` 更新字段。

```json
{
  "description": "Celeste raises her blade against the AI.",
  "dialogue": "Celeste: Stand down!",
  "camera_notes": "Dynamic three-quarter view"
}
```

#### 3.4 选择页面布局并渲染指定页

1. `POST /api/panels/<comic_id>/layouts`
   ```json
   {
     "page_number": 1,
     "layout_key": "auto-grid",
     "panel_order": [301, 302, 303, 304]
   }
   ```
2. `POST /api/panels/<comic_id>/pages/1/render`

渲染完成后，调用 `GET /api/comics/<comic_id>` 即可看到 `pages[*].image_url`。

---

### 4. 使用 Jobs 自动化（脚本/面板/渲染）

#### 4.1 Story Optimisation（优化大纲和面板）

**Endpoint**：`POST /api/jobs`  
**请求载荷**

```json
{
  "job_type": "story_optimization",
  "comic_id": 200
}
```

> `comic_id` 必需，且必须属于当前用户。

**成功响应示例**

```json
{
  "stage_jobs": {
    "outline_job_id": "rq:job:aa11bb",
    "shot_job_id": "rq:job:cc22dd"
  },
  "comic": {
    "id": 200,
    "workflow_stage": "outline",
    "workflow_status": "in_progress",
    "status": "processing",
    "outline_sections": [],
    "panel_shots": []
  }
}
```

轮询 `GET /api/jobs/rq:job:cc22dd`（或 `GET /api/comics/200`）即可看到更新后的 `outline_sections`、`panel_shots` 和 `page_layouts`。成功结束时典型 payload 如：

```json
{
  "job_id": "rq:job:cc22dd",
  "rq_status": "finished",
  "comic": {
    "id": 200,
    "workflow_stage": "render",
    "workflow_status": "pending",
    "outline_sections": [
      {"id": 501, "order_index": 1, "title": "Arrival", "summary": "Celeste docks..."},
      {"id": 502, "order_index": 2, "title": "Encounter", "summary": "She confronts..."}
    ],
    "panel_shots": [
      {
        "id": 601,
        "page_number": 1,
        "panel_number": 1,
        "description": "Celeste approaches the shattered hangar...",
        "dialogue": "AI: Unauthorized arrival detected.",
        "status": "draft"
      },
      "... 其余面板 ... "
    ],
    "page_layouts": [
      {
        "id": 701,
        "page_number": 1,
        "layout_key": "auto-grid",
        "status": "suggested",
        "panel_assignments": [
          {"panel_shot_id": 601, "position": 1},
          {"panel_shot_id": 602, "position": 2}
        ]
      }
    ]
  },
  "worker_snapshot": {
    "status": "active",
    "active": 1,
    "workers": ["worker-01"]
  }
}
```

#### 4.2 一次性生成脚本+面板+渲染

**Endpoint**：`POST /api/jobs` with `job_type="comic_generation"`  
**用途**：根据文本 Prompt（可包含角色列表）生成脚本、面板与页面渲染任务。

**请求示例**

```json
{
  "job_type": "comic_generation",
  "prompt": "Celeste arrives on a shattered moonbase to stop a rogue AI.",
  "style": "Classic manga black and white linework with cosmic glow accents.",
  "aspect_ratio": "16:9",
  "characters": [
    {
      "id": 42,
      "order_index": 1,
      "role": "protagonist"
    }
  ]
}
```

**成功响应示例（漫画创建 + 队列作业）**

```json
{
  "job_id": "rq:job:9f8e7d",              // render 阶段 RQ Job ID
  "comic_id": 105,
  "script_id": 312,
  "status": "pending",
  "script": {
    "title": "Shards of the Moon",
    "summary": "Celeste battles the rogue AI controlling the moonbase.",
    "panels": [
      {
        "panel_number": 1,
        "scene": "Celeste docks at the fractured moonbase.",
        "dialogue": "AI: Unauthorized arrival detected.",
        "visual_notes": "Show vast starscape, floating debris."
      },
      "... 其余面板 ... "
    ],
    "style_notes": "High-energy shōnen framing with cosmic lighting."
  },
  "stage_jobs": {
    "outline_job_id": "rq:job:aa11bb",
    "shot_job_id": "rq:job:cc22dd",
    "render_job_id": "rq:job:9f8e7d"
  }
}
```

---

### 5. 轮询漫画生成进度

渲染阶段需要数个串行 Job。使用步骤 2 的接口查询 `render_job_id`，或直接访问漫画详情。

```
GET /api/jobs/rq:job:9f8e7d
```

**完成后的关键字段**

```json
{
  "job_id": "rq:job:9f8e7d",
  "rq_status": "finished",
  "comic": {
    "id": 105,
    "status": "completed",
    "workflow_stage": "render",
    "workflow_status": "completed",
    "pages": [
      {
        "page_number": 1,
        "image_url": "https://cdn.example.com/manga_page_105_1_20250115.png",
        "panel_text": "{\"panels\": [...]}",
        "layout": {
          "layout_key": "auto-grid",
          "status": "rendered"
        }
      },
      {
        "page_number": 2,
        "image_url": "https://cdn.example.com/manga_page_105_2_20250115.png",
        "panel_text": "{\"panels\": [...]}",
        "layout": {
          "layout_key": "auto-grid",
          "status": "rendered"
        }
      }
    ],
    "characters": [
      {
        "character_id": 42,
        "role": "protagonist",
        "order_index": 1
      }
    ]
  },
  "worker_snapshot": {
    "status": "active",
    "active": 1,
    "workers": ["worker-01"]
  }
}
```

---

### 6. 获取漫画详情 / 资源链接

**Endpoint**：`GET /api/comics/<comic_id>`  
**用途**：获取最新的漫画状态、页面图片及导出信息。

```json
{
  "id": 105,
  "title": "Shards of the Moon",
  "status": "completed",
  "style_description": "Classic manga black and white linework with cosmic glow accents.",
  "aspect_ratio": "16:9",
  "cover_image_url": null,
  "pdf_url": null,
  "zip_url": null,
  "pages": [
    {
      "page_number": 1,
      "image_url": "https://cdn.example.com/manga_page_105_1_20250115.png",
      "panel_text": "{\"panels\": [...]}"
    },
    {
      "page_number": 2,
      "image_url": "https://cdn.example.com/manga_page_105_2_20250115.png",
      "panel_text": "{\"panels\": [...]}"
    }
  ],
  "workflow_stages": [
    {"stage": "outline", "status": "completed"},
    {"stage": "shots", "status": "completed"},
    {"stage": "render", "status": "completed"}
  ],
  "characters": [
    {
      "character_id": 42,
      "role": "protagonist",
      "order_index": 1
    }
  ]
}
```

> 若需导出 PDF/ZIP 或生成封面，可继续调用 `POST /api/comics/<comic_id>/publish`，其任务同样会在 `/api/jobs/<job_id>` 中返回进度。

---

### 7. 可选：更新面板或重新渲染页面

- 调整单个面板：`PATCH /api/panels/<panel_id>`  
  结构如
  ```json
  {"dialogue": "Celeste: I will shut you down!", "camera_notes": "Close-up"}
  ```
- 重新选择布局并渲染指定页：  
  1. `POST /api/panels/<comic_id>/layouts`  
  2. `POST /api/panels/<comic_id>/pages/<page_number>/render`

---

### 8. 资源核对清单

| 步骤 | 关键字段 | 说明 |
|------|----------|------|
| 创建角色 | `image_job_id` | 与 `/api/jobs/<id>` 联动，记录角色生成任务 |
| 漫画生成 | `stage_jobs` | `outline_job_id` → `shot_job_id` → `render_job_id` |
| 页面渲染完成 | `pages[*].image_url` | 每一页独立的图像链接 |
| 发布导出 | `cover_image_url`、`pdf_url`、`zip_url` | 调用 `publish` 之后填写 |

