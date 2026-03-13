"""
患者歷史追蹤系統

追蹤患者的檢測歷史、趨勢分析和健康狀態變化。

主要類：
- PatientRecord: 患者記錄
- HistoryTracker: 歷史追蹤器
- TrendAnalyzer: 趨勢分析器
"""

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np
import logging

logger = logging.getLogger(__name__)


@dataclass
class PredictionRecord:
    """預測記錄"""
    timestamp: str
    covid_probability: float
    confidence: float
    cough_type: str
    severity: str
    quality_score: float
    audio_file: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class PatientRecord:
    """患者記錄"""
    patient_id: str
    name: str
    age: int
    gender: str
    medical_history: List[str]
    contact_info: str
    created_at: str
    last_updated: str


@dataclass
class HealthTrend:
    """健康趨勢"""
    period: str
    avg_covid_probability: float
    max_covid_probability: float
    min_covid_probability: float
    trend_direction: str  # 'improving', 'stable', 'worsening'
    prediction_count: int
    avg_confidence: float


class HistoryTracker:
    """
    歷史追蹤器
    
    管理患者的檢測歷史和統計信息
    """
    
    def __init__(self, db_path: str = "patient_history.db"):
        """
        初始化歷史追蹤器
        
        Args:
            db_path: 數據庫路徑
        """
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self) -> None:
        """初始化數據庫"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 患者表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                patient_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age INTEGER,
                gender TEXT,
                medical_history TEXT,
                contact_info TEXT,
                created_at TEXT,
                last_updated TEXT
            )
        """)
        
        # 預測記錄表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                covid_probability REAL,
                confidence REAL,
                cough_type TEXT,
                severity TEXT,
                quality_score REAL,
                audio_file TEXT,
                notes TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
            )
        """)
        
        # 創建索引
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_patient_timestamp 
            ON predictions(patient_id, timestamp)
        """)
        
        conn.commit()
        conn.close()
        logger.info(f"數據庫初始化完成: {self.db_path}")
    
    def add_patient(self, patient: PatientRecord) -> None:
        """
        添加患者
        
        Args:
            patient: 患者記錄
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO patients 
            (patient_id, name, age, gender, medical_history, contact_info, created_at, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient.patient_id,
            patient.name,
            patient.age,
            patient.gender,
            json.dumps(patient.medical_history),
            patient.contact_info,
            patient.created_at,
            patient.last_updated
        ))
        
        conn.commit()
        conn.close()
        logger.info(f"患者已添加: {patient.patient_id}")
    
    def add_prediction(
        self,
        patient_id: str,
        prediction: PredictionRecord
    ) -> None:
        """
        添加預測記錄
        
        Args:
            patient_id: 患者 ID
            prediction: 預測記錄
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO predictions 
            (patient_id, timestamp, covid_probability, confidence, cough_type, severity, quality_score, audio_file, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient_id,
            prediction.timestamp,
            prediction.covid_probability,
            prediction.confidence,
            prediction.cough_type,
            prediction.severity,
            prediction.quality_score,
            prediction.audio_file,
            prediction.notes
        ))
        
        # 更新患者的 last_updated
        cursor.execute("""
            UPDATE patients SET last_updated = ? WHERE patient_id = ?
        """, (datetime.now().isoformat(), patient_id))
        
        conn.commit()
        conn.close()
        logger.info(f"預測記錄已添加: {patient_id}")
    
    def get_patient_history(
        self,
        patient_id: str,
        days: int = 30
    ) -> List[PredictionRecord]:
        """
        獲取患者的預測歷史
        
        Args:
            patient_id: 患者 ID
            days: 天數
            
        Returns:
            預測記錄列表
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        cursor.execute("""
            SELECT timestamp, covid_probability, confidence, cough_type, severity, quality_score, audio_file, notes
            FROM predictions
            WHERE patient_id = ? AND timestamp > ?
            ORDER BY timestamp DESC
        """, (patient_id, cutoff_date))
        
        rows = cursor.fetchall()
        conn.close()
        
        records = [
            PredictionRecord(
                timestamp=row[0],
                covid_probability=row[1],
                confidence=row[2],
                cough_type=row[3],
                severity=row[4],
                quality_score=row[5],
                audio_file=row[6],
                notes=row[7]
            )
            for row in rows
        ]
        
        return records
    
    def get_patient_info(self, patient_id: str) -> Optional[PatientRecord]:
        """
        獲取患者信息
        
        Args:
            patient_id: 患者 ID
            
        Returns:
            患者記錄或 None
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT patient_id, name, age, gender, medical_history, contact_info, created_at, last_updated
            FROM patients
            WHERE patient_id = ?
        """, (patient_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return PatientRecord(
                patient_id=row[0],
                name=row[1],
                age=row[2],
                gender=row[3],
                medical_history=json.loads(row[4]),
                contact_info=row[5],
                created_at=row[6],
                last_updated=row[7]
            )
        
        return None
    
    def get_all_patients(self) -> List[PatientRecord]:
        """獲取所有患者"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT patient_id, name, age, gender, medical_history, contact_info, created_at, last_updated
            FROM patients
            ORDER BY last_updated DESC
        """)
        
        rows = cursor.fetchall()
        conn.close()
        
        patients = [
            PatientRecord(
                patient_id=row[0],
                name=row[1],
                age=row[2],
                gender=row[3],
                medical_history=json.loads(row[4]),
                contact_info=row[5],
                created_at=row[6],
                last_updated=row[7]
            )
            for row in rows
        ]
        
        return patients


class TrendAnalyzer:
    """
    趨勢分析器
    
    分析患者的健康趨勢和變化
    """
    
    def __init__(self, tracker: HistoryTracker):
        """
        初始化趨勢分析器
        
        Args:
            tracker: 歷史追蹤器
        """
        self.tracker = tracker
    
    def analyze_trend(
        self,
        patient_id: str,
        period_days: int = 7
    ) -> HealthTrend:
        """
        分析健康趨勢
        
        Args:
            patient_id: 患者 ID
            period_days: 分析周期（天）
            
        Returns:
            HealthTrend 對象
        """
        history = self.tracker.get_patient_history(patient_id, days=period_days * 2)
        
        if not history:
            return HealthTrend(
                period=f"{period_days} days",
                avg_covid_probability=0.0,
                max_covid_probability=0.0,
                min_covid_probability=0.0,
                trend_direction="stable",
                prediction_count=0,
                avg_confidence=0.0
            )
        
        # 分割為兩個周期
        cutoff_date = (datetime.now() - timedelta(days=period_days)).isoformat()
        recent = [r for r in history if r.timestamp > cutoff_date]
        previous = [r for r in history if r.timestamp <= cutoff_date]
        
        # 計算指標
        covid_probs = [r.covid_probability for r in recent]
        confidences = [r.confidence for r in recent]
        
        avg_covid_prob = np.mean(covid_probs) if covid_probs else 0.0
        max_covid_prob = np.max(covid_probs) if covid_probs else 0.0
        min_covid_prob = np.min(covid_probs) if covid_probs else 0.0
        avg_confidence = np.mean(confidences) if confidences else 0.0
        
        # 判斷趨勢方向
        if previous and recent:
            prev_avg = np.mean([r.covid_probability for r in previous])
            trend_direction = self._determine_trend(prev_avg, avg_covid_prob)
        else:
            trend_direction = "stable"
        
        return HealthTrend(
            period=f"{period_days} days",
            avg_covid_probability=float(avg_covid_prob),
            max_covid_probability=float(max_covid_prob),
            min_covid_probability=float(min_covid_prob),
            trend_direction=trend_direction,
            prediction_count=len(recent),
            avg_confidence=float(avg_confidence)
        )
    
    def get_trend_summary(self, patient_id: str) -> Dict:
        """
        獲取趨勢摘要
        
        Args:
            patient_id: 患者 ID
            
        Returns:
            趨勢摘要字典
        """
        trends = {
            '7_days': self.analyze_trend(patient_id, 7),
            '14_days': self.analyze_trend(patient_id, 14),
            '30_days': self.analyze_trend(patient_id, 30)
        }
        
        return {
            'patient_id': patient_id,
            'trends': {
                k: {
                    'avg_covid_probability': v.avg_covid_probability,
                    'max_covid_probability': v.max_covid_probability,
                    'min_covid_probability': v.min_covid_probability,
                    'trend_direction': v.trend_direction,
                    'prediction_count': v.prediction_count,
                    'avg_confidence': v.avg_confidence
                }
                for k, v in trends.items()
            },
            'overall_trend': self._determine_overall_trend(trends)
        }
    
    def _determine_trend(self, prev_avg: float, current_avg: float) -> str:
        """確定趨勢方向"""
        change = current_avg - prev_avg
        
        if change > 0.05:
            return "worsening"
        elif change < -0.05:
            return "improving"
        else:
            return "stable"
    
    def _determine_overall_trend(self, trends: Dict) -> str:
        """確定整體趨勢"""
        trend_7d = trends['7_days'].trend_direction
        trend_14d = trends['14_days'].trend_direction
        
        if trend_7d == trend_14d:
            return trend_7d
        else:
            return "mixed"
    
    def get_recommendations(self, patient_id: str) -> List[str]:
        """
        獲取健康建議
        
        Args:
            patient_id: 患者 ID
            
        Returns:
            建議列表
        """
        trend_summary = self.get_trend_summary(patient_id)
        trends = trend_summary['trends']
        
        recommendations = []
        
        # 基於 7 天趨勢的建議
        trend_7d = trends['7_days']
        
        if trend_7d['avg_covid_probability'] > 0.7:
            recommendations.append("COVID-19 概率較高，建議進行核酸檢測確認")
        
        if trend_7d['trend_direction'] == 'worsening':
            recommendations.append("健康狀況趨於惡化，建議及時就醫")
        elif trend_7d['trend_direction'] == 'improving':
            recommendations.append("健康狀況趨於改善，繼續保持當前治療")
        
        if trend_7d['prediction_count'] < 2:
            recommendations.append("檢測數據不足，建議增加檢測頻率")
        
        if not recommendations:
            recommendations.append("健康狀況良好，繼續定期監測")
        
        return recommendations


# 使用示例
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # 創建追蹤器
    tracker = HistoryTracker()
    
    # 添加患者
    # patient = PatientRecord(
    #     patient_id="P001",
    #     name="John Doe",
    #     age=35,
    #     gender="Male",
    #     medical_history=["Asthma"],
    #     contact_info="john@example.com",
    #     created_at=datetime.now().isoformat(),
    #     last_updated=datetime.now().isoformat()
    # )
    # tracker.add_patient(patient)
    
    # 添加預測記錄
    # prediction = PredictionRecord(
    #     timestamp=datetime.now().isoformat(),
    #     covid_probability=0.2,
    #     confidence=0.95,
    #     cough_type="dry",
    #     severity="mild",
    #     quality_score=85.0
    # )
    # tracker.add_prediction("P001", prediction)
    
    # 分析趨勢
    # analyzer = TrendAnalyzer(tracker)
    # trend = analyzer.analyze_trend("P001")
    # print(f"Trend: {trend}")
    
    print("患者歷史追蹤系統已準備就緒")
