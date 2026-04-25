# Text File Upload & Parsing for Story Panel

**Date:** 2026-04-25
**Status:** Approved

## Overview

Allow users to populate the story textarea in the comic creation wizard by uploading a `.txt` file — either via a toolbar button or by dragging the file directly onto the textarea. When the textarea already has content, a confirmation dialog lets the user choose between replacing or appending.

## Scope

- Frontend only. Pure client-side `FileReader` — no backend changes.
- Supported format: `.txt` only.
- Affected files: `frontend/src/pages/comics/story/story-editor.tsx`, `frontend/src/i18n/index.ts`.

---

## Architecture & Data Flow

All logic lives in `story-editor.tsx` via a `useFileImport` hook.

**Hook responsibilities:**
- A hidden `<input type="file" accept=".txt">` via `useRef<HTMLInputElement>`
- `handleFile(file: File): Promise<void>` — reads text with `FileReader.readAsText`, then either sets content directly (empty textarea) or triggers the confirmation dialog (non-empty textarea)
- `confirmPending` boolean state — controls dialog visibility
- `pendingText` ref — stores text while waiting for user decision

**Data flow:**
1. Upload button click → `inputRef.current.click()` → `onChange` → `handleFile(file)`
2. Drag over textarea wrapper → `onDragOver` (prevent default, set `isDragging = true`) → `onDrop` → validate type → `handleFile(file)`
3. `handleFile` reads file with `FileReader`
4. If textarea `content` is non-empty → stash text in `pendingText`, set `confirmPending = true`
5. If textarea `content` is empty → call `setContent(text)` directly
6. Dialog "Replace" → `setContent(pendingText.current)`, close dialog
7. Dialog "Append" → `setContent(content + '\n\n' + pendingText.current)`, close dialog
8. Dialog "Cancel" → clear `pendingText`, close dialog

---

## UI Changes

### Toolbar row
Add an `Upload` icon button (lucide-react) to the left of "AI 增强剧情". Uses `variant="outline" size="sm"` to match the existing button. The hidden `<input type="file" accept=".txt">` is rendered here (visually hidden, `tabIndex={-1}`).

### Textarea wrapper
The existing `div.relative.rounded-2xl.border` gains:
- `onDragOver`: `e.preventDefault()` + `setIsDragging(true)`
- `onDragLeave`: `setIsDragging(false)`
- `onDrop`: `setIsDragging(false)` + extract `e.dataTransfer.files[0]` + validate + `handleFile`
- Conditional class `ring-2 ring-primary/50` when `isDragging` is true

### Confirmation dialog
Reuses `Dialog` from `@/components/ui/dialog`. Renders when `confirmPending` is true.
- Title: "导入文件" / "Import File"
- Body: "当前已有故事内容，请选择操作" / "Story already has content, choose an action"
- Buttons: "追加" (default), "替换" (outline), "取消" (ghost/close)

### i18n
New keys added under the `comics` namespace in all three locales (`zh-CN`, `zh-TW`, `en`):
```
editor.import.button        — tooltip/aria label for upload button
editor.import.dialogTitle   — dialog title
editor.import.dialogBody    — dialog body
editor.import.replace       — "Replace" action
editor.import.append        — "Append" action
editor.import.emptyFile     — toast: file is empty
editor.import.readError     — toast: file read failed
editor.import.wrongType     — toast: wrong file type
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Dropped file is not `.txt` | `toast.error(t('editor.import.wrongType'))`, ignore file |
| File content is empty after trim | `toast.error(t('editor.import.emptyFile'))`, ignore file |
| `FileReader` error event | `toast.error(t('editor.import.readError'))` |
| Multiple files dropped | Use `files[0]` only, ignore rest |
| Dialog cancelled | Clear `pendingText`, close dialog, textarea unchanged |

---

## Out of Scope

- `.md`, `.docx`, `.pdf` parsing — not in this iteration
- Character limit enforcement — the `/1000字` counter remains cosmetic
- Backend file upload endpoint — unnecessary for plain text
