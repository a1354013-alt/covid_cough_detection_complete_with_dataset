# COVID-19 Cough Detection

一個以 **React + Vite + TypeScript + Express + FastAPI + PyTorch** 建構的咳嗽音訊分析系統。使用者可直接在瀏覽器錄製咳嗽聲，將音訊送至後端進行前處理與模型推論，並回傳預測結果與模型版本資訊。

> **重要提醒**
> 本專案目前較適合作為 **音訊 AI Web App / 全端整合 Demo**，不是可直接用於醫療診斷的正式醫材系統。若 Python 模型服務或訓練模型未正確配置，系統會進入 **stub / demo mode**，結果僅供展示流程使用。

---

## 專案特色

- **瀏覽器端錄音**：直接使用麥克風錄製咳嗽音訊
- **音訊上傳與驗證**：支援檔案大小限制、格式檢查、magic bytes 驗證
- **音訊前處理**：包含重採樣、靜音裁切、正規化、固定長度處理
- **特徵擷取**：支援 MFCC 與 Mel-Spectrogram
- **模型推論 API**：FastAPI + PyTorch 推論流程
- **Node.js Proxy Server**：處理前端請求、multipart parsing、rate limiting、health/version proxy
- **前後端分離架構**：前端 React，API Proxy 使用 Express，AI 服務使用 Python FastAPI
- **容器化部署準備**：包含 Dockerfile 與 docker-compose 設定

---

## 系統架構

```text
Browser (React/Vite)
   ↓
Node.js / Express Proxy
   ↓
Python FastAPI Inference Service
   ↓
Audio Processing + PyTorch Model
```

### 流程說明

1. 使用者在前端錄製咳嗽聲音
2. 前端將音訊以 multipart/form-data 上傳至 Node.js API
3. Node.js 先做檔案驗證與安全檢查
4. 驗證通過後，Node.js 將音訊轉送至 Python FastAPI
5. Python 端進行音訊前處理與特徵擷取
6. 模型輸出預測結果
7. 結果回傳前端顯示

---

## 技術棧

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Wouter
- Lucide React

### Backend
- Node.js
- Express
- Busboy
- TypeScript

### AI / Python
- FastAPI
- PyTorch
- Librosa
- NumPy
- SciPy

### DevOps
- Docker
- Docker Compose

---

## 專案結構

```text
covid_cough_detection/
├─ client/                  # React 前端
│  ├─ src/
│  │  ├─ pages/             # 頁面
│  │  ├─ components/        # UI 元件
│  │  ├─ lib/               # API client / utilities
│  │  └─ contexts/          # Theme context
├─ server/                  # Node.js / Express proxy server
├─ python_project/          # FastAPI + 音訊處理 + 模型推論
│  ├─ src/
│  │  ├─ app.py
│  │  ├─ audio_processor.py
│  │  └─ model_inference.py
├─ shared/                  # 前後端共用常數
├─ docker-compose.yml
├─ Dockerfile.node
└─ README.md
```

---

## 主要功能

### 1. 咳嗽錄音
- 支援瀏覽器麥克風錄音
- 最長錄音時間限制
- 支援播放錄音內容
- 上傳前可重新錄製

### 2. API 保護與驗證
- 檔案大小限制
- 音訊格式檢查
- magic bytes 驗證
- rate limiting
- request timeout

### 3. 模型推論
- Mel-Spectrogram 特徵輸入
- 支援載入實際模型檔案
- 若未提供模型則進入 demo mode

### 4. 系統狀態檢查
- `/api/health`
- `/api/version`
- Python backend 連線狀態檢查

---

## 快速開始

### 1. 安裝 Node.js 與 Python 依賴

> 目前此專案結構仍需補強安裝設定；若直接執行，前端依賴與 client package 設定可能需要先整理。

#### Node.js
```bash
npm install
```

#### Python
```bash
cd python_project
pip install -r requirements.txt
```

---

### 2. 啟動 Python 推論服務

```bash
cd python_project/src
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

---

### 3. 啟動 Node.js / React 開發環境

```bash
npm run dev
```

---

## 環境變數

### Node.js / Express

```env
PORT=3000
PYTHON_API_URL=http://localhost:8000
REQUEST_TIMEOUT=60000
RATE_LIMIT_MAX_REQUESTS=30
TRUST_PROXY=1
CSP_CONNECT_SRC_EXTRA=
```

### Python / FastAPI

```env
MODEL_PATH=/path/to/model.pt
```

---

## API 範例

### POST `/api/predict`
上傳音訊並取得預測結果。

#### Request
- Content-Type: `multipart/form-data`
- Field name: `audio` 或 `file`

#### Response
```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "trained-1.0"
}
```

### GET `/api/health`
```json
{
  "status": "ok",
  "timestamp": "2026-03-13T10:00:00Z",
  "python_backend": "ok"
}
```

### GET `/api/version`
```json
{
  "api_version": "1.0.0",
  "model_version": "trained-1.0",
  "python_backend": "connected",
  "timestamp": "2026-03-13T10:00:00Z"
}
```

---

## 目前版本定位

- 全端整合能力
- 音訊 AI 應用雛形
- React / TypeScript 前端互動
- Node.js 與 Python 雙後端串接
- 音訊上傳、驗證、推論、結果顯示流程



## 已知限制

- 若未提供實際模型，系統會使用 **stub model**
- 專案目前醫療聲明偏強，仍需更清楚標示為研究 / 展示用途
- 前端依賴與 package 結構仍需整理，否則初次 clone 後可能無法直接執行
- 目前結果頁顯示的是單次推論結果，尚未建立歷史紀錄或使用者管理

---

## Roadmap

- [ ] 補齊前端依賴與 client/package.json
- [ ] 完成正式訓練模型載入流程
- [ ] 新增單元測試與 API 測試
- [ ] 新增檔案上傳模式（非即時錄音）
- [ ] 顯示更多推論 metadata
- [ ] 建立部署到雲端的完整流程
- [ ] 加入使用者歷史分析紀錄

---

## 免責聲明

本專案僅供 **研究、學習與技術展示** 使用，不可替代專業醫療診斷、篩檢或治療建議。若有任何疑似症狀，請洽專業醫療人員。

---

## License

MIT License。
