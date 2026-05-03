# Vendored from QuoridorAI/agents/ppo_bot.py, trimmed to bfs_resnet only.

import numpy as np
import torch

from app.ai.torch.action_encoding import (
    FENCE_GRID,
    H_WALL_OFFSET,
    V_WALL_OFFSET,
    index_to_action,
)
from app.ai.torch.model import PPOModelBFSResNet

# Maps flipped-space move action index → actual-space move action index.
# np.flipud negates dr but leaves dc unchanged, so:
#   up(0) ↔ down(1), left(2)/right(3) stay, NW(4)↔SW(6), NE(5)↔SE(7).
_MOVE_FLIP = [1, 0, 2, 3, 6, 7, 4, 5]


def _flip_legal_mask(mask: np.ndarray) -> np.ndarray:
    """Remap a legal mask from actual board coords to flipped (P1) coords."""
    flipped = np.zeros_like(mask)
    for flipped_idx, actual_idx in enumerate(_MOVE_FLIP):
        flipped[flipped_idx] = mask[actual_idx]
    for r in range(FENCE_GRID):
        actual_r = FENCE_GRID - 1 - r
        for c in range(FENCE_GRID):
            flipped[H_WALL_OFFSET + r * FENCE_GRID + c] = mask[
                H_WALL_OFFSET + actual_r * FENCE_GRID + c
            ]
            flipped[V_WALL_OFFSET + r * FENCE_GRID + c] = mask[
                V_WALL_OFFSET + actual_r * FENCE_GRID + c
            ]
    return flipped


class PPOBot:
    """Stateless inference wrapper around a trained PPO actor."""

    def __init__(
        self,
        checkpoint_path: str,
        device: str | torch.device = "cpu",
        greedy: bool = True,
    ) -> None:
        self.device = torch.device(device)
        self.greedy = greedy
        self.use_bfs = True  # bfs_resnet always uses 6-channel observations
        self.model = PPOModelBFSResNet().to(self.device)

        ckpt = torch.load(checkpoint_path, map_location=self.device, weights_only=True)
        state_dict = ckpt.get("model", ckpt.get("model_state_dict", ckpt))
        self.model.load_state_dict(state_dict)
        self.model.eval()

    def reset(self) -> None:
        """No per-episode state — PPO policy is stateless."""

    def choose_action(self, game) -> tuple:
        """Select an action for the current player.

        get_observation() flips the board for P1; the legal mask must be
        flipped to match before inference, then the decoded action must be
        un-flipped back to actual board coordinates.
        """
        flip = game.turn == 1

        spatial, scalars = game.get_observation(use_bfs=self.use_bfs)
        legal_mask = game.get_legal_mask()
        if flip:
            legal_mask = _flip_legal_mask(legal_mask)

        spatial_t = torch.tensor(spatial).unsqueeze(0).to(self.device)
        scalars_t = torch.tensor(scalars).unsqueeze(0).to(self.device)
        mask_t = torch.tensor(legal_mask).unsqueeze(0).to(self.device)

        with torch.no_grad():
            dist, *_ = self.model(spatial_t, scalars_t, mask_t)
            if self.greedy:
                action_idx = int(dist.probs.argmax(dim=-1).item())
            else:
                action_idx = int(dist.sample().item())

        return self._decode(action_idx, game, flip)

    def _decode(self, idx: int, game, flip: bool = False) -> tuple:
        action = index_to_action(idx)

        if action[0] == "fence":
            _, r, c, ori = action
            if flip:
                r = FENCE_GRID - 1 - r
            return ("fence", r, c, ori)

        dr, dc = action[1], action[2]
        if flip:
            dr = -dr
        cur_r = int(game.pos[game.turn, 0])
        cur_c = int(game.pos[game.turn, 1])

        for dest_r, dest_c in game.get_valid_moves():
            if np.sign(dest_r - cur_r) == np.sign(dr) and np.sign(dest_c - cur_c) == np.sign(dc):
                return ("move", dest_r, dest_c)

        raise ValueError(
            f"PPOBot: no valid destination for direction ({dr}, {dc}) "
            f"from ({cur_r}, {cur_c}). Action index {idx} should have been masked illegal."
        )
