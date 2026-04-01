# Phase 5 完成總結：安全性和生產環境配置

## 📋 改進清單

### 1️⃣ **Node.js 後端增強** (server/index.ts)

#### ✅ Python 後端代理
- 自動轉發到 Python FastAPI 伺服器
- 失敗時自動回退到 stub 預測
- 完整的錯誤處理和日誌記錄

#### ✅ 安全 Headers
- `X-Content-Type-Options: nosniff` - 防止 MIME 類型嗅探
- `X-Frame-Options: DENY` - 防止點擊劫持
- `X-XSS-Protection: 1; mode=block` - XSS 保護
- `Strict-Transport-Security` - HTTPS 強制
- `Content-Security-Policy` - CSP 保護

#### ✅ CORS 配置
- 允許跨域請求
- 配置允許的方法和頭部
- 生產環境可自定義

#### ✅ 速率限制
- 基於 IP 地址的速率限制
- 可配置的時間窗口和請求數
- 防止 DDoS 攻擊

#### ✅ 改進的健康檢查
- 檢查 Python 後端狀態
- 返回後端連接狀態
- 用於監控和負載均衡

#### ✅ 改進的版本端點
- 返回 Python 後端模型版本
- 返回後端連接狀態
- 用於版本追蹤

### 2️⃣ **Docker 容器化**

#### ✅ docker-compose.yml
- 完整的多容器編排
- Node.js 和 Python 後端
- 自動健康檢查
- 自動重啟策略
- 網絡隔離

#### ✅ Dockerfile.node
- 多階段構建
- 非 root 用戶運行
- 信號處理（dumb-init）
- 健康檢查
- 最小化映像大小

#### ✅ python_project/Dockerfile
- Python 3.10 slim 基礎映像
- 系統依賴安裝
- 非 root 用戶
- 健康檢查
- 最小化映像大小

### 3️⃣ **部署文檔**

#### ✅ DEPLOYMENT_GUIDE.md
- 完整的系統架構說明
- 前置需求和依賴
- 開發環境設置
- 3 種生產部署方案：
  - Docker（推薦）
  - Systemd（傳統）
  - PM2（應用管理）
- HTTPS/SSL 配置
- Nginx 反向代理配置
- 監控和日誌
- 故障排除
- 性能優化
- 備份和恢復
- 更新和維護

---

## 🔒 安全功能

### 1. HTTP 安全 Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### 2. 速率限制

- **時間窗口**: 1 分鐘
- **最大請求數**: 30 請求/分鐘
- **基於 IP 地址**: 支援代理 IP

### 3. 輸入驗證

- 音訊檔案格式驗證
- 檔案大小限制（10MB）
- Multipart 邊界驗證

### 4. 錯誤處理

- 不洩露敏感信息（生產環境）
- 詳細的開發環境日誌
- 結構化錯誤響應

---

## 🐳 Docker 部署

### 快速開始

```bash
# 構建映像
docker-compose build

# 啟動容器
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止容器
docker-compose down
```

### 訪問應用

- **前端**: http://localhost:3000
- **Node.js API**: http://localhost:3000/api
- **Python API**: http://localhost:8000
- **Python 文檔**: http://localhost:8000/docs

### 健康檢查

```bash
# 檢查 Node.js
curl http://localhost:3000/api/health

# 檢查 Python
curl http://localhost:8000/health

# Docker 健康狀態
docker ps
```

---

## 🚀 生產部署選項

### 選項 1：Docker + Kubernetes（推薦用於大規模）

```bash
# 構建並推送映像
docker build -t myregistry/covid-detection:latest .
docker push myregistry/covid-detection:latest

# 部署到 Kubernetes
kubectl apply -f k8s-deployment.yaml
```

### 選項 2：Docker + Systemd（推薦用於中等規模）

```bash
# 啟動 Docker 容器
docker run -d \
  --name covid-detection \
  -p 3000:3000 \
  -p 8000:8000 \
  --restart unless-stopped \
  covid-detection:latest
```

### 選項 3：傳統部署（小規模或學習用）

```bash
# 安裝依賴
npm install
cd python_project && pip install -r requirements.txt && cd ..

# 構建
npm run build

# 啟動服務
sudo systemctl start covid-detection-node covid-detection-python
```

---

## 📊 性能指標

### 預期性能

| 指標 | 值 |
|------|-----|
| 單個預測時間 | 100-500ms |
| 吞吐量（單 worker） | 10-20 req/s |
| 內存使用 | 200-500MB |
| CPU 使用 | 10-30% |
| 啟動時間 | 5-10s |

### 優化建議

1. **使用 CDN** - 加速靜態資源
2. **啟用 Gzip** - 壓縮響應
3. **使用 Redis** - 緩存預測結果
4. **多 worker** - 使用 PM2 或 Kubernetes
5. **GPU 加速** - 使用 CUDA 加速 PyTorch

---

## 🔍 監控和日誌

### 日誌位置

```bash
# Docker 日誌
docker-compose logs -f

# Systemd 日誌
journalctl -u covid-detection-node -f
journalctl -u covid-detection-python -f

# 應用日誌
tail -f /var/log/covid-detection/app.log
```

### 監控指標

- **CPU 使用率**: 應 < 50%
- **內存使用**: 應 < 1GB
- **磁盤使用**: 應 < 80%
- **API 響應時間**: 應 < 1s
- **錯誤率**: 應 < 1%

### 健康檢查端點

```bash
# Node.js 健康檢查
GET /api/health
Response: {
  "status": "ok",
  "timestamp": "2026-03-02T03:00:00Z",
  "python_backend": "ok"
}

# Python 健康檢查
GET /health
Response: {
  "status": "ok",
  "timestamp": "2026-03-02T03:00:00Z"
}
```

---

## 🛠️ 故障排除

### 常見問題

| 問題 | 原因 | 解決方案 |
|------|------|---------|
| 連接拒絕 | 端口被占用 | 更改端口或停止其他應用 |
| 超時 | 後端響應慢 | 增加超時時間或優化模型 |
| 內存不足 | 模型太大 | 減少批量大小或使用更小的模型 |
| CORS 錯誤 | 跨域配置 | 檢查 CORS headers |
| 404 錯誤 | 路由不存在 | 檢查 API 端點 |

### 調試技巧

```bash
# 檢查進程
ps aux | grep -E 'node|python'

# 檢查端口
netstat -tuln | grep -E '3000|8000'

# 檢查日誌
docker-compose logs --tail=100

# 測試連接
curl -v http://localhost:3000/api/health
```

---

## 📈 擴展性

### 水平擴展

```bash
# 使用 PM2 多 worker
pm2 start app.js -i 4  # 4 個 worker

# 使用 Kubernetes
kubectl scale deployment covid-detection --replicas=3
```

### 垂直擴展

- 增加 CPU 核心
- 增加內存
- 使用 GPU 加速

### 負載均衡

```nginx
upstream backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

---

## 🔐 安全檢查清單

- [ ] 啟用 HTTPS/SSL
- [ ] 配置防火牆
- [ ] 設置速率限制
- [ ] 啟用日誌記錄
- [ ] 定期更新依賴
- [ ] 使用非 root 用戶
- [ ] 配置安全 headers
- [ ] 定期備份
- [ ] 監控異常活動
- [ ] 設置告警

---

## 📝 下一步

### Phase 6：測試、文檔和最終驗收

準備進入最後階段嗎？

在 Phase 6 中，我將：
1. ✅ 完整的端到端測試
2. ✅ 性能測試
3. ✅ 安全性測試
4. ✅ 部署驗證
5. ✅ 最終交付

---

**版本**: 1.0.0  
**最後更新**: 2026-03-02
