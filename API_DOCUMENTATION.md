# API 文檔：COVID-19 咳嗽聲音偵測系統

## 📋 目錄

1. [概述](#概述)
2. [認證](#認證)
3. [Node.js 後端 API](#nodejs-後端-api)
4. [Python 後端 API](#python-後端-api)
5. [錯誤處理](#錯誤處理)
6. [速率限制](#速率限制)
7. [範例](#範例)

---

## 概述

### 系統架構

```
┌─────────────────────────────────────────────────┐
│              前端應用 (React)                    │
│          http://localhost:3000                  │
└────────────────────┬────────────────────────────┘
                     │
                     ↓ (HTTP/REST)
┌─────────────────────────────────────────────────┐
│         Node.js 後端 (Express)                  │
│         http://localhost:3000                   │
│                                                 │
│  路由：                                         │
│  - POST /api/predict                           │
│  - GET  /api/health                            │
│  - GET  /api/version                           │
└────────────────────┬────────────────────────────┘
                     │
                     ↓ (HTTP/REST)
┌─────────────────────────────────────────────────┐
│       Python 後端 (FastAPI)                     │
│       http://localhost:8000                     │
│                                                 │
│  路由：                                         │
│  - POST /predict                               │
│  - GET  /health                                │
│  - GET  /version                               │
└─────────────────────────────────────────────────┘
```

### 基本信息

| 項目 | 值 |
|------|-----|
| **基礎 URL** | `http://localhost:3000` |
| **API 版本** | 1.0.0 |
| **內容類型** | `application/json`, `multipart/form-data` |
| **響應格式** | JSON |

---

## 認證

目前系統不需要認證。生產環境建議添加：

- JWT Token 認證
- API Key 認證
- OAuth 2.0

### 實現示例

```typescript
// 添加 JWT 認證中間件
app.use((req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});
```

---

## Node.js 後端 API

### 1. 音訊預測

**端點**: `POST /api/predict`

**描述**: 上傳音訊檔案並獲取 COVID-19 預測結果

**請求**

```http
POST /api/predict HTTP/1.1
Host: localhost:3000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="audio"; filename="cough.wav"
Content-Type: audio/wav

[binary audio data]
------WebKitFormBoundary--
```

**請求參數**

| 參數 | 類型 | 必需 | 描述 |
|------|------|------|------|
| `file` | File | 是 | 音訊檔案（WAV, MP3, WebM 等） |

**請求限制**

| 限制 | 值 |
|------|-----|
| 最大檔案大小 | 10 MB |
| 支援格式 | WAV, MP3, M4A, OGG, WebM, FLAC |
| 最大時長 | 無限制（會被截斷到 10 秒） |

**成功響應**

```json
{
  "label": "positive",
  "prob": 0.85,
  "model_version": "stub-0.1",
  "processing_time_ms": 1234.5
}
```

**響應欄位**

| 欄位 | 類型 | 描述 |
|------|------|------|
| `label` | string | 預測結果 (`"positive"` 或 `"negative"`) |
| `prob` | number | 置信度 (0-1) |
| `model_version` | string | 使用的模型版本 |
| `processing_time_ms` | number | 處理時間（毫秒） |

**錯誤響應**

```json
{
  "error": "No audio file provided"
}
```

**cURL 範例**

```bash
curl -X POST http://localhost:3000/api/predict \
  -F "file=@cough.wav"
```

**JavaScript 範例**

```javascript
const formData = new FormData();
formData.append("file", audioFile);

const response = await fetch("http://localhost:3000/api/predict", {
  method: "POST",
  body: formData,
});

const result = await response.json();
console.log(result);
```

**Python 範例**

```python
import requests

with open("cough.wav", "rb") as f:
    files = {"file": f}
    response = requests.post(
        "http://localhost:3000/api/predict",
        files=files
    )

result = response.json()
print(result)
```

---

### 2. 健康檢查

**端點**: `GET /api/health`

**描述**: 檢查 API 和後端服務的健康狀態

**請求**

```http
GET /api/health HTTP/1.1
Host: localhost:3000
```

**成功響應**

```json
{
  "status": "ok",
  "timestamp": "2026-03-02T03:00:00Z",
  "python_backend": "ok"
}
```

**響應欄位**

| 欄位 | 類型 | 描述 |
|------|------|------|
| `status` | string | 服務狀態 (`"ok"` 或 `"error"`) |
| `timestamp` | string | ISO 8601 時間戳 |
| `python_backend` | string | Python 後端狀態 (`"ok"` 或 `"unavailable"`) |

**cURL 範例**

```bash
curl http://localhost:3000/api/health | jq .
```

---

### 3. 版本信息

**端點**: `GET /api/version`

**描述**: 獲取 API 和模型版本信息

**請求**

```http
GET /api/version HTTP/1.1
Host: localhost:3000
```

**成功響應**

```json
{
  "api_version": "1.0.0",
  "model_version": "stub-0.1",
  "python_backend": "connected",
  "timestamp": "2026-03-02T03:00:00Z"
}
```

**響應欄位**

| 欄位 | 類型 | 描述 |
|------|------|------|
| `api_version` | string | Node.js API 版本 |
| `model_version` | string | ML 模型版本 |
| `python_backend` | string | Python 後端連接狀態 |
| `timestamp` | string | ISO 8601 時間戳 |

**cURL 範例**

```bash
curl http://localhost:3000/api/version | jq .
```

---

## Python 後端 API

### 1. 音訊預測

**端點**: `POST /predict`

**描述**: 直接調用 Python 後端進行預測

**請求**

```http
POST /predict HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data

[binary audio data]
```

**成功響應**

```json
{
  "label": "positive",
  "prob": 0.85,
  "model_version": "stub-0.1",
  "processing_time_ms": 1234.5
}
```

**cURL 範例**

```bash
curl -X POST http://localhost:8000/predict \
  -F "file=@cough.wav"
```

---

### 2. 健康檢查

**端點**: `GET /health`

**描述**: Python 後端健康檢查

**成功響應**

```json
{
  "status": "ok",
  "timestamp": "2026-03-02T03:00:00Z"
}
```

---

### 3. 版本信息

**端點**: `GET /version`

**描述**: Python 後端版本信息

**成功響應**

```json
{
  "api_version": "1.0.0",
  "model_version": "stub-0.1",
  "timestamp": "2026-03-02T03:00:00Z"
}
```

---

### 4. API 文檔

**端點**: `GET /docs`

**描述**: Swagger UI 互動式 API 文檔

訪問: http://localhost:8000/docs

---

## 錯誤處理

### 錯誤響應格式

```json
{
  "error": "Error message",
  "details": "Optional detailed error information"
}
```

### 常見錯誤

| 狀態碼 | 錯誤 | 原因 | 解決方案 |
|--------|------|------|---------|
| 400 | No audio file provided | 未提供音訊檔案 | 檢查請求體 |
| 400 | Invalid audio format | 不支援的音訊格式 | 使用 WAV, MP3 等 |
| 413 | File too large | 檔案超過 10MB | 使用更小的檔案 |
| 429 | Too many requests | 超過速率限制 | 等待後重試 |
| 500 | Internal server error | 伺服器錯誤 | 檢查日誌 |
| 503 | Service unavailable | 服務未初始化 | 等待服務啟動 |

### 錯誤範例

**無效格式**

```bash
$ curl -X POST http://localhost:3000/api/predict \
  -F "file=@document.pdf"

{
  "error": "Invalid audio format"
}
```

**檔案過大**

```bash
$ curl -X POST http://localhost:3000/api/predict \
  -F "file=@huge_file.wav"

{
  "error": "File too large (max 10MB)"
}
```

**速率限制**

```bash
$ curl http://localhost:3000/api/health

{
  "error": "Too many requests",
  "details": "Please wait before making another request"
}
```

---

## 速率限制

### 限制規則

| 規則 | 值 |
|------|-----|
| 時間窗口 | 1 分鐘 |
| 最大請求數 | 30 請求 |
| 基於 | IP 地址 |

### 響應頭

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1646217600
```

### 處理建議

1. 實現指數退避重試
2. 緩存預測結果
3. 使用隊列系統
4. 聯繫管理員申請提高限制

---

## 範例

### 完整的預測流程

#### 1. 前端錄音

```javascript
// 開始錄音
const mediaRecorder = new MediaRecorder(stream);
const chunks = [];

mediaRecorder.ondataavailable = (e) => {
  chunks.push(e.data);
};

mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(chunks, { type: "audio/webm" });
  
  // 上傳
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  
  const response = await fetch("/api/predict", {
    method: "POST",
    body: formData,
  });
  
  const result = await response.json();
  console.log("預測結果:", result);
};

mediaRecorder.start();
```

#### 2. 後端處理

```typescript
// Node.js 後端
app.post("/api/predict", async (req, res) => {
  // 1. 解析 multipart 數據
  const { file, filename } = await parseMultipart(req);
  
  // 2. 驗證音訊
  const validation = validateAudioFile(file, filename);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  
  // 3. 轉發到 Python 後端
  const response = await fetch("http://localhost:8000/predict", {
    method: "POST",
    body: formData,
  });
  
  // 4. 返回結果
  const result = await response.json();
  res.json(result);
});
```

#### 3. Python 推論

```python
# Python 後端
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    # 1. 讀取音訊
    audio_data = await file.read()
    
    # 2. 處理音訊
    processed = audio_processor.process_audio_file(audio_data)
    
    # 3. 提取特徵
    features = processed["features"]["mel_spectrogram"]
    
    # 4. 運行推論
    label, prob = model_inference.predict(features)
    
    # 5. 返回結果
    return {
        "label": label,
        "prob": prob,
        "model_version": model_inference.model_version,
        "processing_time_ms": duration,
    }
```

---

## 最佳實踐

### 1. 錯誤處理

```javascript
try {
  const response = await fetch("/api/predict", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("預測失敗:", error.error);
    return;
  }

  const result = await response.json();
  console.log("預測成功:", result);
} catch (err) {
  console.error("網絡錯誤:", err);
}
```

### 2. 重試邏輯

```javascript
async function predictWithRetry(
  formData,
  maxRetries = 3,
  delay = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 429) {
        // 速率限制，等待後重試
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // 指數退避
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

### 3. 結果緩存

```javascript
const predictionCache = new Map();

async function predictWithCache(audioBlob) {
  // 生成緩存鍵
  const cacheKey = await hashBlob(audioBlob);

  // 檢查緩存
  if (predictionCache.has(cacheKey)) {
    return predictionCache.get(cacheKey);
  }

  // 進行預測
  const formData = new FormData();
  formData.append("file", audioBlob);
  const result = await fetch("/api/predict", {
    method: "POST",
    body: formData,
  }).then((r) => r.json());

  // 緩存結果
  predictionCache.set(cacheKey, result);

  return result;
}
```

---

## 支持和聯繫

如有問題，請：

1. 查看 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
2. 查看 [TESTING_GUIDE.md](./TESTING_GUIDE.md)
3. 檢查日誌文件
4. 提交 GitHub Issue

---

**版本**: 1.0.0  
**最後更新**: 2026-03-02
