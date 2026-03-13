"""
多分類分類器

支持多種疾病和咳嗽特徵的分類，包括：
- COVID-19 檢測
- 咳嗽類型分類（乾咳、濕咳、喘息等）
- 疾病多分類（流感、肺炎、哮喘等）
- 嚴重程度評估

主要類：
- MultiClassClassifier: 多分類分類器
- DiseaseClassifier: 疾病分類器
- SeverityAssessor: 嚴重程度評估器
"""

import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class MultiClassPrediction:
    """多分類預測結果"""
    primary_disease: str
    primary_probability: float
    disease_probabilities: Dict[str, float]
    cough_type: str
    cough_probabilities: Dict[str, float]
    severity: str
    severity_score: float
    confidence: float
    top_k_predictions: List[Tuple[str, float]]


class MultiClassClassifier:
    """
    多分類分類器
    
    支持多個分類任務的聯合模型：
    - 疾病分類（COVID-19、流感、肺炎、哮喘等）
    - 咳嗽類型分類（乾咳、濕咳、喘息等）
    - 嚴重程度分類（輕、中、重）
    """
    
    # 疾病類別
    DISEASES = {
        'covid_19': 0,
        'influenza': 1,
        'pneumonia': 2,
        'asthma': 3,
        'bronchitis': 4,
        'normal': 5
    }
    
    # 咳嗽類型
    COUGH_TYPES = {
        'dry': 0,
        'wet': 1,
        'wheezing': 2,
        'barking': 3,
        'whooping': 4
    }
    
    # 嚴重程度
    SEVERITY_LEVELS = {
        'mild': 0,
        'moderate': 1,
        'severe': 2
    }
    
    def __init__(
        self,
        disease_model,
        cough_type_model,
        severity_model,
        confidence_threshold: float = 0.7
    ):
        """
        初始化多分類分類器
        
        Args:
            disease_model: 疾病分類模型
            cough_type_model: 咳嗽類型分類模型
            severity_model: 嚴重程度分類模型
            confidence_threshold: 置信度閾值
        """
        self.disease_model = disease_model
        self.cough_type_model = cough_type_model
        self.severity_model = severity_model
        self.confidence_threshold = confidence_threshold
        
        # 反向映射
        self.disease_idx_to_name = {v: k for k, v in self.DISEASES.items()}
        self.cough_idx_to_name = {v: k for k, v in self.COUGH_TYPES.items()}
        self.severity_idx_to_name = {v: k for k, v in self.SEVERITY_LEVELS.items()}
    
    def predict(
        self,
        features: np.ndarray,
        return_top_k: int = 3
    ) -> MultiClassPrediction:
        """
        進行多分類預測
        
        Args:
            features: 輸入特徵
            return_top_k: 返回前 K 個預測
            
        Returns:
            MultiClassPrediction 對象
        """
        # 疾病分類
        disease_probs = self._predict_disease(features)
        primary_disease_idx = np.argmax(disease_probs)
        primary_disease = self.disease_idx_to_name[primary_disease_idx]
        primary_probability = float(disease_probs[primary_disease_idx])
        
        # 咳嗽類型分類
        cough_probs = self._predict_cough_type(features)
        cough_type_idx = np.argmax(cough_probs)
        cough_type = self.cough_idx_to_name[cough_type_idx]
        
        # 嚴重程度評估
        severity_probs = self._predict_severity(features, primary_disease)
        severity_idx = np.argmax(severity_probs)
        severity = self.severity_idx_to_name[severity_idx]
        severity_score = float(severity_probs[severity_idx])
        
        # 計算整體置信度
        confidence = self._calculate_confidence(
            disease_probs,
            cough_probs,
            severity_probs
        )
        
        # 獲取前 K 個預測
        top_k_indices = np.argsort(disease_probs)[-return_top_k:][::-1]
        top_k_predictions = [
            (self.disease_idx_to_name[idx], float(disease_probs[idx]))
            for idx in top_k_indices
        ]
        
        return MultiClassPrediction(
            primary_disease=primary_disease,
            primary_probability=primary_probability,
            disease_probabilities={
                self.disease_idx_to_name[i]: float(disease_probs[i])
                for i in range(len(disease_probs))
            },
            cough_type=cough_type,
            cough_probabilities={
                self.cough_idx_to_name[i]: float(cough_probs[i])
                for i in range(len(cough_probs))
            },
            severity=severity,
            severity_score=severity_score,
            confidence=confidence,
            top_k_predictions=top_k_predictions
        )
    
    def _predict_disease(self, features: np.ndarray) -> np.ndarray:
        """預測疾病類別"""
        with torch.no_grad():
            if isinstance(features, np.ndarray):
                features = torch.from_numpy(features).float()
            if len(features.shape) == 1:
                features = features.unsqueeze(0)
            
            logits = self.disease_model(features)
            probs = torch.softmax(logits, dim=1)
            return probs.cpu().numpy()[0]
    
    def _predict_cough_type(self, features: np.ndarray) -> np.ndarray:
        """預測咳嗽類型"""
        with torch.no_grad():
            if isinstance(features, np.ndarray):
                features = torch.from_numpy(features).float()
            if len(features.shape) == 1:
                features = features.unsqueeze(0)
            
            logits = self.cough_type_model(features)
            probs = torch.softmax(logits, dim=1)
            return probs.cpu().numpy()[0]
    
    def _predict_severity(
        self,
        features: np.ndarray,
        disease: str
    ) -> np.ndarray:
        """預測嚴重程度"""
        with torch.no_grad():
            if isinstance(features, np.ndarray):
                features = torch.from_numpy(features).float()
            if len(features.shape) == 1:
                features = features.unsqueeze(0)
            
            logits = self.severity_model(features)
            probs = torch.softmax(logits, dim=1)
            return probs.cpu().numpy()[0]
    
    def _calculate_confidence(
        self,
        disease_probs: np.ndarray,
        cough_probs: np.ndarray,
        severity_probs: np.ndarray
    ) -> float:
        """計算整體置信度"""
        # 加權平均
        weights = [0.5, 0.3, 0.2]
        max_probs = [
            np.max(disease_probs),
            np.max(cough_probs),
            np.max(severity_probs)
        ]
        confidence = np.average(max_probs, weights=weights)
        return float(confidence)


class DiseaseClassifier:
    """
    疾病分類器
    
    支持 6 種疾病的分類：
    - COVID-19
    - 流感（Influenza）
    - 肺炎（Pneumonia）
    - 哮喘（Asthma）
    - 支氣管炎（Bronchitis）
    - 正常（Normal）
    """
    
    DISEASES = [
        'COVID-19',
        'Influenza',
        'Pneumonia',
        'Asthma',
        'Bronchitis',
        'Normal'
    ]
    
    # 疾病特徵
    DISEASE_CHARACTERISTICS = {
        'COVID-19': {
            'description': '新型冠狀病毒感染',
            'transmission': '飛沫傳播',
            'severity': '中到重',
            'treatment': '抗病毒藥物'
        },
        'Influenza': {
            'description': '流感病毒感染',
            'transmission': '飛沫傳播',
            'severity': '輕到中',
            'treatment': '抗病毒藥物'
        },
        'Pneumonia': {
            'description': '肺部細菌或病毒感染',
            'transmission': '飛沫傳播',
            'severity': '中到重',
            'treatment': '抗生素或抗病毒藥物'
        },
        'Asthma': {
            'description': '慢性氣道炎症',
            'transmission': '非傳染',
            'severity': '輕到中',
            'treatment': '支氣管擴張劑'
        },
        'Bronchitis': {
            'description': '支氣管炎症',
            'transmission': '飛沫傳播',
            'severity': '輕到中',
            'treatment': '止咳藥、支氣管擴張劑'
        },
        'Normal': {
            'description': '正常咳嗽',
            'transmission': '非傳染',
            'severity': '無',
            'treatment': '無需治療'
        }
    }
    
    def __init__(self, model):
        """初始化疾病分類器"""
        self.model = model
    
    def predict(self, features: np.ndarray) -> Dict:
        """
        預測疾病
        
        Returns:
            包含預測結果和疾病信息的字典
        """
        with torch.no_grad():
            if isinstance(features, np.ndarray):
                features = torch.from_numpy(features).float()
            if len(features.shape) == 1:
                features = features.unsqueeze(0)
            
            logits = self.model(features)
            probs = torch.softmax(logits, dim=1)
            probs = probs.cpu().numpy()[0]
            
            disease_idx = np.argmax(probs)
            disease_name = self.DISEASES[disease_idx]
            
            return {
                'disease': disease_name,
                'probability': float(probs[disease_idx]),
                'probabilities': {
                    self.DISEASES[i]: float(probs[i])
                    for i in range(len(probs))
                },
                'characteristics': self.DISEASE_CHARACTERISTICS[disease_name]
            }


class SeverityAssessor:
    """
    嚴重程度評估器
    
    評估咳嗽症狀的嚴重程度：
    - 輕度（Mild）
    - 中度（Moderate）
    - 重度（Severe）
    """
    
    SEVERITY_LEVELS = ['Mild', 'Moderate', 'Severe']
    
    # 嚴重程度指標
    SEVERITY_INDICATORS = {
        'Mild': {
            'duration': '< 1 week',
            'frequency': '< 5 times/hour',
            'intensity': 'Low',
            'impact': '輕微影響日常活動'
        },
        'Moderate': {
            'duration': '1-2 weeks',
            'frequency': '5-15 times/hour',
            'intensity': 'Medium',
            'impact': '明顯影響日常活動'
        },
        'Severe': {
            'duration': '> 2 weeks',
            'frequency': '> 15 times/hour',
            'intensity': 'High',
            'impact': '嚴重影響日常活動和睡眠'
        }
    }
    
    def __init__(self, model):
        """初始化嚴重程度評估器"""
        self.model = model
    
    def assess(self, features: np.ndarray) -> Dict:
        """
        評估嚴重程度
        
        Returns:
            包含嚴重程度評估結果的字典
        """
        with torch.no_grad():
            if isinstance(features, np.ndarray):
                features = torch.from_numpy(features).float()
            if len(features.shape) == 1:
                features = features.unsqueeze(0)
            
            logits = self.model(features)
            probs = torch.softmax(logits, dim=1)
            probs = probs.cpu().numpy()[0]
            
            severity_idx = np.argmax(probs)
            severity_level = self.SEVERITY_LEVELS[severity_idx]
            
            return {
                'severity': severity_level,
                'score': float(probs[severity_idx]),
                'probabilities': {
                    self.SEVERITY_LEVELS[i]: float(probs[i])
                    for i in range(len(probs))
                },
                'indicators': self.SEVERITY_INDICATORS[severity_level],
                'recommendation': self._get_recommendation(severity_level)
            }
    
    def _get_recommendation(self, severity: str) -> str:
        """獲取建議"""
        recommendations = {
            'Mild': '自我監測，多喝水，充分休息',
            'Moderate': '建議就醫，進行進一步檢查',
            'Severe': '建議立即就醫，可能需要住院治療'
        }
        return recommendations.get(severity, '未知')


# 使用示例
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # 創建分類器（需要提供實際的模型）
    # classifier = MultiClassClassifier(disease_model, cough_type_model, severity_model)
    # prediction = classifier.predict(features)
    # print(f"Primary Disease: {prediction.primary_disease}")
    # print(f"Probability: {prediction.primary_probability:.2%}")
    # print(f"Cough Type: {prediction.cough_type}")
    # print(f"Severity: {prediction.severity}")
    # print(f"Confidence: {prediction.confidence:.2%}")
    
    print("多分類分類器已準備就緒")
