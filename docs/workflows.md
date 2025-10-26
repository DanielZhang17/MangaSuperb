# MangaSuperb Workflow Walkthrough

The steps below reproduce the end-to-end workflow we validated against the live
environment (`https://mangasuperb.anranz.xyz`). All commands use `curl`; replace
values such as emails, IDs, or session cookies as needed. The sample login uses
`qa_tester / test1234` to match the QA account created earlier.

> **Note**: omit the base64 payload when sharing these commands publicly. The
> example reference image in step 3 uses `static/avatar4.jpg`; substitute the
> actual base64 string from your environment before running the command.

---

## 1. Authenticate and capture session cookie

```bash
curl -c /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"qa_tester","password":"test1234"}'
```

The cookie jar (`/tmp/manga_cookies.txt`) is reused for all subsequent calls.

---

## 2. Create a character without optimisation

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

This returns a character with `image_status: "idle"` (no job enqueued).

---

## 3. Create a character with a reference image

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

Grab the returned `job_id` to poll status:

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/jobs/<character_job_id>
```

Once the worker finishes, `GET /api/characters/<character_id>` shows
`image_status: "completed"` and an `image_url` pointing to R2 storage.

---

## 4. Rename an existing character

```bash
curl -b /tmp/manga_cookies.txt \
  -X PATCH https://mangasuperb.anranz.xyz/api/characters/<character_id>/name \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Alias"}'
```

The response echoes the updated character payload. Only the `name` field changes; all
other properties remain untouched.

---

## 5. Generate a comic via the job endpoint

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

The response includes `comic_id`, `script_id`, and individual stage job IDs
(`outline_job_id`, `shot_job_id`, `render_job_id`).

Poll each job until `rq_status` becomes `finished`:

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/jobs/<outline_job_id>
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/jobs/<shot_job_id>
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/jobs/<render_job_id>
```

Fetch the comic detail to inspect panels/layouts:

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/comics/<comic_id>
```

---

## 6. Set a layout for page 2 (optional manual arrangement)

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

This aligns panel shots 7–9 to page 2 in the specified order.

---

## 7. Trigger a targeted page render

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/panels/<comic_id>/pages/2/render \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Poll the returned `job_id` until `rq_status` is `finished`, then re-fetch the
comic detail to verify the rendered image URL for page 2.

---

## 8. Run the publish workflow (export → cover → publish)

```bash
curl -b /tmp/manga_cookies.txt \
  -X POST https://mangasuperb.anranz.xyz/api/comics/<comic_id>/publish \
  -H 'Content-Type: application/json' \
  -d '{"make_public":false}'
```

The response returns stage job IDs:

```json
{
  "stage_jobs": {
    "cover_job_id": "…",
    "export_job_id": "…",
    "publish_job_id": "…"
  }
}
```

Poll each job until complete:

```bash
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<cover_job_id>
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<export_job_id>
curl -b /tmp/manga_cookies.txt https://mangasuperb.anranz.xyz/api/jobs/<publish_job_id>
```

Finally, verify the comic detail now includes the exported assets (cover, PDF,
ZIP) and `workflow_status: "completed"`:

```bash
curl -b /tmp/manga_cookies.txt \
  https://mangasuperb.anranz.xyz/api/comics/<comic_id>
```

Expected fields:

- `cover_image_url` → PNG hosted in R2
- `pdf_url` → PDF bundle that now starts with the cover
- `zip_url` → ZIP archive containing `cover.png` + page images
- `workflow_stage` / `workflow_status` → `export` / `completed`

---

Re-running the publish endpoint is safe; the export job regenerates bundles so
you can confirm cover-inclusion after any code changes.
