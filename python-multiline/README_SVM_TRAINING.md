# SVM Patch Classifier Training Guide

This guide explains how to fine-tune the SVM model for patch classification on your custom dataset.

## Overview

The SVM classifier is used as a pre-filtering step to identify patches that contain graph content before passing them to the UNet model. This reduces computational cost by skipping irrelevant patches.

## Quick Start

### 1. Prepare Your Dataset

You have three options:

#### Option A: Extract patches from full images
```bash
python prepare_dataset.py --mode extract --input_dir ./raw_images --output_dir ./data --patch_size 256
```

This will:
- Extract 256x256 patches from all images in `./raw_images`
- Save patches to `./data/extracted_patches/`
- Create metadata file with patch information

#### Option B: Auto-organize existing patches
```bash
python prepare_dataset.py --mode auto_organize --input_dir ./patches --output_dir ./data --threshold 0.1
```

This will automatically organize patches based on white pixel content (simple heuristic).

#### Option C: Manual organization
Organize your patches manually into this structure:
```
data/
├── positive/     # Patches containing graph content
│   ├── patch_001.png
│   ├── patch_002.png
│   └── ...
└── negative/     # Patches without graph content
    ├── patch_001.png
    ├── patch_002.png
    └── ...
```

### 2. Train the SVM Model

#### Basic Training
```bash
python train_svm.py --data_dir ./data --output_dir ./models
```

#### Training with Grid Search (Recommended)
```bash
python train_svm.py --data_dir ./data --output_dir ./models --grid_search
```

This will:
- Automatically find the best hyperparameters (C, gamma, kernel)
- Take longer but produce better results

#### Custom Hyperparameters
```bash
python train_svm.py --data_dir ./data --output_dir ./models --kernel rbf --C 10 --gamma 0.01
```

### 3. Evaluate Results

After training, check:
- `models/classification_report.txt` - Accuracy and performance metrics
- `models/confusion_matrix.png` - Visual confusion matrix
- `models/training_config.txt` - Training configuration details

### 4. Use the Trained Model

The trained model will be saved as:
- `models/svm_model.pkl` - The SVM classifier
- `models/scaler.pkl` - Feature scaler (required for inference)

These files will automatically be used by `main.py` when you restart the server.

## Command-Line Options

### prepare_dataset.py

| Option | Description | Default |
|--------|-------------|---------|
| `--mode` | Mode: `extract`, `organize`, or `auto_organize` | Required |
| `--input_dir` | Input directory path | Required |
| `--output_dir` | Output directory path | Required |
| `--patch_size` | Patch size for extraction | 256 |
| `--threshold` | White pixel threshold for auto-organize | 0.1 |

### train_svm.py

| Option | Description | Default |
|--------|-------------|---------|
| `--data_dir` | Path to dataset (with positive/ and negative/ folders) | ./data |
| `--output_dir` | Directory to save models | ./models |
| `--test_split` | Fraction of data for testing | 0.2 |
| `--grid_search` | Enable hyperparameter tuning | False |
| `--kernel` | SVM kernel type (rbf, linear, poly, sigmoid) | rbf |
| `--C` | Regularization parameter | 1.0 |
| `--gamma` | Kernel coefficient | scale |
| `--max_samples` | Max samples per class (for testing) | None |
| `--random_state` | Random seed | 42 |

## Examples

### Example 1: Complete Workflow from Scratch

```bash
# Step 1: Extract patches from your graph images
python prepare_dataset.py --mode extract --input_dir ./my_graphs --output_dir ./training_data --patch_size 256

# Step 2: Review and organize patches manually
# Move patches from ./training_data/extracted_patches/ to:
#   - ./training_data/positive/ (has graph content)
#   - ./training_data/negative/ (no graph content)

# Step 3: Train with grid search
python train_svm.py --data_dir ./training_data --output_dir ./models --grid_search

# Step 4: Check results
# Review models/classification_report.txt and models/confusion_matrix.png
```

### Example 2: Quick Training with Existing Dataset

```bash
# If you already have organized positive/ and negative/ folders
python train_svm.py --data_dir ./my_dataset --output_dir ./models --grid_search
```

### Example 3: Fine-tune Existing Model

```bash
# Train with specific hyperparameters based on previous results
python train_svm.py --data_dir ./new_data --output_dir ./models --kernel rbf --C 100 --gamma 0.001
```

## Tips for Better Results

1. **Balanced Dataset**: Try to have similar numbers of positive and negative samples
2. **Quality over Quantity**: 500-1000 well-labeled patches per class is better than 10,000 poorly labeled ones
3. **Representative Samples**: Include diverse examples (different graph types, backgrounds, etc.)
4. **Grid Search**: Always use `--grid_search` for production models unless you know optimal hyperparameters
5. **Validation**: Check the confusion matrix to identify misclassification patterns

## Troubleshooting

### Issue: Low accuracy on test set
- **Solution**: Collect more diverse training data or use grid search

### Issue: Model predicts mostly one class
- **Solution**: Balance your dataset (equal positive/negative samples)

### Issue: Out of memory during training
- **Solution**: Use `--max_samples` to limit dataset size for testing

### Issue: Training is very slow
- **Solution**: Reduce dataset size or disable grid search for faster training

## Feature Extraction Details

The SVM uses the following feature extraction:
1. Convert patch to grayscale (average RGB channels)
2. Resize to 100x100 pixels
3. Flatten to 10,000-dimensional feature vector
4. Standardize using StandardScaler

This matches the feature extraction in `main.py` for consistency.

## Model Performance Metrics

After training, you'll see:
- **Accuracy**: Overall correctness
- **Precision**: Of patches predicted as positive, how many actually are?
- **Recall**: Of actual positive patches, how many did we find?
- **F1-Score**: Harmonic mean of precision and recall

For patch classification, aim for:
- Accuracy > 90%
- Recall > 85% (don't miss too many graph patches)
- Precision > 80% (minimize false positives to reduce UNet workload)

## Integration with Main Pipeline

Once trained, the models are automatically used in the main pipeline:

```python
# In main.py, the SVM filters patches before UNet processing
for patch in patches:
    features = extract_features(patch)
    features_scaled = LOADED_SCALER.transform([features])
    svm_pred = LOADED_MODEL.predict(features_scaled)[0]
    
    if svm_pred == 1:  # Only process patches classified as containing graphs
        # Pass to UNet for detailed segmentation
        ...
```

This two-stage approach significantly speeds up processing by avoiding expensive UNet inference on empty patches.
