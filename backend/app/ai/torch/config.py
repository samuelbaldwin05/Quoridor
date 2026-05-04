# Inference-only constants. Keep in lockstep with QuoridorAI/config.py.

# Game / action space
BOARD_SIZE = 9
FENCE_GRID = BOARD_SIZE - 1
INITIAL_WALLS_PER_PLAYER = 10
NUM_ACTIONS = 137
NUM_CHANNELS_BFS = 6
NUM_SCALARS = 2
BFS_NORM_FACTOR = BOARD_SIZE * 2  # 18

# Network architecture (must match the trained checkpoint)
CONV2_FILTERS = 64
FC_HIDDEN_SIZE = 256
NUM_RESIDUAL_BLOCKS = 2
