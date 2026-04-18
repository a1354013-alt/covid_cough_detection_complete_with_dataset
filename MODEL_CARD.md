# Model Card: COVID-19 Cough Detection

## Model Details

- **Model Type**: Binary classification (positive/negative)
- **Architecture**: Deep learning model using mel-spectrogram features
- **Input**: Audio recordings of coughs (WAV/MP3/OGG/WebM, max 10MB)
- **Output**: Probability score and binary label
- **Version**: 1.0.13

## Intended Use

This model is designed for **research and educational purposes only**. It analyzes audio recordings to detect patterns that may be associated with respiratory conditions.

### Primary Use Cases
- Research studies on cough acoustics
- Educational demonstrations of ML-based audio analysis
- Prototype health screening applications (non-diagnostic)

### Out-of-Scope Uses
- **Medical diagnosis** - This model is NOT approved for clinical use
- Treatment decisions or medical advice
- Regulatory submissions without additional validation

## Training Data

### Data Sources
- Public cough audio datasets (e.g., COUGHVID)
- Synthetic data augmentation for class balance

### Data Limitations
- May not represent all demographic groups equally
- Recording quality varies across sources
- Limited diversity in background noise conditions
- Geographic and linguistic bias in source data

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Accuracy | 0.82 (est.) | Internal validation on COUGHVID subset |
| Sensitivity | 0.78 (est.) | Requires clinical validation |
| Specificity | 0.85 (est.) | Requires clinical validation |
| AUC-ROC | 0.87 (est.) | Internal validation only |
| Inference Time | <200ms | On CPU (Intel i7), excluding network |
| Model Size | ~50MB | PyTorch checkpoint |

**Note**: Performance metrics are preliminary estimates based on internal validation using a subset of public datasets. **Independent clinical validation is required** before any production deployment. Actual performance may vary significantly based on:
- Recording device quality
- Background noise conditions
- Demographic characteristics of users
- Cough severity and type

## Limitations and Risks

### Known Limitations
1. **Not a diagnostic tool**: Cannot diagnose COVID-19 or any medical condition
2. **Audio quality sensitivity**: Performance degrades with poor recording quality
3. **Background noise**: Ambient sounds may affect predictions
4. **Demographic bias**: May perform differently across age groups, genders, or ethnicities
5. **Device variability**: Different microphones may produce varying results

### Potential Risks
- **False positives**: May cause unnecessary anxiety or testing
- **False negatives**: May provide false reassurance, delaying proper care
- **Misuse**: Risk of inappropriate reliance on non-clinical tool

## Ethical Considerations

- Users must be clearly informed this is NOT a medical diagnostic tool
- Results should not replace professional medical advice
- Data privacy must be maintained for all audio submissions
- Informed consent required for any research deployment

## Disclaimer

**THIS MODEL IS FOR RESEARCH AND EDUCATIONAL PURPOSES ONLY. IT IS NOT INTENDED FOR MEDICAL DIAGNOSIS, TREATMENT, OR PREVENTION OF ANY DISEASE. ALWAYS CONSULT QUALIFIED HEALTHCARE PROFESSIONALS FOR MEDICAL CONCERNS.**

## Citation

If using this model in research, please cite appropriately and acknowledge limitations.

## Contact

For questions about this model card or the underlying research, please contact the project maintainers.

---
Last Updated: 2024
Model Version: 1.0.13
