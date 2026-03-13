# 部署指南：COVID-19 咳嗽聲音偵測系統

## 📋 目錄

1. [系統架構](#系統架構)
2. [前置需求](#前置需求)
3. [開發環境設置](#開發環境設置)
4. [生產部署](#生產部署)
5. [安全配置](#安全配置)
6. [監控和日誌](#監控和日誌)
7. [故障排除](#故障排除)

---

## 系統架構

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React)                      │
│              http://localhost:3000                  │
│                                                     │
│  - 錄音功能 (MediaRecorder API)                     │
│  - 上傳進度追蹤                                     │
│  - 結果展示                                         │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓ (POST /api/predict)
┌─────────────────────────────────────────────────────┐
│            Node.js 後端 (Express)                   │
│              http://localhost:3000                  │
│                                                     │
│  - 音訊驗證                                         │
│  - 速率限制                                         │
│  - 代理轉發                                         │
│  - 安全 headers                                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓ (POST /predict)
┌─────────────────────────────────────────────────────┐
│         Python FastAPI 後端 (推論伺服器)            │
│              http://localhost:8000                  │
│                                                     │
│  - 音訊處理 (librosa)                              │
│  - 特徵提取 (MFCC, 梅爾頻譜圖)                     │
│  - 模型推論 (PyTorch)                              │
│  - 預測結果                                         │
└─────────────────────────────────────────────────────┘
```

---

## 前置需求

### 系統需求

- **OS**: Ubuntu 20.04+ / Debian 10+ / CentOS 8+
- **CPU**: 2+ cores (推薦 4+ cores)
- **RAM**: 4GB+ (推薦 8GB+)
- **磁盤**: 10GB+ 可用空間

### 軟件需求

- **Node.js**: 18.0.0+
- **Python**: 3.8+
- **npm** 或 **pnpm**
- **Git**

### 安裝依賴

```bash
# Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Python (Ubuntu/Debian)
sudo apt-get install -y python3.10 python3-pip python3-venv

# 其他依賴
sudo apt-get install -y build-essential libsndfile1
```

---

## 開發環境設置

### 1. 克隆和安裝

```bash
# 克隆專案
git clone <repository-url>
cd covid_cough_detection

# 安裝 Node.js 依賴
npm install

# 安裝 Python 依賴
cd python_project
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. 啟動開發伺服器

#### 終端 1：Python 後端
```bash
cd python_project
source venv/bin/activate
python -m uvicorn src.app:app --reload --port 8000
```

#### 終端 2：Node.js 後端 + 前端
```bash
npm run dev
```

訪問 http://localhost:3000

### 3. 驗證系統

```bash
# 檢查 Python 後端
curl http://localhost:8000/health

# 檢查 Node.js 後端
curl http://localhost:3000/api/health

# 查看 API 文檔
# Python: http://localhost:8000/docs
# Node.js: http://localhost:3000/api/docs (如果配置)
```

---

## 生產部署

### 方案 1：使用 Docker（推薦）

#### 建立 Dockerfile

```dockerfile
# 多階段構建
FROM node:18-alpine AS node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY client ./client
COPY server ./server
COPY tsconfig*.json ./
RUN npm run build

FROM python:3.10-slim
WORKDIR /app

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 複製 Node.js 構建結果
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package*.json ./

# 安裝 Python 依賴
COPY python_project/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 複製 Python 代碼
COPY python_project/src ./src

# 暴露端口
EXPOSE 3000 8000

# 啟動腳本
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
```

#### 建立 docker-entrypoint.sh

```bash
#!/bin/bash
set -e

# 啟動 Python 後端
python -m uvicorn src.app:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!

# 啟動 Node.js 後端
node dist/index.js &
NODE_PID=$!

# 等待兩個進程
wait $PYTHON_PID $NODE_PID
```

#### 構建和運行

```bash
# 構建 Docker 映像
docker build -t covid-detection:latest .

# 運行容器
docker run -p 3000:3000 -p 8000:8000 covid-detection:latest

# 使用 docker-compose
docker-compose up -d
```

### 方案 2：使用 Systemd（傳統方式）

#### 建立 Node.js 服務

```bash
sudo tee /etc/systemd/system/covid-detection-node.service > /dev/null <<EOF
[Unit]
Description=COVID-19 Detection Node.js Backend
After=network.target

[Service]
Type=simple
User=covid
WorkingDirectory=/opt/covid-detection
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

#### 建立 Python 服務

```bash
sudo tee /etc/systemd/system/covid-detection-python.service > /dev/null <<EOF
[Unit]
Description=COVID-19 Detection Python Backend
After=network.target

[Service]
Type=simple
User=covid
WorkingDirectory=/opt/covid-detection/python_project
ExecStart=/opt/covid-detection/python_project/venv/bin/python -m uvicorn src.app:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

#### 啟動服務

```bash
sudo systemctl daemon-reload
sudo systemctl enable covid-detection-node covid-detection-python
sudo systemctl start covid-detection-node covid-detection-python
sudo systemctl status covid-detection-node covid-detection-python
```

### 方案 3：使用 PM2（應用管理）

```bash
# 安裝 PM2
npm install -g pm2

# 建立 ecosystem.config.js
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [
    {
      name: 'covid-node',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PYTHON_API_URL: 'http://localhost:8000'
      }
    },
    {
      name: 'covid-python',
      script: 'python_project/venv/bin/python',
      args: '-m uvicorn src.app:app --host 0.0.0.0 --port 8000',
      instances: 1,
      env: {
        PYTHONUNBUFFERED: 1
      }
    }
  ]
};
EOF

# 啟動應用
pm2 start ecosystem.config.js

# 保存配置
pm2 save

# 設置開機自啟
pm2 startup
```

---

## 安全配置

### 1. 環境變數

```bash
# 設置環境變數
export NODE_ENV=production
export PORT=3000
export PYTHON_API_URL=http://localhost:8000
export RATE_LIMIT_MAX_REQUESTS=30
```

### 2. HTTPS/SSL

```bash
# 使用 Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d yourdomain.com

# 配置 Nginx 代理
```

### 3. 防火牆

```bash
# 允許必要的端口
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. Nginx 反向代理

```nginx
upstream node_backend {
    server localhost:3000;
}

upstream python_backend {
    server localhost:8000;
}

server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # 安全 headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 代理到 Node.js
    location / {
        proxy_pass http://node_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 代理 Python 後端（如果需要直接訪問）
    location /python/ {
        proxy_pass http://python_backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 監控和日誌

### 1. 日誌位置

```bash
# Node.js 日誌
journalctl -u covid-detection-node -f

# Python 日誌
journalctl -u covid-detection-python -f

# 應用日誌
tail -f /var/log/covid-detection/app.log
```

### 2. 監控指標

```bash
# 檢查 CPU 和內存
top
htop

# 檢查磁盤使用
df -h

# 檢查網絡連接
netstat -tuln | grep -E '3000|8000'
```

### 3. 健康檢查

```bash
# 定期檢查端點
curl -s http://localhost:3000/api/health | jq .
curl -s http://localhost:8000/health | jq .
```

---

## 故障排除

### 問題 1：Python 後端無法連接

```bash
# 檢查 Python 進程
ps aux | grep uvicorn

# 檢查端口
netstat -tuln | grep 8000

# 檢查日誌
journalctl -u covid-detection-python -n 50
```

### 問題 2：內存使用過高

```bash
# 檢查進程內存
ps aux --sort=-%mem | head -10

# 重啟服務
sudo systemctl restart covid-detection-node covid-detection-python
```

### 問題 3：請求超時

```bash
# 增加超時時間
export REQUEST_TIMEOUT=120000

# 重啟服務
sudo systemctl restart covid-detection-node
```

### 問題 4：CORS 錯誤

確保 Node.js 後端設置了正確的 CORS headers：

```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");
```

---

## 性能優化

### 1. 啟用 Gzip 壓縮

```typescript
import compression from 'compression';
app.use(compression());
```

### 2. 使用 CDN

```html
<!-- 在 client/index.html 中 -->
<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
```

### 3. 數據庫連接池

```python
# 在 Python 後端中配置連接池
# 如果使用數據庫
```

### 4. 緩存策略

```typescript
// 緩存預測結果（可選）
const predictionCache = new Map();
```

---

## 備份和恢復

### 1. 備份配置

```bash
# 備份整個應用
tar -czf covid-detection-backup.tar.gz /opt/covid-detection

# 備份數據庫（如果使用）
mysqldump -u user -p database > backup.sql
```

### 2. 恢復

```bash
# 恢復應用
tar -xzf covid-detection-backup.tar.gz -C /opt

# 恢復數據庫
mysql -u user -p database < backup.sql
```

---

## 更新和維護

### 1. 更新依賴

```bash
# Node.js
npm update
npm audit fix

# Python
pip install --upgrade -r requirements.txt
```

### 2. 更新應用

```bash
# 拉取最新代碼
git pull origin main

# 重新構建
npm run build

# 重啟服務
sudo systemctl restart covid-detection-node covid-detection-python
```

---

## 支持和聯繫

如有問題，請：

1. 檢查日誌文件
2. 查看故障排除部分
3. 提交 GitHub Issue
4. 聯繫技術支持

---

**最後更新**: 2026-03-02  
**版本**: 1.0.0
