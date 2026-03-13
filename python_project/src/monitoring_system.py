"""
企業級運維監控系統

完整的系統監控、性能追蹤、告警和日誌管理。

主要類：
- SystemMonitor: 系統監控器
- PerformanceTracker: 性能追蹤器
- AlertManager: 告警管理器
- MetricsCollector: 指標收集器
"""

import time
import psutil
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from collections import deque
import json
import threading

logger = logging.getLogger(__name__)


@dataclass
class SystemMetrics:
    """系統指標"""
    timestamp: str
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    disk_percent: float
    gpu_memory_percent: float = 0.0
    gpu_utilization: float = 0.0
    network_io_sent: int = 0
    network_io_recv: int = 0


@dataclass
class PerformanceMetrics:
    """性能指標"""
    timestamp: str
    request_count: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_response_time: float = 0.0
    min_response_time: float = 0.0
    max_response_time: float = 0.0
    p95_response_time: float = 0.0
    p99_response_time: float = 0.0
    throughput: float = 0.0  # requests/sec
    error_rate: float = 0.0


@dataclass
class Alert:
    """告警"""
    timestamp: str
    severity: str  # 'critical', 'warning', 'info'
    component: str
    message: str
    value: float = 0.0
    threshold: float = 0.0
    resolved: bool = False


class SystemMonitor:
    """
    系統監控器
    
    監控系統資源使用情況（CPU、內存、磁碟、GPU 等）
    """
    
    def __init__(self, sample_interval: int = 60):
        """
        初始化系統監控器
        
        Args:
            sample_interval: 採樣間隔（秒）
        """
        self.sample_interval = sample_interval
        self.is_running = False
        self.monitor_thread = None
        self.metrics_history = deque(maxlen=1440)  # 24 小時的數據（1分鐘採樣）
        
        # 初始化 psutil
        self.last_net_io = psutil.net_io_counters()
    
    def start(self) -> None:
        """啟動監控"""
        if self.is_running:
            logger.warning("監控器已在運行")
            return
        
        self.is_running = True
        self.monitor_thread = threading.Thread(
            target=self._monitoring_loop,
            daemon=True
        )
        self.monitor_thread.start()
        logger.info("系統監控器已啟動")
    
    def stop(self) -> None:
        """停止監控"""
        self.is_running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5.0)
        logger.info("系統監控器已停止")
    
    def _monitoring_loop(self) -> None:
        """監控循環"""
        while self.is_running:
            try:
                metrics = self._collect_metrics()
                self.metrics_history.append(metrics)
            except Exception as e:
                logger.error(f"收集指標時出錯: {e}")
            
            time.sleep(self.sample_interval)
    
    def _collect_metrics(self) -> SystemMetrics:
        """收集系統指標"""
        # CPU 使用率
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # 內存使用率
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        memory_mb = memory.used / (1024 ** 2)
        
        # 磁碟使用率
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent
        
        # 網絡 I/O
        current_net_io = psutil.net_io_counters()
        net_sent = current_net_io.bytes_sent - self.last_net_io.bytes_sent
        net_recv = current_net_io.bytes_recv - self.last_net_io.bytes_recv
        self.last_net_io = current_net_io
        
        # GPU 指標（如果可用）
        gpu_memory_percent = 0.0
        gpu_utilization = 0.0
        try:
            import pynvml
            pynvml.nvmlInit()
            device_count = pynvml.nvmlDeviceGetCount()
            if device_count > 0:
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                gpu_memory_percent = (mem_info.used / mem_info.total) * 100
                
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_utilization = util.gpu
        except Exception:
            pass
        
        return SystemMetrics(
            timestamp=datetime.now().isoformat(),
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            memory_mb=memory_mb,
            disk_percent=disk_percent,
            gpu_memory_percent=gpu_memory_percent,
            gpu_utilization=gpu_utilization,
            network_io_sent=net_sent,
            network_io_recv=net_recv
        )
    
    def get_current_metrics(self) -> Optional[SystemMetrics]:
        """獲取當前指標"""
        if self.metrics_history:
            return self.metrics_history[-1]
        return None
    
    def get_metrics_summary(self, hours: int = 1) -> Dict:
        """
        獲取指標摘要
        
        Args:
            hours: 時間範圍（小時）
            
        Returns:
            指標摘要字典
        """
        if not self.metrics_history:
            return {}
        
        # 計算時間範圍內的數據
        cutoff_time = datetime.now() - timedelta(hours=hours)
        relevant_metrics = [
            m for m in self.metrics_history
            if datetime.fromisoformat(m.timestamp) > cutoff_time
        ]
        
        if not relevant_metrics:
            return {}
        
        # 計算統計信息
        cpu_values = [m.cpu_percent for m in relevant_metrics]
        memory_values = [m.memory_percent for m in relevant_metrics]
        
        return {
            'period_hours': hours,
            'sample_count': len(relevant_metrics),
            'cpu': {
                'avg': sum(cpu_values) / len(cpu_values),
                'max': max(cpu_values),
                'min': min(cpu_values)
            },
            'memory': {
                'avg': sum(memory_values) / len(memory_values),
                'max': max(memory_values),
                'min': min(memory_values)
            }
        }


class PerformanceTracker:
    """
    性能追蹤器
    
    追蹤 API 性能指標
    """
    
    def __init__(self):
        """初始化性能追蹤器"""
        self.request_times = deque(maxlen=10000)
        self.request_count = 0
        self.successful_count = 0
        self.failed_count = 0
        self.start_time = time.time()
    
    def record_request(
        self,
        response_time: float,
        success: bool = True
    ) -> None:
        """
        記錄請求
        
        Args:
            response_time: 響應時間（秒）
            success: 是否成功
        """
        self.request_times.append(response_time)
        self.request_count += 1
        
        if success:
            self.successful_count += 1
        else:
            self.failed_count += 1
    
    def get_metrics(self) -> PerformanceMetrics:
        """獲取性能指標"""
        if not self.request_times:
            return PerformanceMetrics(
                timestamp=datetime.now().isoformat(),
                request_count=0
            )
        
        times = sorted(self.request_times)
        
        # 計算百分位數
        p95_idx = int(len(times) * 0.95)
        p99_idx = int(len(times) * 0.99)
        
        # 計算吞吐量
        elapsed_time = time.time() - self.start_time
        throughput = self.request_count / elapsed_time if elapsed_time > 0 else 0
        
        return PerformanceMetrics(
            timestamp=datetime.now().isoformat(),
            request_count=self.request_count,
            successful_requests=self.successful_count,
            failed_requests=self.failed_count,
            avg_response_time=sum(times) / len(times),
            min_response_time=min(times),
            max_response_time=max(times),
            p95_response_time=times[p95_idx] if p95_idx < len(times) else 0,
            p99_response_time=times[p99_idx] if p99_idx < len(times) else 0,
            throughput=throughput,
            error_rate=self.failed_count / self.request_count if self.request_count > 0 else 0
        )


class AlertManager:
    """
    告警管理器
    
    管理系統告警和通知
    """
    
    def __init__(self):
        """初始化告警管理器"""
        self.alerts = deque(maxlen=10000)
        self.alert_thresholds = {
            'cpu_percent': 80.0,
            'memory_percent': 85.0,
            'disk_percent': 90.0,
            'error_rate': 0.05,
            'response_time': 5.0
        }
    
    def check_and_alert(
        self,
        component: str,
        metric_name: str,
        value: float
    ) -> Optional[Alert]:
        """
        檢查指標並生成告警
        
        Args:
            component: 組件名稱
            metric_name: 指標名稱
            value: 指標值
            
        Returns:
            Alert 對象或 None
        """
        threshold = self.alert_thresholds.get(metric_name)
        
        if threshold is None or value < threshold:
            return None
        
        # 確定嚴重程度
        if value > threshold * 1.5:
            severity = 'critical'
        else:
            severity = 'warning'
        
        alert = Alert(
            timestamp=datetime.now().isoformat(),
            severity=severity,
            component=component,
            message=f"{metric_name} 超過閾值: {value:.2f} > {threshold:.2f}",
            value=value,
            threshold=threshold
        )
        
        self.alerts.append(alert)
        logger.warning(f"告警: {alert.message}")
        
        return alert
    
    def get_active_alerts(self) -> List[Alert]:
        """獲取活躍告警"""
        return [a for a in self.alerts if not a.resolved]
    
    def resolve_alert(self, alert_idx: int) -> None:
        """解決告警"""
        if 0 <= alert_idx < len(self.alerts):
            self.alerts[alert_idx].resolved = True


class MetricsCollector:
    """
    指標收集器
    
    統一收集和管理所有指標
    """
    
    def __init__(self):
        """初始化指標收集器"""
        self.system_monitor = SystemMonitor()
        self.performance_tracker = PerformanceTracker()
        self.alert_manager = AlertManager()
        self.metrics_history = deque(maxlen=1440)
    
    def start(self) -> None:
        """啟動收集器"""
        self.system_monitor.start()
        logger.info("指標收集器已啟動")
    
    def stop(self) -> None:
        """停止收集器"""
        self.system_monitor.stop()
        logger.info("指標收集器已停止")
    
    def record_request(self, response_time: float, success: bool = True) -> None:
        """記錄請求"""
        self.performance_tracker.record_request(response_time, success)
    
    def get_dashboard_data(self) -> Dict:
        """
        獲取儀表板數據
        
        Returns:
            包含所有指標的字典
        """
        system_metrics = self.system_monitor.get_current_metrics()
        performance_metrics = self.performance_tracker.get_metrics()
        active_alerts = self.alert_manager.get_active_alerts()
        
        # 檢查告警
        if system_metrics:
            self.alert_manager.check_and_alert(
                'system',
                'cpu_percent',
                system_metrics.cpu_percent
            )
            self.alert_manager.check_and_alert(
                'system',
                'memory_percent',
                system_metrics.memory_percent
            )
        
        if performance_metrics:
            self.alert_manager.check_and_alert(
                'api',
                'error_rate',
                performance_metrics.error_rate * 100
            )
        
        return {
            'timestamp': datetime.now().isoformat(),
            'system': {
                'cpu_percent': system_metrics.cpu_percent if system_metrics else 0,
                'memory_percent': system_metrics.memory_percent if system_metrics else 0,
                'memory_mb': system_metrics.memory_mb if system_metrics else 0,
                'disk_percent': system_metrics.disk_percent if system_metrics else 0,
                'gpu_memory_percent': system_metrics.gpu_memory_percent if system_metrics else 0,
                'gpu_utilization': system_metrics.gpu_utilization if system_metrics else 0
            },
            'performance': {
                'request_count': performance_metrics.request_count,
                'successful_requests': performance_metrics.successful_requests,
                'failed_requests': performance_metrics.failed_requests,
                'avg_response_time': performance_metrics.avg_response_time,
                'p95_response_time': performance_metrics.p95_response_time,
                'p99_response_time': performance_metrics.p99_response_time,
                'throughput': performance_metrics.throughput,
                'error_rate': performance_metrics.error_rate
            },
            'alerts': [
                {
                    'timestamp': a.timestamp,
                    'severity': a.severity,
                    'component': a.component,
                    'message': a.message,
                    'resolved': a.resolved
                }
                for a in active_alerts
            ]
        }
    
    def export_metrics(self, filepath: str) -> None:
        """
        導出指標到文件
        
        Args:
            filepath: 文件路徑
        """
        data = self.get_dashboard_data()
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"指標已導出到: {filepath}")


# 使用示例
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # 創建收集器
    collector = MetricsCollector()
    collector.start()
    
    # 模擬請求
    import random
    for i in range(100):
        response_time = random.uniform(0.1, 2.0)
        success = random.random() > 0.05
        collector.record_request(response_time, success)
        time.sleep(0.1)
    
    # 獲取儀表板數據
    dashboard_data = collector.get_dashboard_data()
    print(json.dumps(dashboard_data, indent=2))
    
    # 導出指標
    collector.export_metrics("metrics.json")
    
    collector.stop()
    
    print("企業級運維監控系統已準備就緒")
