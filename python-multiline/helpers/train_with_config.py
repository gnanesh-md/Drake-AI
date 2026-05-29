import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import numpy as np
from PIL import Image
import os
from tqdm import tqdm
import matplotlib.pyplot as plt
import torch.nn.functional as F
from torch.optim.lr_scheduler import ReduceLROnPlateau
from helpers.config import Config, Configs

class SegmentationDataset(Dataset):
    def __init__(self, image_dir, mask_dir, image_transform=None, mask_transform=None, is_training=True):
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.image_transform = image_transform
        self.mask_transform = mask_transform
        self.is_training = is_training
        
        self.images = [f for f in os.listdir(image_dir) 
                      if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    def __len__(self):
        return len(self.images)
    
    def __getitem__(self, idx):
        img_name = self.images[idx]
        img_path = os.path.join(self.image_dir, img_name)
        mask_path = os.path.join(self.mask_dir, img_name)
        
        image = Image.open(img_path).convert('RGB')
        mask = Image.open(mask_path).convert('L')  # Convert to grayscale
        
        if self.image_transform:
            image = self.image_transform(image)
        if self.mask_transform:
            mask = self.mask_transform(mask)
        
        return image, mask

class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.double_conv(x)

class UNet(nn.Module):
    def __init__(self, n_channels=3, n_classes=1):
        super(UNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes

        self.inc = DoubleConv(n_channels, 64)
        self.down1 = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(64, 128)
        )
        self.down2 = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(128, 256)
        )
        self.down3 = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(256, 512)
        )
        self.down4 = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(512, 1024)
        )

        self.up1 = nn.ConvTranspose2d(1024, 512, kernel_size=2, stride=2)
        self.conv1 = DoubleConv(1024, 512)
        self.up2 = nn.ConvTranspose2d(512, 256, kernel_size=2, stride=2)
        self.conv2 = DoubleConv(512, 256)
        self.up3 = nn.ConvTranspose2d(256, 128, kernel_size=2, stride=2)
        self.conv3 = DoubleConv(256, 128)
        self.up4 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.conv4 = DoubleConv(128, 64)
        
        self.outc = nn.Conv2d(64, n_classes, kernel_size=1)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x = self.up1(x5)
        x = torch.cat([x, x4], dim=1)
        x = self.conv1(x)
        
        x = self.up2(x)
        x = torch.cat([x, x3], dim=1)
        x = self.conv2(x)
        
        x = self.up3(x)
        x = torch.cat([x, x2], dim=1)
        x = self.conv3(x)
        
        x = self.up4(x)
        x = torch.cat([x, x1], dim=1)
        x = self.conv4(x)
        
        return self.outc(x)  # Remove sigmoid, will be applied in loss function

class DiceLoss(nn.Module):
    def __init__(self, smooth=1.0):
        super(DiceLoss, self).__init__()
        self.smooth = smooth
        
    def forward(self, inputs, targets):
        inputs = torch.sigmoid(inputs)
        inputs = inputs.view(-1)
        targets = targets.view(-1)
        
        intersection = (inputs * targets).sum()
        dice = (2. * intersection + self.smooth) / (inputs.sum() + targets.sum() + self.smooth)
        
        return 1 - dice

class CombinedLoss(nn.Module):
    def __init__(self, dice_weight=0.5, bce_weight=0.5, smooth=1.0):
        super(CombinedLoss, self).__init__()
        self.dice_weight = dice_weight
        self.bce_weight = bce_weight
        self.smooth = smooth
        
    def dice_loss(self, inputs, targets):
        inputs = torch.sigmoid(inputs)
        inputs = inputs.view(-1)
        targets = targets.view(-1)
        
        intersection = (inputs * targets).sum()
        dice = (2. * intersection + self.smooth) / (inputs.sum() + targets.sum() + self.smooth)
        
        return 1 - dice
    
    def forward(self, inputs, targets):
        dice = self.dice_loss(inputs, targets)
        bce = F.binary_cross_entropy_with_logits(inputs, targets)
        
        return self.dice_weight * dice + self.bce_weight * bce

class FocalLoss(nn.Module):
    def __init__(self, alpha=1, gamma=2, smooth=1.0):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.smooth = smooth
        
    def forward(self, inputs, targets):
        inputs = torch.sigmoid(inputs)
        inputs = inputs.view(-1)
        targets = targets.view(-1)
        
        # Focal loss component
        bce_loss = F.binary_cross_entropy(inputs, targets, reduction='none')
        pt = torch.where(targets == 1, inputs, 1 - inputs)
        focal_loss = self.alpha * (1 - pt) ** self.gamma * bce_loss
        focal_loss = focal_loss.mean()
        
        # Dice loss component
        intersection = (inputs * targets).sum()
        dice = (2. * intersection + self.smooth) / (inputs.sum() + targets.sum() + self.smooth)
        dice_loss = 1 - dice
        
        return focal_loss + dice_loss

def get_loss_function(config):
    """Get loss function based on configuration"""
    if config.LOSS_TYPE == "dice":
        return DiceLoss()
    elif config.LOSS_TYPE == "bce":
        return nn.BCEWithLogitsLoss()
    elif config.LOSS_TYPE == "combined":
        return CombinedLoss(dice_weight=config.DICE_WEIGHT, bce_weight=config.BCE_WEIGHT)
    elif config.LOSS_TYPE == "focal":
        return FocalLoss(alpha=config.FOCAL_ALPHA, gamma=config.FOCAL_GAMMA)
    else:
        raise ValueError(f"Unknown loss type: {config.LOSS_TYPE}")

def get_transforms(config, is_training=True):
    """Get transforms based on configuration"""
    # Image transforms
    image_transforms_list = [
        transforms.Resize(config.INPUT_SIZE),
    ]
    
    if is_training and config.USE_AUGMENTATION:
        image_transforms_list.extend([
            transforms.RandomHorizontalFlip(p=config.FLIP_PROBABILITY),
            transforms.RandomVerticalFlip(p=config.FLIP_PROBABILITY),
            transforms.RandomRotation(degrees=config.ROTATION_DEGREES),
            transforms.ColorJitter(**config.COLOR_JITTER),
        ])
    
    image_transforms_list.extend([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # Mask transforms (no normalization, no color jitter)
    mask_transforms_list = [
        transforms.Resize(config.INPUT_SIZE),
    ]
    
    if is_training and config.USE_AUGMENTATION:
        mask_transforms_list.extend([
            transforms.RandomHorizontalFlip(p=config.FLIP_PROBABILITY),
            transforms.RandomVerticalFlip(p=config.FLIP_PROBABILITY),
            transforms.RandomRotation(degrees=config.ROTATION_DEGREES),
        ])
    
    mask_transforms_list.extend([
        transforms.ToTensor(),
    ])
    
    return transforms.Compose(image_transforms_list), transforms.Compose(mask_transforms_list)

def calculate_metrics(outputs, targets, threshold=0.5):
    """Calculate Dice score and IoU"""
    outputs = torch.sigmoid(outputs)
    outputs = (outputs > threshold).float()
    targets = (targets > threshold).float()
    
    outputs = outputs.view(-1)
    targets = targets.view(-1)
    
    intersection = (outputs * targets).sum()
    union = outputs.sum() + targets.sum() - intersection
    
    dice = (2. * intersection) / (outputs.sum() + targets.sum() + 1e-8)
    iou = intersection / (union + 1e-8)
    
    return dice.item(), iou.item()

def train_model(model, train_loader, val_loader, criterion, optimizer, scheduler, config, device):
    train_losses = []
    val_losses = []
    train_dice_scores = []
    val_dice_scores = []
    train_ious = []
    val_ious = []
    
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(config.NUM_EPOCHS):
        # Training phase
        model.train()
        train_loss = 0.0
        train_dice = 0.0
        train_iou = 0.0
        train_bar = tqdm(train_loader, desc=f'Epoch {epoch+1}/{config.NUM_EPOCHS} [Train]')
        
        for images, masks in train_bar:
            images = images.to(device)
            masks = masks.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, masks)
            loss.backward()
            optimizer.step()
            
            # Calculate metrics
            dice, iou = calculate_metrics(outputs, masks)
            
            train_loss += loss.item()
            train_dice += dice
            train_iou += iou
            
            train_bar.set_postfix({
                'Loss': f'{loss.item():.4f}',
                'Dice': f'{dice:.4f}',
                'IoU': f'{iou:.4f}'
            })
        
        # Validation phase
        model.eval()
        val_loss = 0.0
        val_dice = 0.0
        val_iou = 0.0
        val_bar = tqdm(val_loader, desc=f'Epoch {epoch+1}/{config.NUM_EPOCHS} [Val]')
        
        with torch.no_grad():
            for images, masks in val_bar:
                images = images.to(device)
                masks = masks.to(device)
                
                outputs = model(images)
                loss = criterion(outputs, masks)
                
                # Calculate metrics
                dice, iou = calculate_metrics(outputs, masks)
                
                val_loss += loss.item()
                val_dice += dice
                val_iou += iou
                
                val_bar.set_postfix({
                    'Loss': f'{loss.item():.4f}',
                    'Dice': f'{dice:.4f}',
                    'IoU': f'{iou:.4f}'
                })
        
        # Calculate averages
        avg_train_loss = train_loss / len(train_loader)
        avg_val_loss = val_loss / len(val_loader)
        avg_train_dice = train_dice / len(train_loader)
        avg_val_dice = val_dice / len(val_loader)
        avg_train_iou = train_iou / len(train_loader)
        avg_val_iou = val_iou / len(val_loader)
        
        # Store metrics
        train_losses.append(avg_train_loss)
        val_losses.append(avg_val_loss)
        train_dice_scores.append(avg_train_dice)
        val_dice_scores.append(avg_val_dice)
        train_ious.append(avg_train_iou)
        val_ious.append(avg_val_iou)
        
        # Learning rate scheduling
        if scheduler:
            scheduler.step(avg_val_loss)
        
        print(f'Epoch {epoch+1}/{config.NUM_EPOCHS}:')
        print(f'Training - Loss: {avg_train_loss:.4f}, Dice: {avg_train_dice:.4f}, IoU: {avg_train_iou:.4f}')
        print(f'Validation - Loss: {avg_val_loss:.4f}, Dice: {avg_val_dice:.4f}, IoU: {avg_val_iou:.4f}')
        print(f'Learning Rate: {optimizer.param_groups[0]["lr"]:.6f}')
        print('-' * 50)
        
        # Save best model
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            torch.save(model.state_dict(), config.MODEL_SAVE_PATH)
            print(f'Best model saved at epoch {epoch+1} (Val Loss: {avg_val_loss:.4f})')
            patience_counter = 0
        else:
            patience_counter += 1
        
        # Early stopping
        if patience_counter >= config.EARLY_STOPPING_PATIENCE:
            print(f'Early stopping triggered after {epoch+1} epochs')
            break
    
    return train_losses, val_losses, train_dice_scores, val_dice_scores, train_ious, val_ious

def main():
    # Choose configuration
    print("Available configurations:")
    print("1. Baseline (original settings)")
    print("2. Enhanced (recommended)")
    print("3. Aggressive (for stubborn plateaus)")
    print("4. Conservative (for unstable training)")
    
    choice = input("Enter configuration choice (1-4): ").strip()
    
    if choice == "1":
        config = Configs.baseline()
        print("Using baseline configuration")
    elif choice == "2":
        config = Configs.enhanced()
        print("Using enhanced configuration")
    elif choice == "3":
        config = Configs.aggressive()
        print("Using aggressive configuration")
    elif choice == "4":
        config = Configs.conservative()
        print("Using conservative configuration")
    else:
        config = Configs.enhanced()
        print("Invalid choice, using enhanced configuration")
    
    # Configuration
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Using device: {device}')
    
    # Create datasets
    train_image_transform, train_mask_transform = get_transforms(config, is_training=True)
    val_image_transform, val_mask_transform = get_transforms(config, is_training=False)
    
    train_dataset = SegmentationDataset(
        config.TRAIN_IMAGE_DIR,
        config.TRAIN_MASK_DIR,
        image_transform=train_image_transform,
        mask_transform=train_mask_transform,
        is_training=True
    )
    
    val_dataset = SegmentationDataset(
        config.VAL_IMAGE_DIR,
        config.VAL_MASK_DIR,
        image_transform=val_image_transform,
        mask_transform=val_mask_transform,
        is_training=False
    )
    
    # Create data loaders
    train_loader = DataLoader(train_dataset, batch_size=config.BATCH_SIZE, shuffle=True, num_workers=4)
    val_loader = DataLoader(val_dataset, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=4)
    
    # Initialize model
    model = UNet(n_channels=config.N_CHANNELS, n_classes=config.N_CLASSES).to(device)
    
    # Loss function and optimizer
    criterion = get_loss_function(config)
    optimizer = optim.AdamW(model.parameters(), lr=config.LEARNING_RATE, weight_decay=config.WEIGHT_DECAY)
    
    # Learning rate scheduler
    scheduler = None
    if config.USE_SCHEDULER:
        scheduler = ReduceLROnPlateau(
            optimizer, mode='min', factor=config.SCHEDULER_FACTOR, 
            patience=config.SCHEDULER_PATIENCE, verbose=True
        )
    
    # Training
    print(f"Starting training with {config.LOSS_TYPE} loss...")
    train_losses, val_losses, train_dice, val_dice, train_ious, val_ious = train_model(
        model, train_loader, val_loader, criterion, optimizer, scheduler,
        config, device
    )
    
    # Plot comprehensive training curves
    if config.SAVE_PLOTS:
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        
        # Loss curves
        axes[0, 0].plot(train_losses, label='Training Loss')
        axes[0, 0].plot(val_losses, label='Validation Loss')
        axes[0, 0].set_xlabel('Epoch')
        axes[0, 0].set_ylabel('Loss')
        axes[0, 0].set_title('Training and Validation Loss')
        axes[0, 0].legend()
        axes[0, 0].grid(True)
        
        # Dice score curves
        axes[0, 1].plot(train_dice, label='Training Dice')
        axes[0, 1].plot(val_dice, label='Validation Dice')
        axes[0, 1].set_xlabel('Epoch')
        axes[0, 1].set_ylabel('Dice Score')
        axes[0, 1].set_title('Training and Validation Dice Score')
        axes[0, 1].legend()
        axes[0, 1].grid(True)
        
        # IoU curves
        axes[1, 0].plot(train_ious, label='Training IoU')
        axes[1, 0].plot(val_ious, label='Validation IoU')
        axes[1, 0].set_xlabel('Epoch')
        axes[1, 0].set_ylabel('IoU Score')
        axes[1, 0].set_title('Training and Validation IoU Score')
        axes[1, 0].legend()
        axes[1, 0].grid(True)
        
        # Combined metrics
        axes[1, 1].plot(val_dice, label='Validation Dice', color='blue')
        axes[1, 1].plot(val_ious, label='Validation IoU', color='red')
        axes[1, 1].set_xlabel('Epoch')
        axes[1, 1].set_ylabel('Score')
        axes[1, 1].set_title('Validation Metrics Comparison')
        axes[1, 1].legend()
        axes[1, 1].grid(True)
        
        plt.tight_layout()
        plt.savefig(f'training_curves_{config.LOSS_TYPE}.png', dpi=config.PLOT_DPI, bbox_inches='tight')
        plt.show()
    
    # Print final results
    print(f"\nFinal Results:")
    print(f"Best Validation Loss: {min(val_losses):.4f}")
    print(f"Best Validation Dice: {max(val_dice):.4f}")
    print(f"Best Validation IoU: {max(val_ious):.4f}")

if __name__ == "__main__":
    main() 