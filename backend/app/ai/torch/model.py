# Vendored from QuoridorAI/agents/ppo_model_bfs_resnet.py. Architecture must
# stay in lockstep with the trained best_mixed-v2 checkpoint.

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical

from app.ai.torch.config import (
    BOARD_SIZE,
    CONV2_FILTERS,
    FC_HIDDEN_SIZE,
    NUM_ACTIONS,
    NUM_CHANNELS_BFS,
    NUM_RESIDUAL_BLOCKS,
    NUM_SCALARS,
)

_CONV_OUT_SIZE: int = CONV2_FILTERS * BOARD_SIZE * BOARD_SIZE  # 64 * 9 * 9 = 5184
_FC_IN_SIZE: int = _CONV_OUT_SIZE + NUM_SCALARS  # 5184 + 2 = 5186
_ILLEGAL_LOGIT: float = -1e9


class ResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.ln1 = nn.LayerNorm([channels, BOARD_SIZE, BOARD_SIZE])
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.ln2 = nn.LayerNorm([channels, BOARD_SIZE, BOARD_SIZE])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.ln1(self.conv1(x)))
        out = self.ln2(self.conv2(out))
        return F.relu(out + residual)


class PPOModelBFSResNet(nn.Module):
    """Shared-backbone Actor-Critic with 6-channel BFS input + ResNet encoder."""

    def __init__(self) -> None:
        super().__init__()

        self.proj = nn.Sequential(
            nn.Conv2d(NUM_CHANNELS_BFS, CONV2_FILTERS, kernel_size=3, padding=1, bias=False),
            nn.LayerNorm([CONV2_FILTERS, BOARD_SIZE, BOARD_SIZE]),
            nn.ReLU(),
        )

        self.res_blocks = nn.Sequential(
            *[ResidualBlock(CONV2_FILTERS) for _ in range(NUM_RESIDUAL_BLOCKS)]
        )

        self.flatten = nn.Flatten()

        self.actor_head = nn.Sequential(
            nn.Linear(_FC_IN_SIZE, FC_HIDDEN_SIZE),
            nn.ReLU(),
            nn.Linear(FC_HIDDEN_SIZE, NUM_ACTIONS),
        )

        self.value_head = nn.Sequential(
            nn.Linear(_FC_IN_SIZE, FC_HIDDEN_SIZE),
            nn.ReLU(),
            nn.Linear(FC_HIDDEN_SIZE, 1),
        )

        self.aux_head = nn.Linear(_FC_IN_SIZE, 2)

    def _encode(self, spatial: torch.Tensor, scalars: torch.Tensor) -> torch.Tensor:
        x = self.proj(spatial)
        x = self.res_blocks(x)
        x = self.flatten(x)
        return torch.cat([x, scalars], dim=1)

    def forward(
        self,
        spatial: torch.Tensor,
        scalars: torch.Tensor,
        legal_mask: torch.Tensor,
    ) -> tuple[Categorical, torch.Tensor, torch.Tensor]:
        fused = self._encode(spatial, scalars)
        raw_logits = self.actor_head(fused)
        masked_logits = raw_logits.masked_fill(~legal_mask, _ILLEGAL_LOGIT)
        dist = Categorical(logits=masked_logits)
        value = self.value_head(fused)
        aux_pred = self.aux_head(fused)
        return dist, value, aux_pred

    def get_value(self, spatial: torch.Tensor, scalars: torch.Tensor) -> torch.Tensor:
        fused = self._encode(spatial, scalars)
        return self.value_head(fused)
