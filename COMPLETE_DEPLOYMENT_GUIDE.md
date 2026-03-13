# COVID-19 咳嗽聲音偵測系統 - 完整部署指南

## 目錄

1. [系統要求](#系統要求)
2. [環境準備](#環境準備)
3. [開發環境部署](#開發環境部署)
4. [生產環境部署](#生產環境部署)
5. [Docker 容器化部署](#docker-容器化部署)
6. [Kubernetes 部署](#kubernetes-部署)
7. [監控與維護](#監控與維護)
8. [故障排除](#故障排除)

---

## 系統要求

### 最低要求

| 項目 | 要求 |
|------|------|
| 操作系統 | Linux/macOS/Windows |
| Python | 3.8+ |
| RAM | 8 GB |
| 磁碟空間 | 20 GB |
| GPU | 可選（推薦 NVIDIA RTX 2060+） |

### 推薦配置

| 項目 | 推薦 |
|------|------|
| 操作系統 | Ubuntu 20.04 LTS |
| Python | 3.10+ |
| RAM | 16 GB |
| 磁碟空間 | 50 GB SSD |
| GPU | NVIDIA RTX 3060 或更好 |
| CUDA | 11.8+ |
| cuDNN | 8.6+ |

---

## 環境準備

### 1. 系統依賴安裝

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y \
    python3.10 \
    python3.10-dev \
    python3.10-venv \
    build-essential \
    libsndfile1 \
    libsndfile1-dev \
    ffmpeg \
    git \
    curl \
    wget
```

#### macOS
```bash
brew install python@3.10
brew install libsndfile
brew install ffmpeg
```

#### Windows
- 下載並安裝 Python 3.10 from python.org
- 安裝 Visual Studio Build Tools
- 安裝 FFmpeg

### 2. CUDA 和 cuDNN 安裝（可選，用於 GPU 加速）

```bash
# 下載 CUDA 11.8
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_520.61.05_linux.run

# 安裝
sudo sh cuda_11.8.0_520.61.05_linux.run

# 設置環境變量
export PATH=/usr/local/cuda-11.8/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH
```

---

## 開發環境部署

### 1. 克隆項目

```bash
git clone https://github.com/yourusername/covid-cough-detection.git
cd covid-cough-detection
```

### 2. 創建虛擬環境

```bash
python3.10 -m venv venv
source venv/bin/activate  # Linux/macOS
# 或
venv\Scripts\activate  # Windows
```

### 3. 安裝依賴

```bash
cd python_project
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. 下載預訓練模型

```bash
python scripts/download_models.py
```

### 5. 啟動開發伺服器

```bash
# 後端 API 伺服器
python scripts/api_server.py --port 5000

# 前端開發伺服器（新終端）
cd ../
pnpm install
pnpm dev
```

訪問 `http://localhost:3000` 查看應用

---

## 生產環境部署

### 1. 環境配置

創建 `.env` 文件：

```env
# 應用配置
APP_ENV=production
DEBUG=False
SECRET_KEY=your-secret-key-here

# 數據庫配置
DATABASE_URL=postgresql://user:password@localhost/covid_detection

# 模型配置
MODEL_PATH=/opt/models
CACHE_SIZE=1000

# API 配置
API_PORT=8000
API_WORKERS=4
API_TIMEOUT=30

# 監控配置
LOG_LEVEL=INFO
METRICS_ENABLED=True
SENTRY_DSN=your-sentry-dsn

# 安全配置
CORS_ORIGINS=https://yourdomain.com
SSL_CERT_PATH=/etc/ssl/certs/cert.pem
SSL_KEY_PATH=/etc/ssl/private/key.pem
```

### 2. 使用 Gunicorn 部署

```bash
# 安裝 Gunicorn
pip install gunicorn

# 啟動應用
gunicorn -w 4 -b 0.0.0.0:8000 \
    --timeout 30 \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log \
    scripts.api_server:app
```

### 3. 使用 Nginx 反向代理

```nginx
upstream covid_detection {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    server 127.0.0.1:8003;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 日誌
    access_log /var/log/nginx/covid_api_access.log;
    error_log /var/log/nginx/covid_api_error.log;

    # 代理配置
    location / {
        proxy_pass http://covid_detection;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 靜態文件
    location /static/ {
        alias /var/www/covid-detection/static/;
        expires 30d;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 4. 使用 Systemd 管理服務

創建 `/etc/systemd/system/covid-detection.service`：

```ini
[Unit]
Description=COVID-19 Cough Detection API
After=network.target

[Service]
Type=notify
User=covid-detection
WorkingDirectory=/opt/covid-detection
Environment="PATH=/opt/covid-detection/venv/bin"
ExecStart=/opt/covid-detection/venv/bin/gunicorn \
    -w 4 -b 127.0.0.1:8000 \
    --timeout 30 \
    scripts.api_server:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

啟動服務：

```bash
sudo systemctl daemon-reload
sudo systemctl enable covid-detection
sudo systemctl start covid-detection
sudo systemctl status covid-detection
```

---

## Docker 容器化部署

### 1. 創建 Dockerfile

```dockerfile
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

WORKDIR /app

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-dev \
    python3.10-venv \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 創建虛擬環境
RUN python3.10 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 複製項目文件
COPY python_project /app/python_project
COPY requirements.txt /app/

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 下載模型
RUN python python_project/scripts/download_models.py

# 暴露端口
EXPOSE 8000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 啟動應用
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", \
     "--timeout", "30", \
     "python_project.scripts.api_server:app"]
```

### 2. 創建 docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - APP_ENV=production
      - LOG_LEVEL=INFO
    volumes:
      - ./models:/app/models
      - ./logs:/app/logs
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=covid_detection
      - POSTGRES_USER=covid_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: always

volumes:
  postgres_data:
```

啟動容器：

```bash
docker-compose up -d
docker-compose logs -f api
```

---

## Kubernetes 部署

### 1. 創建 Kubernetes 清單

創建 `k8s/deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: covid-detection-api
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: covid-detection-api
  template:
    metadata:
      labels:
        app: covid-detection-api
    spec:
      containers:
      - name: api
        image: your-registry/covid-detection:latest
        ports:
        - containerPort: 8000
        env:
        - name: APP_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "INFO"
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            cpu: "4"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

創建 `k8s/service.yaml`：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: covid-detection-api-service
spec:
  type: LoadBalancer
  selector:
    app: covid-detection-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
```

### 2. 部署到 Kubernetes

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 檢查部署狀態
kubectl get deployments
kubectl get pods
kubectl get services
```

---

## 監控與維護

### 1. 日誌管理

```bash
# 查看應用日誌
journalctl -u covid-detection -f

# 查看 Nginx 日誌
tail -f /var/log/nginx/covid_api_access.log
tail -f /var/log/nginx/covid_api_error.log

# 查看 Docker 日誌
docker-compose logs -f api
```

### 2. 性能監控

```bash
# 使用 Prometheus 和 Grafana
docker-compose up -d prometheus grafana

# 訪問 Grafana: http://localhost:3000
# 默認用戶名/密碼: admin/admin
```

### 3. 備份和恢復

```bash
# 備份數據庫
pg_dump covid_detection > backup.sql

# 恢復數據庫
psql covid_detection < backup.sql

# 備份模型
tar -czf models_backup.tar.gz /opt/models
```

---

## 故障排除

### 常見問題

| 問題 | 解決方案 |
|------|---------|
| 模型加載失敗 | 檢查模型路徑，確保模型文件存在 |
| 內存不足 | 增加系統 RAM 或使用模型量化 |
| GPU 不可用 | 檢查 CUDA 安裝和驅動程序 |
| 數據庫連接失敗 | 檢查數據庫配置和網絡連接 |
| API 響應緩慢 | 增加工作進程數或優化模型 |

### 調試命令

```bash
# 檢查系統資源
top
nvidia-smi

# 檢查網絡連接
curl http://localhost:8000/health
netstat -tlnp | grep 8000

# 檢查日誌
grep "ERROR" /var/log/covid-detection/app.log
```

---

## 性能優化建議

1. **模型優化**
   - 使用量化模型減少內存使用
   - 使用模型蒸餾提高推理速度

2. **緩存策略**
   - 使用 Redis 緩存特徵
   - 實現結果緩存

3. **並發處理**
   - 增加 Gunicorn 工作進程
   - 使用異步任務隊列

4. **數據庫優化**
   - 創建適當的索引
   - 定期清理舊數據

---

## 安全建議

1. **API 安全**
   - 使用 HTTPS/SSL
   - 實現 API 速率限制
   - 使用 API 密鑰認證

2. **數據安全**
   - 加密敏感數據
   - 定期備份
   - 實現訪問控制

3. **系統安全**
   - 定期更新依賴
   - 使用防火牆
   - 監控異常活動

---

## 支持和反饋

如有任何部署問題，請：

1. 查看日誌文件
2. 檢查系統要求
3. 參考故障排除部分
4. 提交 GitHub Issue

---

**最後更新**: 2026 年 2 月 12 日  
**版本**: 1.0.0
