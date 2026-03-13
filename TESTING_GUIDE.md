# 測試指南：COVID-19 咳嗽聲音偵測系統

## 📋 目錄

1. [測試概述](#測試概述)
2. [單元測試](#單元測試)
3. [集成測試](#集成測試)
4. [端到端測試](#端到端測試)
5. [性能測試](#性能測試)
6. [安全性測試](#安全性測試)
7. [部署驗證](#部署驗證)

---

## 測試概述

### 測試金字塔

```
        ┌─────────────────┐
        │   E2E 測試      │  (5-10%)
        │  (使用者流程)    │
        ├─────────────────┤
        │  集成測試        │  (20-30%)
        │ (模組間交互)     │
        ├─────────────────┤
        │  單元測試        │  (60-70%)
        │ (個別函數)       │
        └─────────────────┘
```

### 測試覆蓋率目標

| 層級 | 目標 | 優先級 |
|------|------|--------|
| 單元測試 | 80%+ | 高 |
| 集成測試 | 70%+ | 高 |
| E2E 測試 | 60%+ | 中 |
| 性能測試 | 基準 | 中 |

---

## 單元測試

### Python 後端測試

#### 1. 音訊處理測試

```python
# python_project/tests/test_audio_processor.py

import pytest
import numpy as np
from src.audio_processor import AudioProcessor


class TestAudioProcessor:
    """Audio processor unit tests"""

    @pytest.fixture
    def processor(self):
        return AudioProcessor(
            sample_rate=16000,
            duration=10,
            n_mfcc=13,
            n_mel=64,
        )

    def test_initialization(self, processor):
        """Test processor initialization"""
        assert processor.sample_rate == 16000
        assert processor.duration == 10
        assert processor.n_mfcc == 13
        assert processor.n_mel == 64

    def test_preprocess_audio_shape(self, processor):
        """Test audio preprocessing output shape"""
        # Create synthetic audio
        y = np.random.randn(16000)  # 1 second at 16kHz
        
        # Preprocess
        y_processed = processor.preprocess_audio(y)
        
        # Check output shape
        expected_length = processor.sample_rate * processor.duration
        assert len(y_processed) == expected_length

    def test_preprocess_audio_normalization(self, processor):
        """Test audio normalization"""
        y = np.ones(16000) * 100  # Loud audio
        y_processed = processor.preprocess_audio(y)
        
        # Check normalization
        assert np.max(np.abs(y_processed)) <= 1.0

    def test_extract_mfcc_shape(self, processor):
        """Test MFCC extraction output shape"""
        y = np.random.randn(processor.sample_rate * processor.duration)
        mfcc = processor.extract_mfcc(y)
        
        # Check shape
        assert mfcc.shape[0] == processor.n_mfcc
        assert mfcc.shape[1] > 0

    def test_extract_mel_spectrogram_shape(self, processor):
        """Test mel-spectrogram extraction output shape"""
        y = np.random.randn(processor.sample_rate * processor.duration)
        mel_spec = processor.extract_mel_spectrogram(y)
        
        # Check shape
        assert mel_spec.shape[0] == processor.n_mel
        assert mel_spec.shape[1] > 0


# 運行測試
# pytest python_project/tests/test_audio_processor.py -v
```

#### 2. 模型推論測試

```python
# python_project/tests/test_model_inference.py

import pytest
import numpy as np
import torch
from src.model_inference import ModelInference, SimpleConvNet


class TestModelInference:
    """Model inference unit tests"""

    @pytest.fixture
    def inference(self):
        return ModelInference(device="cpu")

    def test_initialization(self, inference):
        """Test model initialization"""
        assert inference.model is not None
        assert inference.device == "cpu"

    def test_model_forward_pass(self, inference):
        """Test model forward pass"""
        # Create dummy input
        x = torch.randn(1, 1, 64, 100)  # (batch, channels, height, width)
        
        # Forward pass
        with torch.no_grad():
            output = inference.model(x)
        
        # Check output shape
        assert output.shape == (1, 2)  # (batch, num_classes)

    def test_predict_output_shape(self, inference):
        """Test predict method output"""
        features = np.random.randn(64, 100)
        label, prob = inference.predict(features)
        
        # Check output
        assert label in ["positive", "negative"]
        assert 0 <= prob <= 1

    def test_predict_batch(self, inference):
        """Test batch prediction"""
        features_list = [
            np.random.randn(64, 100),
            np.random.randn(64, 100),
            np.random.randn(64, 100),
        ]
        
        results = inference.predict_batch(features_list)
        
        # Check results
        assert len(results) == 3
        for label, prob in results:
            assert label in ["positive", "negative"]
            assert 0 <= prob <= 1


# 運行測試
# pytest python_project/tests/test_model_inference.py -v
```

### Node.js 後端測試

#### 3. API 路由測試

```typescript
// server/__tests__/api.test.ts

import express from "express";
import request from "supertest";

describe("API Endpoints", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    // 設置路由...
  });

  describe("GET /api/health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
    });
  });

  describe("GET /api/version", () => {
    it("should return version information", async () => {
      const response = await request(app).get("/api/version");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("api_version");
      expect(response.body).toHaveProperty("model_version");
    });
  });

  describe("POST /api/predict", () => {
    it("should reject empty file", async () => {
      const response = await request(app)
        .post("/api/predict")
        .set("Content-Type", "multipart/form-data");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
  });
});

// 運行測試
// npm test
```

---

## 集成測試

### 1. 前後端集成測試

```bash
#!/bin/bash
# integration-test.sh

echo "🧪 集成測試開始..."

# 啟動 Python 後端
echo "啟動 Python 後端..."
cd python_project
python -m uvicorn src.app:app --port 8000 &
PYTHON_PID=$!
sleep 3

# 啟動 Node.js 後端
echo "啟動 Node.js 後端..."
npm run build
npm run start &
NODE_PID=$!
sleep 3

# 測試 Python 後端
echo "測試 Python 後端..."
curl -s http://localhost:8000/health | jq .
if [ $? -ne 0 ]; then
  echo "❌ Python 後端失敗"
  kill $PYTHON_PID $NODE_PID
  exit 1
fi

# 測試 Node.js 後端
echo "測試 Node.js 後端..."
curl -s http://localhost:3000/api/health | jq .
if [ $? -ne 0 ]; then
  echo "❌ Node.js 後端失敗"
  kill $PYTHON_PID $NODE_PID
  exit 1
fi

# 測試代理
echo "測試代理..."
curl -s http://localhost:3000/api/version | jq .
if [ $? -ne 0 ]; then
  echo "❌ 代理失敗"
  kill $PYTHON_PID $NODE_PID
  exit 1
fi

# 清理
kill $PYTHON_PID $NODE_PID

echo "✅ 集成測試完成"
```

### 2. Docker 集成測試

```bash
#!/bin/bash
# docker-integration-test.sh

echo "🐳 Docker 集成測試開始..."

# 構建映像
docker-compose build

# 啟動容器
docker-compose up -d

# 等待啟動
sleep 5

# 測試健康檢查
echo "測試 Node.js 健康檢查..."
curl -s http://localhost:3000/api/health | jq .

echo "測試 Python 健康檢查..."
curl -s http://localhost:8000/health | jq .

# 檢查容器狀態
docker-compose ps

# 清理
docker-compose down

echo "✅ Docker 集成測試完成"
```

---

## 端到端測試

### 1. 完整流程測試

```bash
#!/bin/bash
# e2e-test.sh

echo "🎯 端到端測試開始..."

# 生成測試音訊
echo "生成測試音訊..."
python3 << 'EOF'
import numpy as np
from scipy.io import wavfile

# 生成 1 秒的白噪聲
sr = 16000
duration = 1
t = np.linspace(0, duration, sr * duration)
audio = np.random.randn(len(t)) * 0.1

# 保存
wavfile.write("test_audio.wav", sr, (audio * 32767).astype(np.int16))
print("✓ 測試音訊已生成")
EOF

# 測試預測
echo "測試預測..."
curl -X POST http://localhost:3000/api/predict \
  -F "file=@test_audio.wav" \
  -H "Accept: application/json" | jq .

# 清理
rm test_audio.wav

echo "✅ 端到端測試完成"
```

### 2. 前端測試（Playwright）

```typescript
// client/__tests__/e2e.spec.ts

import { test, expect } from "@playwright/test";

test.describe("COVID Detection App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
  });

  test("should display home page", async ({ page }) => {
    await expect(page).toHaveTitle(/COVID/);
    await expect(page.locator("h1")).toContainText("COVID-19");
  });

  test("should have record button", async ({ page }) => {
    const recordButton = page.locator("button:has-text('開始錄音')");
    await expect(recordButton).toBeVisible();
  });

  test("should show instructions", async ({ page }) => {
    const instructions = page.locator("text=使用步驟");
    await expect(instructions).toBeVisible();
  });

  test("should display disclaimer", async ({ page }) => {
    const disclaimer = page.locator("text=免責聲明");
    await expect(disclaimer).toBeVisible();
  });
});

// 運行測試
// npx playwright test
```

---

## 性能測試

### 1. 負載測試

```bash
#!/bin/bash
# load-test.sh

echo "📊 負載測試開始..."

# 生成測試音訊
python3 << 'EOF'
import numpy as np
from scipy.io import wavfile

sr = 16000
duration = 5
t = np.linspace(0, duration, sr * duration)
audio = np.random.randn(len(t)) * 0.1
wavfile.write("test_audio.wav", sr, (audio * 32767).astype(np.int16))
EOF

# 使用 Apache Bench 進行負載測試
echo "發送 100 個請求..."
ab -n 100 -c 10 -p test_audio.wav \
  -T "multipart/form-data; boundary=----WebKitFormBoundary" \
  http://localhost:3000/api/predict

# 清理
rm test_audio.wav

echo "✅ 負載測試完成"
```

### 2. 性能基準

```python
# python_project/tests/benchmark.py

import time
import numpy as np
from src.audio_processor import AudioProcessor
from src.model_inference import ModelInference


def benchmark_audio_processing():
    """Benchmark audio processing"""
    processor = AudioProcessor()
    
    # Create synthetic audio
    audio_data = np.random.randn(16000 * 10).tobytes()
    
    # Benchmark
    start = time.time()
    for _ in range(10):
        processor.process_audio_file(audio_data)
    duration = time.time() - start
    
    print(f"Audio processing: {duration / 10:.3f}s per sample")


def benchmark_inference():
    """Benchmark model inference"""
    inference = ModelInference()
    features = np.random.randn(64, 100)
    
    # Benchmark
    start = time.time()
    for _ in range(100):
        inference.predict(features)
    duration = time.time() - start
    
    print(f"Inference: {duration / 100:.3f}s per sample")


if __name__ == "__main__":
    benchmark_audio_processing()
    benchmark_inference()
```

---

## 安全性測試

### 1. 輸入驗證測試

```bash
#!/bin/bash
# security-test.sh

echo "🔒 安全性測試開始..."

# 測試 1：空檔案
echo "測試 1：空檔案..."
curl -X POST http://localhost:3000/api/predict \
  -F "file=@/dev/null" 2>/dev/null | jq .error

# 測試 2：超大檔案
echo "測試 2：超大檔案..."
dd if=/dev/zero bs=1M count=20 of=large_file.bin 2>/dev/null
curl -X POST http://localhost:3000/api/predict \
  -F "file=@large_file.bin" 2>/dev/null | jq .error
rm large_file.bin

# 測試 3：無效格式
echo "測試 3：無效格式..."
echo "invalid" > invalid.txt
curl -X POST http://localhost:3000/api/predict \
  -F "file=@invalid.txt" 2>/dev/null | jq .error
rm invalid.txt

# 測試 4：速率限制
echo "測試 4：速率限制..."
for i in {1..35}; do
  curl -s http://localhost:3000/api/health > /dev/null
done
curl -s http://localhost:3000/api/health | jq .

echo "✅ 安全性測試完成"
```

### 2. 安全 Headers 測試

```bash
#!/bin/bash
# headers-test.sh

echo "🔐 安全 Headers 測試..."

curl -I http://localhost:3000/api/health | grep -E "X-Content-Type-Options|X-Frame-Options|X-XSS-Protection|Strict-Transport-Security"

echo "✅ Headers 測試完成"
```

---

## 部署驗證

### 1. 生產環境檢查清單

```bash
#!/bin/bash
# deployment-checklist.sh

echo "✅ 部署驗證清單"

# 1. 檢查依賴
echo "1. 檢查依賴..."
npm list --depth=0
pip list | grep -E "fastapi|uvicorn|torch"

# 2. 檢查構建
echo "2. 檢查構建..."
npm run build
if [ $? -eq 0 ]; then echo "✓ Node.js 構建成功"; fi

# 3. 檢查 TypeScript
echo "3. 檢查 TypeScript..."
npm run check
if [ $? -eq 0 ]; then echo "✓ TypeScript 檢查通過"; fi

# 4. 檢查 Docker
echo "4. 檢查 Docker..."
docker-compose config > /dev/null
if [ $? -eq 0 ]; then echo "✓ Docker Compose 配置有效"; fi

# 5. 檢查安全
echo "5. 檢查安全..."
npm audit
pip install safety
safety check

echo "✅ 部署驗證完成"
```

### 2. 健康檢查腳本

```bash
#!/bin/bash
# health-check.sh

echo "🏥 系統健康檢查..."

# 檢查 Node.js
echo "檢查 Node.js..."
NODE_HEALTH=$(curl -s http://localhost:3000/api/health | jq -r '.status')
if [ "$NODE_HEALTH" = "ok" ]; then
  echo "✓ Node.js 正常"
else
  echo "✗ Node.js 異常"
  exit 1
fi

# 檢查 Python
echo "檢查 Python..."
PYTHON_HEALTH=$(curl -s http://localhost:8000/health | jq -r '.status')
if [ "$PYTHON_HEALTH" = "ok" ]; then
  echo "✓ Python 正常"
else
  echo "✗ Python 異常"
  exit 1
fi

# 檢查磁盤
echo "檢查磁盤..."
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
  echo "✓ 磁盤使用正常 ($DISK_USAGE%)"
else
  echo "✗ 磁盤使用過高 ($DISK_USAGE%)"
  exit 1
fi

# 檢查內存
echo "檢查內存..."
MEM_USAGE=$(free | awk 'NR==2 {print int($3/$2 * 100)}')
if [ "$MEM_USAGE" -lt 80 ]; then
  echo "✓ 內存使用正常 ($MEM_USAGE%)"
else
  echo "✗ 內存使用過高 ($MEM_USAGE%)"
  exit 1
fi

echo "✅ 系統健康檢查完成"
```

---

## 測試執行

### 快速開始

```bash
# 1. 安裝測試依賴
npm install --save-dev jest @testing-library/react
pip install pytest pytest-cov

# 2. 運行所有測試
npm test
pytest python_project/tests/ -v

# 3. 生成覆蓋率報告
npm test -- --coverage
pytest python_project/tests/ --cov=src --cov-report=html

# 4. 運行 E2E 測試
npx playwright test

# 5. 運行負載測試
bash load-test.sh

# 6. 運行安全測試
bash security-test.sh
```

---

## 測試報告

### 預期結果

| 測試類型 | 預期結果 | 優先級 |
|---------|---------|--------|
| 單元測試 | 通過率 > 95% | 高 |
| 集成測試 | 通過率 > 90% | 高 |
| E2E 測試 | 通過率 > 85% | 中 |
| 性能測試 | < 500ms | 中 |
| 安全測試 | 無漏洞 | 高 |

---

**版本**: 1.0.0  
**最後更新**: 2026-03-02
