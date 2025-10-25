# MangaSuperb Workflow Walkthrough

以下命令基于生产环境 `https://mangasuperb.anranz.xyz`，测试账号为
`qa_tester / test1234`。请在实际执行前替换相应的参数，例如漫画 ID、角色 ID、
以及 base64 编码的图片内容。（为了安全起见，示例未包含真实 base64 数据。）

---

## 1. 登录并保存 Session Cookie

```bash
curl -c /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"qa_tester","password":"test1234"}'
```

后续所有请求都使用 `/tmp/manga_cookies.txt` 维持会话。

---

## 2. 创建一个无需优化的角色

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/characters \
  -H 'Content-Type: application/json' \
  -d '{
        "name":"Worker Check NoRef",
        "description":"No reference image test.",
        "optimize":false,
        "sex":"unspecified",
        "is_public":false
      }'
```

返回的 `character.id` 可继续用于漫画生成。

---

## 3. 创建带参考图的角色（触发 RQ 图片任务）

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/characters \
  -H 'Content-Type: application/json' \
  -d '{
        "name":"Worker Check Avatar4",
        "description":"Use avatar4.jpg",
        "optimize":false,
        "sex":"unspecified",
        "is_public":false,
        "reference_images":["data:image/jpeg;base64,<base64 of static/avatar4.jpg>"]
      }'
```

记录返回的 `job_id` 并轮询任务状态：

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/jobs/<character_job_id>
```

任务完成后，`GET /api/characters/<character_id>` 中的 `image_status` 将为
`completed`，同时提供 Cloudflare R2 的 `image_url`。

---

## 4. 通过 `/api/jobs` 创建漫画（脚本 + 漫画记录）

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{
        "job_type":"comic_generation",
        "prompt":"Two siblings discover a hidden mech in the forest.",
        "style":"Ink wash noir",
        "aspect_ratio":"16:9",
        "characters":[{"id":10}]
      }'
```

返回结构包含 `comic_id`、`script_id` 以及三个阶段的 job_id。轮询每个 job
直至 `rq_status` = `finished`：

```bash
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<outline_job_id>
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<shot_job_id>
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<render_job_id>
```

随后可查看漫画详情：

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/comics/<comic_id>
```

---

## 5. 指定第 2 页的布局（可选）

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/panels/<comic_id>/layouts \
  -H 'Content-Type: application/json' \
  -d '{
        "page_number":2,
        "layout_key":"grid-2x2",
        "notes":"Manual layout for page 2",
        "panel_order":[7,8,9]
      }'
```

`panel_order` 使用面板 ID，按顺序挂载到该页。

---

## 6. 重新渲染指定页

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/panels/<comic_id>/pages/2/render \
  -H 'Content-Type: application/json' \
  -d '{}'
```

轮询返回的 `job_id`，等待 `finished`。完成后再次查看漫画详情即可看到第 2 页的新
`image_url`。

---

## 7. 发布漫画（封面 → 导出 → 发布）

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/comics/<comic_id>/publish \
  -H 'Content-Type: application/json' \
  -d '{"make_public":false}'
```

响应中包含三个阶段的 job_id：

```json
{
  "stage_jobs": {
    "cover_job_id": "…",
    "export_job_id": "…",
    "publish_job_id": "…"
  }
}
```

逐个轮询即可获取进度，完成后 `/api/comics/<comic_id>` 会返回：

- `cover_image_url`
- `pdf_url`（首图即封面）
- `zip_url`（包含 `cover.png` 与 `page-*.png`）
- `workflow_status: "completed"`

---

## 8. 点赞 / 取消点赞（可选）

```bash
# 点赞
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/comics/<comic_id>/like

# 取消点赞
curl -b /tmp/manga_cookies.txt \
  -X DELETE https://mangasuperb.anranz.xyz/api/comics/<comic_id>/like
```

每次调用都会返回最新的 `like_count`，以及带有 `user_liked` 标记的漫画信息。
公开漫画列表 `/api/comics/public` 按点赞数降序排列，可直接用于排行榜。

---

多次执行发布接口是安全的：导出任务会重新生成封面、PDF 与 ZIP，你可以在修改逻辑
后重复验证。
