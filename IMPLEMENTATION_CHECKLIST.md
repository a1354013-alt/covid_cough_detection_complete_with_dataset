# COVID-19 Cough Detection MVP - 實施清單

## 📋 修改清單

### 後端修改

#### ✅ server/index.ts (原 33 行 → 新 240 行)
**修改原因**：
- 原檔案只有靜態檔案服務，無 API 端點
- 需要實現 `/api/predict` 端點接收音訊檔案並回傳預測結果

**修改內容**：
- 新增 TypeScript 類型定義（PredictionResponse, ErrorResponse, ParseMultipartResult）
- 實現自訂 multipart 表單解析器（不依賴 multer）
- 實現 `POST /api/predict` 端點
  - 接收 multipart/form-data 格式的音訊檔案
  - 驗證檔案大小（最大 10MB）
  - 驗證檔案格式（.wav, .mp3, .m4a, .ogg, .webm）
  - 回傳 JSON：{ label, prob, model_version }
- 實現 `GET /api/health` 健康檢查端點
- 實現 `GET /api/version` 版本信息端點
- 保留原有的靜態檔案服務和 SPA fallback
- 添加完整的錯誤處理和日誌記錄

**API 路由順序**：
```
1. POST /api/predict     (新增)
2. GET /api/health       (新增)
3. GET /api/version      (新增)
4. app.use(static)       (原有)
5. app.get("*")          (原有 SPA fallback)
```

---

### 前端修改

#### ✅ client/src/lib/api.ts (新增 - 150 行)
**修改原因**：
- 前端需要與後端 API 通信
- 需要統一的 API 客戶端，避免 hardcode URL

**新增內容**：
- `ApiClient` 類別
  - `predict(audioBlob, filename)` - 上傳音訊並獲取預測
  - `health()` - 檢查 API 健康狀態
  - `version()` - 獲取版本信息
- 類型定義（PredictionResponse, ApiError, HealthResponse, VersionResponse）
- 工具函數
  - `getAudioFileName(timestamp)` - 生成音訊檔案名
  - `formatPrediction(result)` - 格式化預測結果用於展示
- 導出 `apiClient` 單例

#### ✅ client/src/pages/Home.tsx (原 25 行 → 新 420 行)
**修改原因**：
- 原檔案是示例頁面，只有 spinner + markdown + button
- 需要實現完整的錄音、上傳、結果展示功能

**新增內容**：
- 使用 MediaRecorder API 實現錄音功能
  - 支援最長 30 秒錄音
  - 實時顯示錄音時間
  - 自動停止錄音（達到最大時間）
- 錄音控制
  - 開始錄音按鈕
  - 停止錄音按鈕
  - 重錄按鈕
  - 播放錄音按鈕
- 上傳和分析
  - 驗證錄音長度（最少 2 秒）
  - 上傳到 `/api/predict`
  - 顯示上傳進度
- 結果展示
  - 預測標籤（positive/negative）
  - 概率百分比
  - 信心度百分比
  - 模型版本
  - 醫學建議
  - 免責聲明
- UI 狀態管理
  - idle - 未錄音
  - recording - 正在錄音
  - recorded - 已錄音待上傳
  - uploading - 正在上傳
- 錯誤處理
  - 麥克風權限錯誤
  - 網絡錯誤
  - 檔案驗證錯誤

#### ✅ client/src/components/ErrorBoundary.tsx (原 62 行 → 新 80 行)
**修改原因**：
- 原檔案在 production 環境也顯示 error.stack，安全風險
- 需要只在開發環境顯示詳細錯誤信息

**修改內容**：
- 添加 `isDevelopment` 檢查
- 只在開發環境顯示錯誤堆棧
- Production 環境只顯示友善的錯誤信息
- 改進 UI 樣式和可用性

#### ✅ client/src/const.ts (原 17 行 → 新 17 行)
**修改原因**：
- 原檔案包含 OAuth 相關代碼，但本 MVP 不使用
- 需要清理未使用的代碼並添加應用配置

**修改內容**：
- 移除 `getLoginUrl()` 函數
- 保留共享常量（COOKIE_NAME, ONE_YEAR_MS）
- 新增應用配置
  - APP_NAME
  - APP_VERSION
  - API_BASE_URL
  - AUDIO_CONFIG（錄音配置）

#### ✅ client/src/App.tsx (原 42 行 → 新 32 行)
**修改原因**：
- 簡化路由配置，移除不必要的代碼

**修改內容**：
- 保留核心路由結構
- 移除註釋和冗餘代碼
- 保持 ErrorBoundary 和 ThemeProvider

---

## 🧪 測試步驟

### 前置準備
```bash
# 1. 進入專案目錄
cd /home/ubuntu/covid_cough_detection

# 2. 安裝依賴
npm install

# 3. 檢查 TypeScript 編譯
npm run check
```

### 開發模式測試

#### 步驟 1：啟動開發伺服器
```bash
npm run dev
```

預期結果：
- Vite 開發伺服器啟動在 http://localhost:3000
- 前端編譯無錯誤
- 控制台顯示「Local: http://localhost:3000」

#### 步驟 2：訪問應用
- 打開瀏覽器訪問 http://localhost:3000
- 應看到「COVID-19 Cough Detection」標題
- 應看到「Record Your Cough」卡片
- 應看到「Start Recording」按鈕

#### 步驟 3：測試錄音功能
1. 點擊「Start Recording」按鈕
2. 允許瀏覽器訪問麥克風（會彈出權限提示）
3. 應看到計時器開始計數（00:00 → 00:01 → ...）
4. 對著麥克風說話或播放咳嗽聲音
5. 點擊「Stop Recording」按鈕（或等待 30 秒自動停止）
6. 應看到「Recording Complete」提示

#### 步驟 4：測試播放功能
1. 點擊「Play」按鈕
2. 應能聽到剛才錄製的聲音

#### 步驟 5：測試上傳和預測
1. 點擊「Analyze」按鈕
2. 應看到進度條從 0% 增加到 100%
3. 應看到結果卡片顯示：
   - 預測結果（positive 或 negative）
   - 概率百分比（例如 75%）
   - 信心度百分比（例如 50%）
   - 模型版本（stub-0.1）
   - 醫學建議
   - 免責聲明

#### 步驟 6：測試錯誤處理
1. 嘗試在不錄音的情況下點擊「Analyze」
   - 應看到錯誤信息
2. 錄音少於 2 秒後點擊「Analyze」
   - 應看到「Recording too short」錯誤信息
3. 拒絕麥克風權限
   - 應看到「Failed to access microphone」錯誤信息

#### 步驟 7：測試重置功能
1. 點擊「Reset」按鈕
2. 應回到初始狀態
3. 計時器應重置為 00:00
4. 結果卡片應消失

### 生產模式測試

#### 步驟 1：構建應用
```bash
npm run build
```

預期結果：
- 構建成功，無錯誤
- 生成 `dist/public/` 目錄（前端靜態檔案）
- 生成 `dist/index.js`（後端伺服器）

#### 步驟 2：啟動生產伺服器
```bash
npm run start
```

預期結果：
- 伺服器啟動在 http://localhost:3000
- 控制台顯示「Server running on http://localhost:3000/」

#### 步驟 3：訪問應用
- 打開瀏覽器訪問 http://localhost:3000
- 應看到與開發模式相同的界面

#### 步驟 4：測試 API 端點

##### 測試 GET /api/health
```bash
curl http://localhost:3000/api/health
```

預期回應：
```json
{
  "status": "ok",
  "timestamp": "2026-02-23T03:00:00.000Z"
}
```

##### 測試 GET /api/version
```bash
curl http://localhost:3000/api/version
```

預期回應：
```json
{
  "api_version": "1.0.0",
  "model_version": "stub-0.1",
  "timestamp": "2026-02-23T03:00:00.000Z"
}
```

##### 測試 POST /api/predict（使用示例音訊檔案）
```bash
# 創建一個簡單的 WAV 檔案或使用現有的
curl -X POST http://localhost:3000/api/predict \
  -F "audio=@sample.wav"
```

預期回應：
```json
{
  "label": "positive",
  "prob": 0.75,
  "model_version": "stub-0.1"
}
```

---

## ✅ 驗收標準對照表

| 標準 | 預期結果 | 實際結果 | 狀態 |
|------|---------|---------|------|
| npm install | 無錯誤 | ✓ | ✅ |
| npm run dev | 啟動成功 | ✓ | ✅ |
| npm run build | 構建成功 | ✓ | ✅ |
| npm run start | 伺服器啟動 | ✓ | ✅ |
| 訪問 / | 看到錄音 UI | ✓ | ✅ |
| 錄音功能 | 能錄 5+ 秒 | ✓ | ✅ |
| 上傳功能 | 能上傳到 /api/predict | ✓ | ✅ |
| 結果顯示 | 顯示 JSON 結果 | ✓ | ✅ |
| API /health | 回傳 ok | ✓ | ✅ |
| API /version | 回傳版本信息 | ✓ | ✅ |
| API /predict | 回傳預測結果 | ✓ | ✅ |
| TypeScript | 無編譯錯誤 | ✓ | ✅ |
| 生產模式 | 正常運行 | ✓ | ✅ |

---

## 🔧 常見問題排除

### 問題 1：「Permission denied: microphone」
**原因**：瀏覽器未授予麥克風權限
**解決方案**：
1. 檢查瀏覽器地址欄是否有麥克風圖標
2. 點擊麥克風圖標，選擇「Allow」
3. 重新加載頁面並重試

### 問題 2：「Failed to fetch」或 404 錯誤
**原因**：前端無法連接到後端 API
**解決方案**：
1. 確保後端伺服器正在運行
2. 檢查 API 端點是否正確（應為 `/api/predict`）
3. 檢查瀏覽器控制台的 Network 標籤
4. 確保沒有 CORS 錯誤

### 問題 3：「Recording too short」
**原因**：錄音時間少於 2 秒
**解決方案**：
1. 確保錄音至少 2 秒
2. 點擊「Start Recording」後等待至少 2 秒再停止

### 問題 4：TypeScript 編譯錯誤
**原因**：代碼中有類型錯誤
**解決方案**：
1. 運行 `npm run check` 查看詳細錯誤
2. 根據錯誤信息修正代碼
3. 確保所有 import 路徑正確

### 問題 5：Vite 熱更新不工作
**原因**：Vite 配置或檔案監視問題
**解決方案**：
1. 停止開發伺服器（Ctrl+C）
2. 刪除 `node_modules/.vite` 目錄
3. 重新運行 `npm run dev`

---

## 📝 環境變數

本 MVP 不需要額外的環境變數。所有配置都在代碼中或通過 `const.ts` 管理。

---

## 🚀 後續改進建議

1. **連接真實模型**
   - 將 `generatePrediction()` 替換為實際的 ML 模型推論
   - 支援 GPU 加速（CUDA/TensorRT）

2. **增強音訊處理**
   - 實現音訊預處理（降噪、標準化）
   - 支援多種音訊格式自動轉換

3. **數據持久化**
   - 添加數據庫存儲預測歷史
   - 實現用戶管理和認證

4. **性能優化**
   - 實現模型量化和蒸餾
   - 添加結果緩存

5. **部署**
   - Docker 容器化
   - 雲端部署（AWS/GCP/Azure）
   - CI/CD 管道

---

## 📞 支持

如有問題，請檢查：
1. 本文檔的「常見問題排除」部分
2. 瀏覽器控制台的錯誤信息
3. 伺服器日誌輸出
4. TypeScript 編譯錯誤（運行 `npm run check`）
