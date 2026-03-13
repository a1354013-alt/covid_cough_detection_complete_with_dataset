"""
實時音訊流處理系統

支持從多個來源（麥克風、網絡流、文件）進行實時音訊處理，
包括音訊緩衝、特徵提取、預測和結果流式輸出。

主要類：
- AudioStreamBuffer: 音訊流緩衝區
- RealtimeAudioProcessor: 實時音訊處理器
- StreamPredictionEngine: 流式預測引擎
"""

import numpy as np
import threading
import queue
import time
from typing import Callable, Optional, Dict, List, Tuple
from dataclasses import dataclass
from collections import deque
import logging

logger = logging.getLogger(__name__)


@dataclass
class StreamChunk:
    """音訊流數據塊"""
    audio_data: np.ndarray
    timestamp: float
    chunk_id: int
    sample_rate: int


@dataclass
class StreamPrediction:
    """流式預測結果"""
    chunk_id: int
    timestamp: float
    covid_probability: float
    confidence: float
    cough_type: str
    processing_time: float
    latency: float


class AudioStreamBuffer:
    """
    音訊流緩衝區
    
    特點：
    - 支持可配置的緩衝大小
    - 自動音訊重疊處理
    - 線程安全的隊列操作
    - 實時監控緩衝區狀態
    """
    
    def __init__(
        self,
        buffer_size: int = 16000,
        overlap_ratio: float = 0.5,
        max_queue_size: int = 100
    ):
        """
        初始化音訊緩衝區
        
        Args:
            buffer_size: 緩衝區大小（樣本數）
            overlap_ratio: 重疊比例（0-1）
            max_queue_size: 最大隊列大小
        """
        self.buffer_size = buffer_size
        self.overlap_ratio = overlap_ratio
        self.overlap_samples = int(buffer_size * overlap_ratio)
        self.hop_samples = buffer_size - self.overlap_samples
        
        self.buffer = deque(maxlen=buffer_size)
        self.queue = queue.Queue(maxsize=max_queue_size)
        self.lock = threading.Lock()
        self.chunk_counter = 0
        
        # 統計信息
        self.stats = {
            'total_samples': 0,
            'chunks_processed': 0,
            'queue_size': 0,
            'buffer_fill_ratio': 0.0
        }
    
    def add_samples(self, samples: np.ndarray, sample_rate: int) -> None:
        """
        添加音訊樣本到緩衝區
        
        Args:
            samples: 音訊樣本數組
            sample_rate: 採樣率
        """
        with self.lock:
            for sample in samples:
                self.buffer.append(sample)
                self.stats['total_samples'] += 1
            
            # 檢查是否有足夠的數據形成一個塊
            while len(self.buffer) >= self.buffer_size:
                chunk_data = np.array(list(self.buffer)[:self.buffer_size])
                chunk = StreamChunk(
                    audio_data=chunk_data,
                    timestamp=time.time(),
                    chunk_id=self.chunk_counter,
                    sample_rate=sample_rate
                )
                
                try:
                    self.queue.put_nowait(chunk)
                    self.chunk_counter += 1
                    self.stats['chunks_processed'] += 1
                except queue.Full:
                    logger.warning("音訊流緩衝區已滿，丟棄舊數據")
                    self.queue.get()
                    self.queue.put_nowait(chunk)
                
                # 移動緩衝區指針
                for _ in range(self.hop_samples):
                    if self.buffer:
                        self.buffer.popleft()
            
            # 更新統計信息
            self.stats['queue_size'] = self.queue.qsize()
            self.stats['buffer_fill_ratio'] = len(self.buffer) / self.buffer_size
    
    def get_chunk(self, timeout: float = 1.0) -> Optional[StreamChunk]:
        """
        從隊列獲取音訊塊
        
        Args:
            timeout: 超時時間（秒）
            
        Returns:
            StreamChunk 或 None
        """
        try:
            return self.queue.get(timeout=timeout)
        except queue.Empty:
            return None
    
    def get_stats(self) -> Dict:
        """獲取緩衝區統計信息"""
        with self.lock:
            return self.stats.copy()


class RealtimeAudioProcessor:
    """
    實時音訊處理器
    
    特點：
    - 支持多線程處理
    - 實時特徵提取
    - 可配置的處理管道
    - 性能監控
    """
    
    def __init__(
        self,
        feature_extractor,
        model,
        buffer_size: int = 16000,
        sample_rate: int = 16000,
        num_workers: int = 4
    ):
        """
        初始化實時音訊處理器
        
        Args:
            feature_extractor: 特徵提取器
            model: 預測模型
            buffer_size: 緩衝區大小
            sample_rate: 採樣率
            num_workers: 工作線程數
        """
        self.feature_extractor = feature_extractor
        self.model = model
        self.sample_rate = sample_rate
        self.num_workers = num_workers
        
        self.buffer = AudioStreamBuffer(buffer_size=buffer_size)
        self.result_queue = queue.Queue()
        self.processing_thread = None
        self.is_running = False
        
        # 性能監控
        self.performance_stats = {
            'total_chunks': 0,
            'successful_predictions': 0,
            'failed_predictions': 0,
            'avg_processing_time': 0.0,
            'avg_latency': 0.0,
            'processing_times': deque(maxlen=100)
        }
    
    def start(self) -> None:
        """啟動實時處理"""
        if self.is_running:
            logger.warning("處理器已在運行")
            return
        
        self.is_running = True
        self.processing_thread = threading.Thread(
            target=self._processing_loop,
            daemon=True
        )
        self.processing_thread.start()
        logger.info("實時音訊處理器已啟動")
    
    def stop(self) -> None:
        """停止實時處理"""
        self.is_running = False
        if self.processing_thread:
            self.processing_thread.join(timeout=5.0)
        logger.info("實時音訊處理器已停止")
    
    def add_audio_samples(self, samples: np.ndarray) -> None:
        """
        添加音訊樣本
        
        Args:
            samples: 音訊樣本數組
        """
        self.buffer.add_samples(samples, self.sample_rate)
    
    def _processing_loop(self) -> None:
        """處理循環"""
        while self.is_running:
            chunk = self.buffer.get_chunk(timeout=0.1)
            if chunk is None:
                continue
            
            try:
                start_time = time.time()
                
                # 特徵提取
                features = self.feature_extractor.extract(chunk.audio_data)
                
                # 模型預測
                with np.no_grad() if hasattr(np, 'no_grad') else None:
                    prediction = self.model.predict(features)
                
                processing_time = time.time() - start_time
                latency = time.time() - chunk.timestamp
                
                # 創建預測結果
                result = StreamPrediction(
                    chunk_id=chunk.chunk_id,
                    timestamp=chunk.timestamp,
                    covid_probability=float(prediction['covid_prob']),
                    confidence=float(prediction['confidence']),
                    cough_type=prediction['cough_type'],
                    processing_time=processing_time,
                    latency=latency
                )
                
                self.result_queue.put(result)
                self.performance_stats['successful_predictions'] += 1
                self.performance_stats['processing_times'].append(processing_time)
                
            except Exception as e:
                logger.error(f"處理塊 {chunk.chunk_id} 時出錯: {e}")
                self.performance_stats['failed_predictions'] += 1
            
            self.performance_stats['total_chunks'] += 1
    
    def get_result(self, timeout: float = 1.0) -> Optional[StreamPrediction]:
        """
        獲取預測結果
        
        Args:
            timeout: 超時時間（秒）
            
        Returns:
            StreamPrediction 或 None
        """
        try:
            return self.result_queue.get(timeout=timeout)
        except queue.Empty:
            return None
    
    def get_performance_stats(self) -> Dict:
        """獲取性能統計"""
        stats = self.performance_stats.copy()
        if stats['processing_times']:
            stats['avg_processing_time'] = np.mean(stats['processing_times'])
        return stats


class StreamPredictionEngine:
    """
    流式預測引擎
    
    特點：
    - 支持多個回調函數
    - 實時結果流式輸出
    - 可配置的結果過濾
    - 完整的事件系統
    """
    
    def __init__(self, processor: RealtimeAudioProcessor):
        """
        初始化流式預測引擎
        
        Args:
            processor: 實時音訊處理器
        """
        self.processor = processor
        self.callbacks: List[Callable] = []
        self.filters: List[Callable] = []
        self.is_running = False
        self.result_thread = None
    
    def add_callback(self, callback: Callable[[StreamPrediction], None]) -> None:
        """
        添加結果回調函數
        
        Args:
            callback: 回調函數，接收 StreamPrediction 對象
        """
        self.callbacks.append(callback)
    
    def add_filter(self, filter_fn: Callable[[StreamPrediction], bool]) -> None:
        """
        添加結果過濾器
        
        Args:
            filter_fn: 過濾函數，返回 True 表示保留結果
        """
        self.filters.append(filter_fn)
    
    def start(self) -> None:
        """啟動流式預測"""
        if self.is_running:
            logger.warning("引擎已在運行")
            return
        
        self.processor.start()
        self.is_running = True
        self.result_thread = threading.Thread(
            target=self._result_loop,
            daemon=True
        )
        self.result_thread.start()
        logger.info("流式預測引擎已啟動")
    
    def stop(self) -> None:
        """停止流式預測"""
        self.is_running = False
        self.processor.stop()
        if self.result_thread:
            self.result_thread.join(timeout=5.0)
        logger.info("流式預測引擎已停止")
    
    def _result_loop(self) -> None:
        """結果處理循環"""
        while self.is_running:
            result = self.processor.get_result(timeout=0.1)
            if result is None:
                continue
            
            # 應用過濾器
            if not all(f(result) for f in self.filters):
                continue
            
            # 執行回調
            for callback in self.callbacks:
                try:
                    callback(result)
                except Exception as e:
                    logger.error(f"回調執行出錯: {e}")
    
    def add_audio_samples(self, samples: np.ndarray) -> None:
        """添加音訊樣本"""
        self.processor.add_audio_samples(samples)


# 使用示例
if __name__ == "__main__":
    # 配置日誌
    logging.basicConfig(level=logging.INFO)
    
    # 創建引擎（需要提供實際的特徵提取器和模型）
    # processor = RealtimeAudioProcessor(feature_extractor, model)
    # engine = StreamPredictionEngine(processor)
    
    # 添加回調函數
    # def on_prediction(result: StreamPrediction):
    #     print(f"Chunk {result.chunk_id}: COVID={result.covid_probability:.2%}, "
    #           f"Confidence={result.confidence:.2%}, Type={result.cough_type}")
    
    # engine.add_callback(on_prediction)
    
    # 添加過濾器（只保留高置信度的結果）
    # engine.add_filter(lambda r: r.confidence > 0.8)
    
    # 啟動引擎
    # engine.start()
    
    # 模擬音訊流
    # for i in range(100):
    #     samples = np.random.randn(1600)
    #     engine.add_audio_samples(samples)
    #     time.sleep(0.1)
    
    # engine.stop()
    
    print("實時音訊流處理系統已準備就緒")
