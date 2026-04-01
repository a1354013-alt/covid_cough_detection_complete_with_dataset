# COVID-19 咳嗽聲音偵測系統 - pnpm Workspace 結構

## 📁 目錄結構

```
covid_cough_detection/
├── client/                    # React + Vite 前端
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
├── server/                    # Node.js + Express API
│   ├── src/
│   │   ├── index.ts          # 主伺服器
│   │   ├── audio-converter.ts
│   │   ├── audio-validator.ts
│   │   └── logger.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── dist/                 # 編譯輸出
├── python_project/            # FastAPI 模型服務
│   ├── src/
│   └── requirements.txt
├── pnpm-workspace.yaml        # Workspace 配置
├── package.json               # Root workspace 配置
├── tsconfig.json              # Root TypeScript 配置
├── docker-compose.yml
├── Dockerfile.node
└── README.md
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
# 安裝整個 workspace 的所有依賴
pnpm install
```

### 2. 開發模式

```bash
# 同時啟動 client 和 server
pnpm dev

# 或分別啟動
pnpm dev:client    # Vite 在 http://localhost:5173
pnpm dev:server    # Node 在 http://localhost:3000
```

### 3. 生產編譯

```bash
# 編譯整個 workspace
pnpm build

# 或分別編譯
pnpm build:client
pnpm build:server
```

### 4. 類型檢查

```bash
# 檢查整個 workspace
pnpm check

# 或分別檢查
pnpm check:client
pnpm check:server
```

### 5. 啟動生產伺服器

```bash
# 啟動編譯後的 server
pnpm start
```

## 🔧 Workspace 配置說明

### pnpm-workspace.yaml

定義 workspace 包含的子項目：

```yaml
packages:
  - 'client'
  - 'server'
```

### Root package.json

只包含 workspace 管理和共用 scripts：

```json
{
  "private": true,
  "scripts": {
    "dev": "concurrently \"pnpm --filter client run dev\" \"pnpm --filter server run dev\"",
    "build": "pnpm --filter client run build && pnpm --filter server run build",
    "check": "pnpm --filter client run check && pnpm --filter server run check"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}
```

### Client package.json

只包含前端依賴和 scripts：

```json
{
  "name": "covid-cough-detection-client",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^7.3.1"
  }
}
```

### Server package.json

只包含後端依賴和 scripts：

```json
{
  "name": "covid-cough-detection-server",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "busboy": "^1.6.0"
  }
}
```

## 📡 API 代理設定

### Vite 代理配置

前端 Vite 在 `client/vite.config.ts` 中配置 API 代理：

```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

這樣前端開發時可以直接請求 `/api/*`，Vite 會自動轉發到 `http://localhost:3000/api/*`。

## 🐳 Docker 部署

### 使用 Docker Compose

```bash
# 構建並啟動所有服務
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止服務
docker-compose down
```

### 使用 Docker 單獨構建

```bash
# 構建 Node.js 應用（包含 client + server）
docker build -f Dockerfile.node -t covid-cough-detection:latest .

# 運行容器
docker run -p 3000:3000 covid-cough-detection:latest
```

## 📊 Workspace 命令參考

### 使用 --filter 執行特定包的命令

```bash
# 在 client 中執行 dev
pnpm --filter client run dev

# 在 server 中執行 build
pnpm --filter server run build

# 在多個包中執行命令
pnpm --filter "{client,server}" run check
```

### 使用 -C 進入特定包目錄

```bash
# 進入 client 目錄並執行命令
pnpm -C client run dev

# 進入 server 目錄並執行命令
pnpm -C server run build
```

## 🔍 常見問題

### Q: 如何只安裝特定包的依賴？

```bash
pnpm --filter client install
```

### Q: 如何添加依賴到特定包？

```bash
# 添加到 client
pnpm --filter client add react-router-dom

# 添加到 server
pnpm --filter server add dotenv
```

### Q: 如何移除依賴？

```bash
# 從 client 移除
pnpm --filter client remove react-router-dom
```

### Q: 如何在 workspace 中使用 monorepo 共用代碼？

如果需要在 client 和 server 之間共用代碼，可以創建 `shared/` 包：

```bash
# 創建 shared 包
mkdir shared
cat > shared/package.json << 'EOF'
{
  "name": "covid-cough-detection-shared",
  "version": "1.0.0",
  "main": "index.ts"
}
EOF

# 在 pnpm-workspace.yaml 中添加
# packages:
#   - 'client'
#   - 'server'
#   - 'shared'

# 在其他包中引用
# import { something } from 'covid-cough-detection-shared'
```

## 🎯 最佳實踐

1. **保持 root 簡潔** - root 只放 workspace 管理和共用 scripts
2. **獨立依賴** - 每個包只安裝自己需要的依賴
3. **清晰的 scripts** - 使用 `--filter` 明確指定執行範圍
4. **統一 TypeScript** - 使用 root tsconfig.json 作為基礎
5. **獨立 build** - 每個包有自己的 build 輸出目錄

## 📝 遷移檢查清單

- [x] 建立 pnpm-workspace.yaml
- [x] 重整 root package.json
- [x] 建立 client/package.json
- [x] 建立 server/package.json
- [x] 遷移 server 代碼到 server/src
- [x] 建立 server/tsconfig.json
- [x] 建立 client/vite.config.ts
- [x] 修正 TypeScript 配置
- [x] 更新 Dockerfile
- [x] 更新 README

## 🚀 下一步

1. 執行 `pnpm install` 安裝依賴
2. 執行 `pnpm dev` 啟動開發環境
3. 訪問 http://localhost:5173 查看前端
4. 檢查 http://localhost:3000/api/health 驗證 API

---

**版本**: 1.0.13  
**最後更新**: 2026-03-07
