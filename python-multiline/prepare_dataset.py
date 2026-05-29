"""
Dataset Preparation Utility for SVM Patch Classifier

This script helps you prepare a dataset for training the SVM patch classifier.
It can extract patches from full images and organize them into positive/negative folders.

Usage:
    # Extract patches from images
    python prepare_dataset.py --mode extract --input_dir ./raw_images --output_dir ./data --patch_size 256
    
    # Manually organize patches (interactive mode)
    python prepare_dataset.py --mode organize --input_dir ./patches --output_dir ./data
"""

import os
import argparse
import numpy as np
from PIL import Image
from pathlib import Path
from tqdm import tqdm
import shutil
import json


def patchify_image(img, patch_size):
    """
    Divide an image into patches.
    
    Args:
        img: PIL Image or numpy array
        patch_size: Size of each patch
        
    Returns:
        List of patches and their positions
    """
    if isinstance(img, Image.Image):
        img = np.array(img)
    
    h, w = img.shape[:2]
    pad_h = (patch_size - h % patch_size) % patch_size
    pad_w = (patch_size - w % patch_size) % patch_size
    
    if len(img.shape) == 3:
        img_padded = np.pad(img, ((0, pad_h), (0, pad_w), (0, 0)), mode='reflect')
    else:
        img_padded = np.pad(img, ((0, pad_h), (0, pad_w)), mode='reflect')
    
    H, W = img_padded.shape[:2]
    patches = []
    positions = []
    
    for i in range(0, H, patch_size):
        for j in range(0, W, patch_size):
            patch = img_padded[i:i+patch_size, j:j+patch_size]
            patches.append(patch)
            positions.append((i, j))
    
    return patches, positions


def extract_patches_from_images(input_dir, output_dir, patch_size=256, image_extensions=None):
    """
    Extract patches from all images in input directory.
    
    Args:
        input_dir: Directory containing source images
        output_dir: Directory to save extracted patches
        patch_size: Size of patches to extract
        image_extensions: List of valid image extensions
    """
    if image_extensions is None:
        image_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff']
    
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    patches_dir = output_dir / 'extracted_patches'
    patches_dir.mkdir(parents=True, exist_ok=True)
    
    image_files = []
    for ext in image_extensions:
        image_files.extend(list(input_dir.glob(f'*{ext}')))
        image_files.extend(list(input_dir.glob(f'*{ext.upper()}')))
    
    if not image_files:
        print(f"No images found in {input_dir}")
        return
    
    print(f"Found {len(image_files)} images")
    print(f"Extracting patches of size {patch_size}x{patch_size}...")
    
    metadata = []
    patch_count = 0
    
    for img_path in tqdm(image_files):
        try:
            img = Image.open(img_path).convert('RGB')
            patches, positions = patchify_image(img, patch_size)
            
            for idx, (patch, pos) in enumerate(zip(patches, positions)):
                patch_filename = f"{img_path.stem}_patch_{idx:04d}.png"
                patch_path = patches_dir / patch_filename
                
                patch_img = Image.fromarray(patch.astype(np.uint8))
                patch_img.save(patch_path)
                
                metadata.append({
                    'patch_file': patch_filename,
                    'source_image': img_path.name,
                    'position': pos,
                    'patch_index': idx
                })
                
                patch_count += 1
        
        except Exception as e:
            print(f"Error processing {img_path}: {e}")
    
    # Save metadata
    metadata_path = output_dir / 'patches_metadata.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\nExtracted {patch_count} patches to {patches_dir}")
    print(f"Metadata saved to {metadata_path}")
    print(f"\nNext steps:")
    print(f"1. Review patches in {patches_dir}")
    print(f"2. Manually organize them into:")
    print(f"   - {output_dir}/positive/ (patches with graph content)")
    print(f"   - {output_dir}/negative/ (patches without graph content)")
    print(f"3. Run: python train_svm.py --data_dir {output_dir}")


def organize_patches_interactive(input_dir, output_dir):
    """
    Interactive tool to organize patches into positive/negative folders.
    
    Args:
        input_dir: Directory containing patches to organize
        output_dir: Directory to save organized patches
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    
    positive_dir = output_dir / 'positive'
    negative_dir = output_dir / 'negative'
    positive_dir.mkdir(parents=True, exist_ok=True)
    negative_dir.mkdir(parents=True, exist_ok=True)
    
    patch_files = list(input_dir.glob('*.png')) + list(input_dir.glob('*.jpg'))
    
    if not patch_files:
        print(f"No patches found in {input_dir}")
        return
    
    print(f"Found {len(patch_files)} patches to organize")
    print("\nInstructions:")
    print("  - Press 'p' for positive (contains graph)")
    print("  - Press 'n' for negative (no graph)")
    print("  - Press 's' to skip")
    print("  - Press 'q' to quit")
    print("\nNote: This is a command-line interface. For better experience,")
    print("      manually organize files or use an image viewer.\n")
    
    organized_count = {'positive': 0, 'negative': 0, 'skipped': 0}
    
    for patch_path in patch_files:
        print(f"\nPatch: {patch_path.name}")
        print(f"Progress: {organized_count['positive'] + organized_count['negative']}/{len(patch_files)}")
        
        choice = input("Classify as (p/n/s/q): ").lower().strip()
        
        if choice == 'q':
            print("Quitting...")
            break
        elif choice == 'p':
            dest = positive_dir / patch_path.name
            shutil.copy(patch_path, dest)
            organized_count['positive'] += 1
            print(f"  → Copied to positive/")
        elif choice == 'n':
            dest = negative_dir / patch_path.name
            shutil.copy(patch_path, dest)
            organized_count['negative'] += 1
            print(f"  → Copied to negative/")
        elif choice == 's':
            organized_count['skipped'] += 1
            print(f"  → Skipped")
        else:
            print(f"  → Invalid choice, skipping")
            organized_count['skipped'] += 1
    
    print(f"\n{'='*60}")
    print("Organization Summary:")
    print(f"  Positive: {organized_count['positive']}")
    print(f"  Negative: {organized_count['negative']}")
    print(f"  Skipped: {organized_count['skipped']}")
    print(f"{'='*60}")


def auto_organize_by_content(input_dir, output_dir, threshold=0.1):
    """
    Automatically organize patches based on content (white pixel ratio).
    This is a simple heuristic - manual review is recommended.
    
    Args:
        input_dir: Directory containing patches
        output_dir: Directory to save organized patches
        threshold: Minimum ratio of white pixels to classify as positive
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    
    positive_dir = output_dir / 'positive'
    negative_dir = output_dir / 'negative'
    uncertain_dir = output_dir / 'uncertain'
    
    positive_dir.mkdir(parents=True, exist_ok=True)
    negative_dir.mkdir(parents=True, exist_ok=True)
    uncertain_dir.mkdir(parents=True, exist_ok=True)
    
    patch_files = list(input_dir.glob('*.png')) + list(input_dir.glob('*.jpg'))
    
    if not patch_files:
        print(f"No patches found in {input_dir}")
        return
    
    print(f"Auto-organizing {len(patch_files)} patches...")
    print(f"Using white pixel threshold: {threshold}")
    
    counts = {'positive': 0, 'negative': 0, 'uncertain': 0}
    
    for patch_path in tqdm(patch_files):
        try:
            img = Image.open(patch_path).convert('L')
            img_array = np.array(img)
            
            white_ratio = np.sum(img_array > 200) / img_array.size
            
            if white_ratio > threshold:
                dest = positive_dir / patch_path.name
                counts['positive'] += 1
            elif white_ratio < threshold * 0.3:
                dest = negative_dir / patch_path.name
                counts['negative'] += 1
            else:
                dest = uncertain_dir / patch_path.name
                counts['uncertain'] += 1
            
            shutil.copy(patch_path, dest)
        
        except Exception as e:
            print(f"Error processing {patch_path}: {e}")
    
    print(f"\nAuto-organization complete:")
    print(f"  Positive: {counts['positive']}")
    print(f"  Negative: {counts['negative']}")
    print(f"  Uncertain: {counts['uncertain']} (review these manually)")
    print(f"\nPlease review the 'uncertain' folder and move files to positive/negative as needed.")


def main():
    parser = argparse.ArgumentParser(description='Prepare dataset for SVM training')
    parser.add_argument('--mode', type=str, required=True,
                       choices=['extract', 'organize', 'auto_organize'],
                       help='Mode: extract patches, organize interactively, or auto-organize')
    parser.add_argument('--input_dir', type=str, required=True,
                       help='Input directory (images for extract mode, patches for organize mode)')
    parser.add_argument('--output_dir', type=str, required=True,
                       help='Output directory for organized dataset')
    parser.add_argument('--patch_size', type=int, default=256,
                       help='Patch size for extraction (default: 256)')
    parser.add_argument('--threshold', type=float, default=0.1,
                       help='White pixel threshold for auto-organize mode (default: 0.1)')
    
    args = parser.parse_args()
    
    print("="*60)
    print("Dataset Preparation Utility")
    print("="*60)
    
    if args.mode == 'extract':
        extract_patches_from_images(args.input_dir, args.output_dir, args.patch_size)
    elif args.mode == 'organize':
        organize_patches_interactive(args.input_dir, args.output_dir)
    elif args.mode == 'auto_organize':
        auto_organize_by_content(args.input_dir, args.output_dir, args.threshold)
    
    print("\nDone!")


if __name__ == '__main__':
    main()
