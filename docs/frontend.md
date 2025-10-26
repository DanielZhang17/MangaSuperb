# MangaSuperb 前端架构说明

## 技术栈与基础设施

- 构建与运行：Vite 7（ESM）、TypeScript、pnpm
- UI 框架：React 19、React Router 7（Data APIs，按需懒加载）
- 样式系统：Tailwind CSS v4 + design tokens（`src/styles/global.css`）
- UI 组件：shadcn 风格的可组合组件（`src/components/ui`），`class-variance-authority` + `cn()` 合成样式
- 状态与数据：
  - 轻量全局状态：Jotai（`src/atoms.ts`）
  - 数据请求：Axios 包装的 `request<TReq, TRes>`，统一拦截与错误处理（`src/service`）
  - 缓存与请求生命周期：SWR（`Providers` 中全局 `SWRConfig`）
- 国际化：i18next（`src/i18n`）
- 开发规范：ESLint（import 排序、Hooks 规则、单引号等）
- 别名与解析：`@` 指向 `src`（`vite.config.ts`）

## 目录结构总览

```
src/
  apis/                 # API 模块化封装（调用 service/request）
  components/
    common/             # 复用的通用展示/交互组件
    layout/             # 布局相关（侧边栏等）
    providers/          # 全局 Provider（Theme、SWR 等）
    ui/                 # 原子/复合 UI 组件（shadcn 风格）
  hooks/                # 领域级/页面级自定义 Hook
  i18n/                 # 国际化初始化与资源
  lib/                  # 通用工具（`cn`, 资源 URL 处理等）
  pages/                # 路由页面，按功能域分包
  router/               # 路由声明与保护（`RequireAuth`）
  service/              # 请求封装与领域类型定义
  styles/               # 全局样式与主题 token（Tailwind v4）
```

## 运行入口与应用骨架

- 入口：`src/main.tsx`
  - 引入 `global.css` 与 `i18n`
  - 渲染顺序：`<Providers><RouterProvider router={router} /><Toaster /></Providers>`
- 全局 Providers：`src/components/providers/providers.tsx`
  - ThemeProvider：深浅色主题、持久化（`storageKey= vite-ui-theme`）
  - SWRConfig：
    - `fetcher`: `(key) => request({ url: key, method: 'GET' })`
    - `revalidateOnFocus=false`，`shouldRetryOnError=false`（减少视图抖动与无意义重试）

## 路由与页面架构

- 路由定义：`src/router/index.tsx`
  - 使用 `createBrowserRouter`
  - `DashboardLayout` 为根布局，子路由懒加载页面：`Home`、`Ideas`、`Comics`、`CreateCharacter`、`Me`
  - 受保护路由：包裹在 `<RequireAuth>`（`pages/require-auth.tsx`）中，未登录跳转 `/auth`
- 保护机制：`RequireAuth`
  - 首屏调用 `AuthApi.me()` 判定是否登录
  - 加载态渲染 Loading 占位；未授权时带 `state.from` 重定向到 `/auth`

## UI 与设计系统

- 基础样式：`src/styles/global.css`
  - Tailwind v4 语法，`@theme inline` 暴露 design tokens（颜色、半径、图表与侧边栏 tokens 等）
  - 使用 `dark` 变体切换深色主题
- UI 原子：位于 `src/components/ui`，例如：`button.tsx`（`cva` 变体 + `cn`）
- 组合组件：位于 `src/components/common` 与 `src/components/ui/shadcn-io/*`
- 约定：
  - 组件使用 `data-slot`，便于样式选择器与一致性
  - 优先通过 `cva` 扩展变体，不在组件内新写样式类

## 数据访问层（Service）

- 请求入口：`src/service/index.ts` 提供泛型 `request<TReq, TRes>(config)`
  - `baseURL`：开发环境使用相对路径（交由 Vite 代理 `/api`）；生产环境读取 `VITE_API_BASE`（可为空使用相对路径）
  - 全局超时 10s、`withCredentials=true`、JSON Header
  - 响应拦截：统一错误消息与可选 `showError=false` 静默模式
  - 返回值：直接解包 `res.data`，上层类型即为 `TResponse`
- 类型中心：`src/service/types.ts`
  - 聚合后端领域模型与接口请求/响应类型（Auth、Character、Script、Comic、Job 等）
- API 模块：`src/apis/*`
  - 以功能域拆分（`auth.ts`, `characters.ts`, `comics.ts`...），内部只做参数组装与 `request` 调用

### 请求契约

- 输入：`CustomRequestConfig<TRequest>`（含 `data?: TRequest`, `showError?: boolean` 等）
- 输出：`Promise<TResponse>`（Axios 解包后的 `data`）
- 错误：HTTP 状态统一映射成可读消息；可通过 `showError=false` 关闭控制台输出

## 状态管理与异步

- 全局用户：`src/atoms.ts`（例如 `userAtom`）与 `useAuth()` 联动
- Auth Hook：`src/hooks/use-auth.ts`

  - 使用 SWR 拉取 `/api/auth/me` 并将结果同步到 Jotai
  - 登录/注册/退出/改名使用 `useSWRMutation`，对 SWR 缓存与全局原子做一致性更新
- 轮询能力：`src/hooks/use-poll-character.ts`

  - 指定间隔与最大次数，监听角色生成任务状态

## 环境变量与本地代理

- 本地开发：Vite 代理已在 `vite.config.ts` 配置
  - `/api` -> `https://mangasuperb.anranz.xyz`（含 cookie 重写、去除 Secure/Domain 便于本地调试）
  - `/static`、`/manga` -> `https://storage.mangasuperb.anranz.xyz`（自动附带 Referer/Origin 以绕过防盗链）
- 主要变量：
  - `VITE_API_BASE`：生产环境 API 基地址（开发环境忽略）
  - `VITE_API_KEY`：AI 服务 Key（角色“优化”或“参考图”上传时需要）
  - `VITE_AVATAR_BASE`：头像资源根路径（默认 `/static`，生产可配为存储域名）

## 构建、部署与运行

- 开发：`pnpm dev`
- 构建：`pnpm build` 生成 `dist/`
- 预览：`pnpm preview`（本地静态服务验证构建产物）
- 部署：作为纯静态站点部署（Netlify/Vercel/Nginx 等），需确保后端路径与代理策略匹配生产环境

## 代码规范与约定

- ESLint：统一 import 排序、单引号、React Hooks 规则
- 组件开发：

  - 原子组件放 `components/ui`，组合组件放 `components/common`
  - 新页面默认放 `pages/<feature>` 并在 `router` 中以懒加载注册
  - 样式优先用 Tailwind 原子类与 `cva` 变体，避免散落的 CSS 文件
- 数据访问：所有 HTTP 统一走 `service/request`，在 `apis/*` 中定义领域方法
- 国际化：在 `useI18n(ns)` 驱动下，从 `src/i18n` 读取资源
