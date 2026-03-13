"""
創建示例訓練資料集

生成模擬的咳嗽聲音樣本用於演示和測試
"""

import os
import json
import numpy as np
from scipy.io import wavfile
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_sample_dataset(output_dir: str = "coughvid_sample", num_samples: int = 20):
    """
    創建示例資料集
    
    Args:
        output_dir: 輸出目錄
        num_samples: 每類樣本數
    """
    os.makedirs(output_dir, exist_ok=True)
    
    sample_rate = 16000
    duration = 3  # 3 秒
    
    # 創建 COVID-19 正樣本
    logger.info("Creating COVID-19 positive samples...")
    for i in range(num_samples):
        t = np.linspace(0, duration, int(sample_rate * duration))
        
        # 模擬 COVID-19 咳嗽聲 - 乾咳，多個短脈衝
        signal = np.zeros_like(t)
        for j in range(3):
            start = int(sample_rate * (j * 1.0))
            end = int(sample_rate * (j * 1.0 + 0.3))
            if end <= len(signal):
                # 高頻成分（乾咳特徵）
                envelope = np.exp(-5 * (t[start:end] - t[start]))
                signal[start:end] += (
                    np.sin(2 * np.pi * 200 * t[start:end]) * 0.5 +
                    np.sin(2 * np.pi * 400 * t[start:end]) * 0.3
                ) * envelope
        
        # 添加背景噪聲
        signal += np.random.normal(0, 0.01, len(signal))
        
        # 正規化
        signal = signal / (np.max(np.abs(signal)) + 1e-8)
        signal = np.int16(signal * 32767 * 0.9)
        
        filename = os.path.join(output_dir, f"covid_positive_{i:03d}.wav")
        wavfile.write(filename, sample_rate, signal)
        logger.info(f"Created {filename}")
    
    # 創建 COVID-19 負樣本（正常咳嗽）
    logger.info("Creating COVID-19 negative samples...")
    for i in range(num_samples):
        t = np.linspace(0, duration, int(sample_rate * duration))
        
        # 模擬正常咳嗽聲 - 濕咳，較低頻率
        signal = np.zeros_like(t)
        for j in range(2):
            start = int(sample_rate * (j * 1.5))
            end = int(sample_rate * (j * 1.5 + 0.4))
            if end <= len(signal):
                # 低頻成分（濕咳特徵）
                envelope = np.exp(-3 * (t[start:end] - t[start]))
                signal[start:end] += (
                    np.sin(2 * np.pi * 100 * t[start:end]) * 0.6 +
                    np.sin(2 * np.pi * 200 * t[start:end]) * 0.2
                ) * envelope
        
        # 添加背景噪聲
        signal += np.random.normal(0, 0.005, len(signal))
        
        # 正規化
        signal = signal / (np.max(np.abs(signal)) + 1e-8)
        signal = np.int16(signal * 32767 * 0.9)
        
        filename = os.path.join(output_dir, f"covid_negative_{i:03d}.wav")
        wavfile.write(filename, sample_rate, signal)
        logger.info(f"Created {filename}")
    
    # 創建元資料
    logger.info("Creating metadata...")
    metadata = {
        "dataset_name": "COVID-19 Cough Detection Sample Dataset",
        "version": "1.0",
        "sample_rate": sample_rate,
        "duration": duration,
        "covid_positive": [f"covid_positive_{i:03d}.wav" for i in range(num_samples)],
        "covid_negative": [f"covid_negative_{i:03d}.wav" for i in range(num_samples)],
        "total_samples": num_samples * 2
    }
    
    metadata_file = os.path.join(output_dir, "metadata.json")
    with open(metadata_file, "w") as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"Metadata saved to {metadata_file}")
    logger.info(f"Dataset created successfully!")
    logger.info(f"Total files: {len(os.listdir(output_dir))}")
    
    return metadata


if __name__ == "__main__":
    create_sample_dataset()
