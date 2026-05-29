"""
SVM Patch Classifier Training Script

This script allows you to fine-tune the SVM model for patch classification.
The model classifies patches as containing graph content (1) or not (0).

Dataset Structure:
    data/
    ├── positive/  # Patches containing graph content
    │   ├── patch_001.png
    │   ├── patch_002.png
    │   └── ...
    └── negative/  # Patches without graph content
        ├── patch_001.png
        ├── patch_002.png
        └── ...

Usage:
    python train_svm.py --data_dir ./data --output_dir ./models
"""

import os
import argparse
import pickle
import numpy as np
from PIL import Image
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt
import seaborn as sns
from tqdm import tqdm
from pathlib import Path


def extract_features(patch):
    """
    Extract features from a patch image.
    Converts to grayscale, resizes to 100x100, and flattens.
    
    Args:
        patch: numpy array or PIL Image
        
    Returns:
        flattened feature vector
    """
    if isinstance(patch, Image.Image):
        patch = np.array(patch)
    
    if len(patch.shape) == 3:
        gray_patch = np.mean(patch, axis=2)
    else:
        gray_patch = patch
    
    gray_img = Image.fromarray(gray_patch.astype(np.uint8))
    gray_img = gray_img.resize((100, 100))
    gray_patch_resized = np.array(gray_img)
    features = gray_patch_resized.flatten()
    
    return features


def load_dataset(data_dir, max_samples_per_class=None):
    """
    Load dataset from directory structure.
    
    Args:
        data_dir: Path to data directory containing 'positive' and 'negative' folders
        max_samples_per_class: Optional limit on samples per class
        
    Returns:
        X: Feature matrix
        y: Labels (0 for negative, 1 for positive)
    """
    data_dir = Path(data_dir)
    positive_dir = data_dir / 'positive'
    negative_dir = data_dir / 'negative'
    
    if not positive_dir.exists() or not negative_dir.exists():
        raise ValueError(f"Data directory must contain 'positive' and 'negative' subdirectories.\n"
                        f"Expected structure:\n"
                        f"  {data_dir}/positive/\n"
                        f"  {data_dir}/negative/")
    
    X = []
    y = []
    
    # Load positive samples (label = 1)
    print("Loading positive samples...")
    positive_files = list(positive_dir.glob('*.png')) + list(positive_dir.glob('*.jpg')) + list(positive_dir.glob('*.jpeg'))
    if max_samples_per_class:
        positive_files = positive_files[:max_samples_per_class]
    
    for img_path in tqdm(positive_files):
        try:
            img = Image.open(img_path).convert('RGB')
            features = extract_features(img)
            X.append(features)
            y.append(1)
        except Exception as e:
            print(f"Error loading {img_path}: {e}")
    
    # Load negative samples (label = 0)
    print("Loading negative samples...")
    negative_files = list(negative_dir.glob('*.png')) + list(negative_dir.glob('*.jpg')) + list(negative_dir.glob('*.jpeg'))
    if max_samples_per_class:
        negative_files = negative_files[:max_samples_per_class]
    
    for img_path in tqdm(negative_files):
        try:
            img = Image.open(img_path).convert('RGB')
            features = extract_features(img)
            X.append(features)
            y.append(0)
        except Exception as e:
            print(f"Error loading {img_path}: {e}")
    
    X = np.array(X)
    y = np.array(y)
    
    print(f"\nDataset loaded:")
    print(f"  Total samples: {len(X)}")
    print(f"  Positive samples: {np.sum(y == 1)}")
    print(f"  Negative samples: {np.sum(y == 0)}")
    print(f"  Feature dimension: {X.shape[1]}")
    
    return X, y


def train_svm(X_train, y_train, use_grid_search=True, kernel='rbf', C=1.0, gamma='scale'):
    """
    Train SVM classifier with optional hyperparameter tuning.
    
    Args:
        X_train: Training features
        y_train: Training labels
        use_grid_search: Whether to use grid search for hyperparameter tuning
        kernel: SVM kernel type (if not using grid search)
        C: Regularization parameter (if not using grid search)
        gamma: Kernel coefficient (if not using grid search)
        
    Returns:
        Trained SVM model
    """
    if use_grid_search:
        print("\nPerforming grid search for hyperparameter tuning...")
        param_grid = {
            'C': [0.1, 1, 10, 100],
            'gamma': ['scale', 'auto', 0.001, 0.01, 0.1],
            'kernel': ['rbf', 'linear']
        }
        
        svm = SVC(random_state=42)
        grid_search = GridSearchCV(svm, param_grid, cv=5, scoring='accuracy', 
                                   verbose=2, n_jobs=-1)
        grid_search.fit(X_train, y_train)
        
        print(f"\nBest parameters: {grid_search.best_params_}")
        print(f"Best cross-validation score: {grid_search.best_score_:.4f}")
        
        return grid_search.best_estimator_
    else:
        print(f"\nTraining SVM with kernel={kernel}, C={C}, gamma={gamma}...")
        svm = SVC(kernel=kernel, C=C, gamma=gamma, random_state=42)
        svm.fit(X_train, y_train)
        return svm


def evaluate_model(model, X_test, y_test, output_dir):
    """
    Evaluate model and generate visualizations.
    
    Args:
        model: Trained SVM model
        X_test: Test features
        y_test: Test labels
        output_dir: Directory to save evaluation results
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Make predictions
    y_pred = model.predict(X_test)
    
    # Calculate metrics
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nTest Accuracy: {accuracy:.4f}")
    
    # Classification report
    print("\nClassification Report:")
    report = classification_report(y_test, y_pred, target_names=['Negative', 'Positive'])
    print(report)
    
    # Save report to file
    with open(output_dir / 'classification_report.txt', 'w') as f:
        f.write(f"Test Accuracy: {accuracy:.4f}\n\n")
        f.write("Classification Report:\n")
        f.write(report)
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=['Negative', 'Positive'],
                yticklabels=['Negative', 'Positive'])
    plt.title('Confusion Matrix')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig(output_dir / 'confusion_matrix.png', dpi=300, bbox_inches='tight')
    print(f"\nConfusion matrix saved to {output_dir / 'confusion_matrix.png'}")
    plt.close()
    
    return accuracy


def main():
    parser = argparse.ArgumentParser(description='Train SVM for patch classification')
    parser.add_argument('--data_dir', type=str, default='./data',
                       help='Path to data directory containing positive/ and negative/ folders')
    parser.add_argument('--output_dir', type=str, default='./models',
                       help='Directory to save trained models')
    parser.add_argument('--test_split', type=float, default=0.2,
                       help='Fraction of data to use for testing (default: 0.2)')
    parser.add_argument('--grid_search', action='store_true',
                       help='Use grid search for hyperparameter tuning')
    parser.add_argument('--kernel', type=str, default='rbf',
                       choices=['rbf', 'linear', 'poly', 'sigmoid'],
                       help='SVM kernel type (used if --grid_search is not set)')
    parser.add_argument('--C', type=float, default=1.0,
                       help='Regularization parameter (used if --grid_search is not set)')
    parser.add_argument('--gamma', type=str, default='scale',
                       help='Kernel coefficient (used if --grid_search is not set)')
    parser.add_argument('--max_samples', type=int, default=None,
                       help='Maximum samples per class (for testing with smaller dataset)')
    parser.add_argument('--random_state', type=int, default=42,
                       help='Random seed for reproducibility')
    
    args = parser.parse_args()
    
    print("="*60)
    print("SVM Patch Classifier Training")
    print("="*60)
    
    # Load dataset
    X, y = load_dataset(args.data_dir, max_samples_per_class=args.max_samples)
    
    # Split dataset
    print(f"\nSplitting dataset (test_size={args.test_split})...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_split, random_state=args.random_state, stratify=y
    )
    
    print(f"  Training samples: {len(X_train)}")
    print(f"  Test samples: {len(X_test)}")
    
    # Scale features
    print("\nScaling features...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model
    model = train_svm(X_train_scaled, y_train, 
                     use_grid_search=args.grid_search,
                     kernel=args.kernel, C=args.C, gamma=args.gamma)
    
    # Evaluate model
    accuracy = evaluate_model(model, X_test_scaled, y_test, args.output_dir)
    
    # Save model and scaler
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    model_path = output_dir / 'svm_model.pkl'
    scaler_path = output_dir / 'scaler.pkl'
    
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    print(f"\nModel saved to {model_path}")
    
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"Scaler saved to {scaler_path}")
    
    # Save training configuration
    config = {
        'data_dir': args.data_dir,
        'test_split': args.test_split,
        'grid_search': args.grid_search,
        'kernel': model.kernel if hasattr(model, 'kernel') else args.kernel,
        'C': model.C if hasattr(model, 'C') else args.C,
        'gamma': model.gamma if hasattr(model, 'gamma') else args.gamma,
        'accuracy': accuracy,
        'n_train_samples': len(X_train),
        'n_test_samples': len(X_test),
        'feature_dim': X.shape[1]
    }
    
    config_path = output_dir / 'training_config.txt'
    with open(config_path, 'w') as f:
        f.write("SVM Training Configuration\n")
        f.write("="*50 + "\n\n")
        for key, value in config.items():
            f.write(f"{key}: {value}\n")
    print(f"Configuration saved to {config_path}")
    
    print("\n" + "="*60)
    print("Training completed successfully!")
    print("="*60)


if __name__ == '__main__':
    main()
