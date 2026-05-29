"""
Configuration file for segmentation training
Easy to modify parameters for experimentation
"""

class Config:
    # Model parameters
    MODEL_TYPE = "UNet"
    N_CHANNELS = 3
    N_CLASSES = 1
    INPUT_SIZE = (256, 256)
    
    # Training parameters
    BATCH_SIZE = 16
    NUM_EPOCHS = 50
    LEARNING_RATE = 0.1
    WEIGHT_DECAY = 1e-4
    
    # Loss function options
    LOSS_TYPE = "combined"  # Options: "dice", "bce", "combined", "focal"
    DICE_WEIGHT = 0.7
    BCE_WEIGHT = 0.3
    
    # Focal loss parameters (if using focal loss)
    FOCAL_ALPHA = 1.0
    FOCAL_GAMMA = 2.0
    
    # Learning rate scheduler
    USE_SCHEDULER = True
    SCHEDULER_FACTOR = 0.5
    SCHEDULER_PATIENCE = 5
    
    # Early stopping
    EARLY_STOPPING_PATIENCE = 10
    
    # Data augmentation
    USE_AUGMENTATION = True
    FLIP_PROBABILITY = 0.5
    ROTATION_DEGREES = 10
    COLOR_JITTER = {
        'brightness': 0.2,
        'contrast': 0.2,
        'saturation': 0.2,
        'hue': 0.1
    }
    
    # Data paths
    TRAIN_IMAGE_DIR = 'patch_dataset_splits/train/images'
    TRAIN_MASK_DIR = 'patch_dataset_splits/train/masks'
    VAL_IMAGE_DIR = 'patch_dataset_splits/val/images'
    VAL_MASK_DIR = 'patch_dataset_splits/val/masks'
    
    # Model saving
    MODEL_SAVE_PATH = 'best_model.pth'
    
    # Visualization
    SAVE_PLOTS = True
    PLOT_DPI = 300

# Predefined configurations for different scenarios
class Configs:
    @staticmethod
    def baseline():
        """Baseline configuration - original settings"""
        config = Config()
        config.LEARNING_RATE = 0.001
        config.LOSS_TYPE = "dice"
        config.USE_AUGMENTATION = False
        config.USE_SCHEDULER = False
        return config
    
    @staticmethod
    def enhanced():
        """Enhanced configuration - recommended improvements"""
        config = Config()
        config.LEARNING_RATE = 0.002
        config.LOSS_TYPE = "combined"
        config.USE_AUGMENTATION = True
        config.USE_SCHEDULER = True
        return config
    
    @staticmethod
    def aggressive():
        """Aggressive configuration - for stubborn plateaus"""
        config = Config()
        config.LEARNING_RATE = 0.005
        config.LOSS_TYPE = "focal"
        config.USE_AUGMENTATION = True
        config.USE_SCHEDULER = True
        config.SCHEDULER_PATIENCE = 3
        config.EARLY_STOPPING_PATIENCE = 15
        return config
    
    @staticmethod
    def conservative():
        """Conservative configuration - for unstable training"""
        config = Config()
        config.LEARNING_RATE = 0.0005
        config.LOSS_TYPE = "combined"
        config.DICE_WEIGHT = 0.5
        config.BCE_WEIGHT = 0.5
        config.USE_AUGMENTATION = True
        config.USE_SCHEDULER = True
        config.SCHEDULER_PATIENCE = 8
        return config 
