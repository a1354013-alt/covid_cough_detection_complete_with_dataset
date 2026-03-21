# COVID-19 咳嗽聲音偵測系統 - 實施指南

## 📋 目錄

1. [系統架構](#系統架構)
2. [快速開始](#快速開始)
3. [開發流程](#開發流程)
4. [部署指南](#部署指南)
5. [故障排除](#故障排除)
6. [下一步改進](#下一步改進)

---

## 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                     用戶瀏覽器                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React 前端 (client/)                                │  │
│  │  - 麥克風錄音 (MediaRecorder API)                    │  │
│  │  - 音訊上傳 (XHR + FormData)                         │  │
│  │  - 結果顯示                                          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Node.js Express 後端 (server/)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/predict                                        │  │
│  │  - Multipart 解析 (busboy)                           │  │
│  │  - 音訊驗證 (magic bytes)                            │  │
│  │  - 格式轉換 (audio-converter)                        │  │
│  │  - 轉送到 Python                                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Python FastAPI 後端 (python_project/)             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /predict                                            │  │
│  │  - 音訊處理 (librosa)                                │  │
│  │  - 特徵提取 (MFCC, Mel-spectrogram)                 │  │
│  │  - ML 推理 (PyTorch)                                 │  │
│  │  - 結果返回                                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 快速開始

### 前置要求

- Node.js 18+ 和 pnpm
- Python 3.8+
- Docker 和 Docker Compose（可選，用於部署）

### 開發環境設置

```bash
# 1. 克隆或解壓項目
tar -xzf covid_cough_detection_v1.0.11.tar.gz
cd covid_cough_detection

# 2. 安裝依賴
pnpm install

# 3. 安裝 Python 依賴
cd python_project
pip install -r requirements.txt
cd ..

# 4. 啟動開發服務
# 終端 1: Node 後端 + 前端
npm run dev

# 終端 2: Python 後端
cd python_project
python -m uvicorn src.app:app --reload --host 0.0.0.0 --port 8000
```

### 訪問應用

- 前端: http://localhost:3000
- Node API: http://localhost:3000/api
- Python API: http://localhost:8000
- Python 文檔: http://localhost:8000/docs

---

## 💻 開發流程

### 文件結構

```
covid_cough_detection/
├── client/                          # React 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx            # 主頁面（錄音和上傳）
│   │   │   └── NotFound.tsx         # 404 頁面
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui 組件
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   └── api.ts              # API 客戶端
│   │   ├── App.tsx                 # 路由配置
│   │   ├── main.tsx                # 入口點
│   │   └── index.css               # 全局樣式
│   ├── public/                     # 靜態資源
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
│
├── server/                          # Node.js 後端
│   ├── index.ts                    # Express 應用
│   ├── audio-validator.ts          # 音訊驗證
│   ├── audio-converter.ts          # 格式轉換
│   ├── logger.ts                   # 日誌系統
│   └── tsconfig.json
│
├── python_project/                  # Python 後端
│   ├── src/
│   │   ├── app.py                  # FastAPI 應用
│   │   ├── audio_processor.py      # 音訊處理
│   │   ├── model_inference.py      # ML 推理
│   │   └── ...
│   ├── requirements.txt
│   └── Dockerfile
│
├── shared/                          # 共享類型
│   └── const.ts
│
├── package.json                     # 根 package.json
├── vite.config.ts                  # Vite 配置
├── tsconfig.json                   # 根 TypeScript 配置
├── Dockerfile.node                 # Node 容器
├── docker-compose.yml              # 容器編排
└── FIXES_v1.0.11.md               # 修正說明
```

### 開發命令

```bash
# 開發模式
npm run dev              # 同時啟動前端和後端

# 編譯
npm run build            # 編譯前端和後端
npm run build:client     # 只編譯前端
npm run build:server     # 只編譯後端

# 生產模式
npm run start            # 啟動編譯後的應用

# 檢查
npm run check            # TypeScript 類型檢查
npm run lint             # ESLint 檢查
npm run format           # Prettier 格式化
```

---

## 🐳 部署指南

### Docker Compose 部署

```bash
# 構建鏡像
docker-compose build

# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止服務
docker-compose down
```

### 環境變數配置

創建 `.env` 文件：

```env
# Node 後端
NODE_ENV=production
PYTHON_API_URL=http://python-backend:8000
REQUEST_TIMEOUT=60000
RATE_LIMIT_MAX_REQUESTS=30
TRUST_PROXY=1

# Python 後端
MODEL_PATH=/app/models/model.pth
DEVICE=cpu  # 或 cuda
```

### 生產部署檢查清單

- [ ] 設置 HTTPS/TLS
- [ ] 配置 CORS 策略
- [ ] 設置速率限制
- [ ] 配置日誌收集
- [ ] 設置監控告警
- [ ] 實現完整的音訊格式轉換（ffmpeg）
- [ ] 添加醫療合規性檢查（HIPAA, GDPR）
- [ ] 進行安全審計

---

## 🔧 故障排除

### 問題 1: Python 後端連接失敗

**症狀**: 返回 503 Service Unavailable

**解決方案**:
```bash
# 檢查 Python 服務是否運行
curl http://localhost:8000/health

# 查看 Python 日誌
docker-compose logs python-backend

# 檢查網絡連接
docker-compose exec node-backend ping python-backend
```

### 問題 2: 音訊上傳失敗

**症狀**: 400 Bad Request 或 413 Payload Too Large

**解決方案**:
```bash
# 檢查文件大小（限制 10MB）
ls -lh your_audio_file

# 檢查 MIME 類型是否支援
# 支援: WAV, MP3, M4A, OGG, WebM

# 查看詳細錯誤信息（開發模式）
NODE_ENV=development npm run start
```

### 問題 3: 錄音時間不正確

**症狀**: UI 顯示的秒數與實際不符

**解決方案**:
- 確認使用了 `recordingTimeRef` 而不是 state
- 檢查計時器是否正確清除
- 查看瀏覽器控制台是否有錯誤

### 問題 4: Confidence 值異常

**症狀**: Confidence 總是很低或很高

**解決方案**:
- 驗證 `formatPrediction` 使用了正確的公式
- 檢查 `prob` 值是否在 0-1 之間
- 查看 Python 後端返回的 `prob` 值

---

## 📈 下一步改進

### 短期（1-2 週）

1. **實現完整的音訊格式轉換**
   - 集成 ffmpeg
   - 添加格式轉換單元測試
   - 性能優化

2. **添加完整的測試套件**
   - 前端單元測試 (Jest + React Testing Library)
   - 後端集成測試 (Supertest)
   - Python 單元測試 (pytest)

3. **改進錯誤處理**
   - 更詳細的錯誤信息
   - 用戶友好的錯誤提示
   - 錯誤追蹤和監控

### 中期（1 個月）

1. **性能優化**
   - 前端代碼分割
   - 後端緩存策略
   - 數據庫優化（如果添加持久化）

2. **醫療合規性**
   - HIPAA 合規性審查
   - GDPR 隱私政策
   - 數據加密和安全

3. **用戶體驗**
   - 添加進度指示
   - 改進 UI/UX
   - 多語言支持

### 長期（3 個月+）

1. **ML 模型改進**
   - 使用更大的訓練數據集
   - 模型集成和 ensemble
   - 持續學習和模型更新

2. **功能擴展**
   - 批量上傳
   - 歷史記錄管理
   - 用戶認證和授權
   - 醫生儀表板

3. **基礎設施**
   - 自動化部署 (CI/CD)
   - 負載均衡
   - 數據庫集成
   - 消息隊列（用於異步處理）

---

## 📞 支持和反饋

如有問題或建議，請：

1. 檢查 `FIXES_v1.0.11.md` 了解最新修正
2. 查看故障排除部分
3. 檢查日誌文件以獲取詳細信息
4. 提交 issue 或 pull request

---

## 📄 許可證

本項目遵循 MIT 許可證。詳見 LICENSE 文件。

---

**版本**: 1.0.11  
**最後更新**: 2026-03-06  
**狀態**: ✅ 生產就緒（核心功能）
