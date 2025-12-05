## 总体策略
- 不在前端写入密钥；改为“前端 → 自建后端代理 → Google Gemini API”。
- 后端从环境变量读取密钥并调用 API；前端仅发送 `prompt`，绝不接触密钥。
- 本地用 `.env`（列入 `.gitignore`）；线上用平台的“环境变量”配置（Vercel/Render/Netlify/Cloudflare）。

## 后端实现
- 新增 `server.js`（Node + Express）。
- 读取 `process.env.GEMINI_API_KEY`（本地通过 `dotenv`）。
- 提供 `POST /api/generate`，请求体 `{ prompt: string }`。
- 在路由中：
  - 校验输入长度与字符，限制最大长度（如 200 字）。
  - 组装 Gemini API 请求（保持你现有 `systemInstruction` 与 `contents` 结构）。
  - 返回你需要的 `code` 文本（裁掉 ``` 包围等）。
- 安全：
  - 启用 CORS 严格白名单（开发：`http://localhost:5500`；生产：你的域名）。
  - 限流（如 `express-rate-limit`）。
  - 不打印密钥和完整响应到日志；仅记录必要的错误摘要。
  - 使用 HTTPS（部署平台通常默认）。

## 前端改动
- 删除 `const apiKey = ""` 与所有直接调用 Google API 的代码。
- 将 `generateAIShape()` 中的 `fetch` 改为 `POST /api/generate`，仅发送 `prompt`。
- 根据后端返回的 `code` 更新粒子坐标逻辑，保留现有解析与应用流程。
- 错误处理：当后端返回非 2xx，UI 显示提示并不崩溃。

## 本地开发流程
- 在项目根创建 `.env`（不提交）：`GEMINI_API_KEY=你的密钥`。
- `.gitignore` 添加 `.env`（避免意外提交）。
- 启动：
  - 前端继续用 `python -m http.server 5500` 或任意静态服务器。
  - 后端 `node server.js`（端口如 `3000`）。
- CORS 白名单包含 `http://localhost:5500`。

## 部署方案
- Vercel（或 Render/Netlify Functions/Cloudflare Workers）部署后端：
  - 在平台面板设置环境变量 `GEMINI_API_KEY`。
  - 配置 CORS 允许你的正式域名。
- 前端可部署到任意静态托管（Vercel/Netlify/静态主机）；前端调用你后端地址（如 `/api/generate` 反向代理或完整域名）。

## 额外安全与合规
- 在 Google 控制台为密钥启用“API 限制：Generative Language API”。
- 若平台支持，配置 IP/域名限制与指标告警。
- 加 pre-commit secret-scan（可选），避免误提交敏感字符串。

## 交付内容（代码层面）
- 新增：`server.js`（Express 路由代理），`package.json`（后端依赖），`.env.example`（示例，无实际值）。
- 修改：`main.js` 的 `generateAIShape()` 调用 URL 与错误处理。

## 验证步骤
- 本地：在 `.env` 写入密钥，前端输入 prompt，确认后端成功代理并返回代码，前端正常生成形状。
- 线上：部署后端，设置环境变量，前端指向线上后端，校验 CORS、限流与错误提示正常。

请确认以上方案，我将据此添加后端代理与前端改造，并保证密钥不出现在仓库或浏览器端。