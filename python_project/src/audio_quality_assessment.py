"""
音訊品質評估模組

評估音訊品質的多個維度：
- 信噪比（SNR）
- 動態範圍
- 頻譜清晰度
- 背景噪聲水平
- 總體品質分數

主要類：
- AudioQualityAnalyzer: 音訊品質分析器
- NoiseDetector: 噪聲檢測器
- QualityScorer: 品質評分器
"""

import numpy as np
from typing import Dict, Tuple, Optional
from dataclasses import dataclass
import logging
from scipy import signal
from scipy.fft import fft

logger = logging.getLogger(__name__)


@dataclass
class AudioQualityMetrics:
    """音訊品質指標"""
    snr: float  # 信噪比（dB）
    dynamic_range: float  # 動態範圍（dB）
    spectral_clarity: float  # 頻譜清晰度（0-1）
    background_noise_level: float  # 背景噪聲水平（dB）
    clipping_ratio: float  # 削波比例（0-1）
    overall_quality_score: float  # 總體品質分數（0-100）
    quality_level: str  # 品質級別（Excellent/Good/Fair/Poor）
    recommendations: list  # 改進建議


class NoiseDetector:
    """
    噪聲檢測器
    
    檢測和分析音訊中的噪聲特徵
    """
    
    def __init__(self, sample_rate: int = 16000):
        """
        初始化噪聲檢測器
        
        Args:
            sample_rate: 採樣率
        """
        self.sample_rate = sample_rate
    
    def detect_silence(
        self,
        audio: np.ndarray,
        threshold_db: float = -40.0
    ) -> Tuple[np.ndarray, float]:
        """
        檢測靜音段
        
        Args:
            audio: 音訊信號
            threshold_db: 靜音閾值（dB）
            
        Returns:
            靜音掩碼和靜音比例
        """
        # 計算能量
        frame_length = int(0.02 * self.sample_rate)  # 20ms 幀
        hop_length = frame_length // 2
        
        frames = []
        for i in range(0, len(audio) - frame_length, hop_length):
            frame = audio[i:i + frame_length]
            energy = np.sum(frame ** 2)
            frames.append(energy)
        
        frames = np.array(frames)
        
        # 轉換為 dB
        frames_db = 10 * np.log10(frames + 1e-10)
        
        # 計算閾值
        max_db = np.max(frames_db)
        threshold = max_db + threshold_db
        
        # 創建掩碼
        silence_mask = frames_db < threshold
        silence_ratio = np.sum(silence_mask) / len(silence_mask)
        
        return silence_mask, silence_ratio
    
    def estimate_noise_spectrum(
        self,
        audio: np.ndarray,
        n_fft: int = 2048
    ) -> np.ndarray:
        """
        估計噪聲頻譜
        
        Args:
            audio: 音訊信號
            n_fft: FFT 大小
            
        Returns:
            噪聲功率譜
        """
        # 計算 STFT
        f, t, Zxx = signal.stft(audio, self.sample_rate, nperseg=n_fft)
        
        # 計算功率譜
        power = np.abs(Zxx) ** 2
        
        # 估計噪聲譜（使用最小統計值）
        noise_spectrum = np.min(power, axis=1)
        
        return noise_spectrum
    
    def detect_background_noise_level(
        self,
        audio: np.ndarray
    ) -> float:
        """
        檢測背景噪聲水平
        
        Args:
            audio: 音訊信號
            
        Returns:
            背景噪聲水平（dB）
        """
        # 計算短時能量
        frame_length = int(0.02 * self.sample_rate)
        frames = []
        
        for i in range(0, len(audio) - frame_length, frame_length):
            frame = audio[i:i + frame_length]
            energy = np.sum(frame ** 2)
            frames.append(energy)
        
        frames = np.array(frames)
        
        # 使用最小能量作為噪聲估計
        min_energy = np.min(frames)
        noise_level_db = 10 * np.log10(min_energy + 1e-10)
        
        return noise_level_db


class AudioQualityAnalyzer:
    """
    音訊品質分析器
    
    評估音訊品質的多個維度並生成綜合評分
    """
    
    def __init__(self, sample_rate: int = 16000):
        """
        初始化音訊品質分析器
        
        Args:
            sample_rate: 採樣率
        """
        self.sample_rate = sample_rate
        self.noise_detector = NoiseDetector(sample_rate)
    
    def analyze(self, audio: np.ndarray) -> AudioQualityMetrics:
        """
        分析音訊品質
        
        Args:
            audio: 音訊信號
            
        Returns:
            AudioQualityMetrics 對象
        """
        # 計算各項指標
        snr = self._calculate_snr(audio)
        dynamic_range = self._calculate_dynamic_range(audio)
        spectral_clarity = self._calculate_spectral_clarity(audio)
        background_noise_level = self.noise_detector.detect_background_noise_level(audio)
        clipping_ratio = self._calculate_clipping_ratio(audio)
        
        # 計算總體品質分數
        overall_score = self._calculate_overall_score(
            snr,
            dynamic_range,
            spectral_clarity,
            background_noise_level,
            clipping_ratio
        )
        
        # 確定品質級別
        quality_level = self._determine_quality_level(overall_score)
        
        # 生成建議
        recommendations = self._generate_recommendations(
            snr,
            dynamic_range,
            spectral_clarity,
            background_noise_level,
            clipping_ratio
        )
        
        return AudioQualityMetrics(
            snr=snr,
            dynamic_range=dynamic_range,
            spectral_clarity=spectral_clarity,
            background_noise_level=background_noise_level,
            clipping_ratio=clipping_ratio,
            overall_quality_score=overall_score,
            quality_level=quality_level,
            recommendations=recommendations
        )
    
    def _calculate_snr(self, audio: np.ndarray) -> float:
        """計算信噪比"""
        # 檢測靜音段
        silence_mask, _ = self.noise_detector.detect_silence(audio)
        
        # 噪聲功率（靜音段）
        noise_power = np.mean(audio[silence_mask] ** 2) if np.any(silence_mask) else np.mean(audio ** 2) * 0.1
        
        # 信號功率（非靜音段）
        signal_mask = ~silence_mask
        signal_power = np.mean(audio[signal_mask] ** 2) if np.any(signal_mask) else np.mean(audio ** 2)
        
        # 計算 SNR（dB）
        snr_db = 10 * np.log10(signal_power / (noise_power + 1e-10))
        
        return float(np.clip(snr_db, -20, 60))
    
    def _calculate_dynamic_range(self, audio: np.ndarray) -> float:
        """計算動態範圍"""
        # 計算峰值
        peak = np.max(np.abs(audio))
        
        # 計算 RMS
        rms = np.sqrt(np.mean(audio ** 2))
        
        # 動態範圍（dB）
        if rms > 0:
            dynamic_range_db = 20 * np.log10(peak / rms)
        else:
            dynamic_range_db = 0
        
        return float(np.clip(dynamic_range_db, 0, 100))
    
    def _calculate_spectral_clarity(self, audio: np.ndarray) -> float:
        """計算頻譜清晰度"""
        # 計算 FFT
        n_fft = 2048
        spectrum = np.abs(fft(audio, n=n_fft))[:n_fft // 2]
        
        # 計算頻譜熵（越低越清晰）
        spectrum_norm = spectrum / (np.sum(spectrum) + 1e-10)
        entropy = -np.sum(spectrum_norm * np.log(spectrum_norm + 1e-10))
        
        # 將熵轉換為清晰度分數（0-1）
        max_entropy = np.log(len(spectrum))
        clarity = 1 - (entropy / max_entropy)
        
        return float(np.clip(clarity, 0, 1))
    
    def _calculate_clipping_ratio(self, audio: np.ndarray) -> float:
        """計算削波比例"""
        # 計算峰值
        peak = np.max(np.abs(audio))
        
        # 計算削波樣本數（接近峰值的樣本）
        threshold = peak * 0.95
        clipped_samples = np.sum(np.abs(audio) > threshold)
        
        # 計算削波比例
        clipping_ratio = clipped_samples / len(audio)
        
        return float(np.clip(clipping_ratio, 0, 1))
    
    def _calculate_overall_score(
        self,
        snr: float,
        dynamic_range: float,
        spectral_clarity: float,
        background_noise_level: float,
        clipping_ratio: float
    ) -> float:
        """計算總體品質分數"""
        # 標準化各項指標
        snr_score = np.clip((snr + 20) / 80, 0, 1) * 100
        dr_score = np.clip(dynamic_range / 100, 0, 1) * 100
        clarity_score = spectral_clarity * 100
        noise_score = np.clip((-background_noise_level + 20) / 60, 0, 1) * 100
        clipping_score = (1 - clipping_ratio) * 100
        
        # 加權平均
        weights = [0.25, 0.2, 0.2, 0.2, 0.15]
        scores = [snr_score, dr_score, clarity_score, noise_score, clipping_score]
        overall_score = np.average(scores, weights=weights)
        
        return float(np.clip(overall_score, 0, 100))
    
    def _determine_quality_level(self, score: float) -> str:
        """確定品質級別"""
        if score >= 80:
            return "Excellent"
        elif score >= 60:
            return "Good"
        elif score >= 40:
            return "Fair"
        else:
            return "Poor"
    
    def _generate_recommendations(
        self,
        snr: float,
        dynamic_range: float,
        spectral_clarity: float,
        background_noise_level: float,
        clipping_ratio: float
    ) -> list:
        """生成改進建議"""
        recommendations = []
        
        if snr < 10:
            recommendations.append("信噪比過低，建議在更安靜的環境中錄製")
        
        if dynamic_range < 20:
            recommendations.append("動態範圍不足，建議調整麥克風位置或增加音量")
        
        if spectral_clarity < 0.6:
            recommendations.append("頻譜清晰度不足，建議減少背景噪聲")
        
        if background_noise_level > -20:
            recommendations.append("背景噪聲水平過高，建議在更安靜的環境中錄製")
        
        if clipping_ratio > 0.01:
            recommendations.append("檢測到削波，建議降低麥克風增益")
        
        if not recommendations:
            recommendations.append("音訊品質良好，無需改進")
        
        return recommendations


class QualityScorer:
    """
    品質評分器
    
    基於多個維度的品質評分
    """
    
    def __init__(self):
        """初始化品質評分器"""
        pass
    
    @staticmethod
    def score_for_prediction(metrics: AudioQualityMetrics) -> Tuple[float, bool]:
        """
        評估音訊是否適合進行預測
        
        Args:
            metrics: 音訊品質指標
            
        Returns:
            品質分數和是否適合預測的布爾值
        """
        # 檢查最低要求
        min_snr = 5.0
        max_noise = -10.0
        max_clipping = 0.05
        
        suitable = (
            metrics.snr >= min_snr and
            metrics.background_noise_level <= max_noise and
            metrics.clipping_ratio <= max_clipping
        )
        
        return metrics.overall_quality_score, suitable


# 使用示例
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # 創建分析器
    analyzer = AudioQualityAnalyzer(sample_rate=16000)
    
    # 分析音訊
    # audio = np.random.randn(16000)  # 示例音訊
    # metrics = analyzer.analyze(audio)
    # print(f"Overall Quality Score: {metrics.overall_quality_score:.1f}")
    # print(f"Quality Level: {metrics.quality_level}")
    # print(f"SNR: {metrics.snr:.1f} dB")
    # print(f"Recommendations: {metrics.recommendations}")
    
    print("音訊品質評估模組已準備就緒")
