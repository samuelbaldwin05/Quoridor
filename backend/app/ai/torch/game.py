# Vendored from QuoridorAI/quoridor/game.py. Independent of backend.app.engine
# — exists only to feed observations/legal masks to the trained model.

from collections import deque

import numpy as np

from app.ai.torch.config import BFS_NORM_FACTOR, BOARD_SIZE, FENCE_GRID, INITIAL_WALLS_PER_PLAYER


class QuoridorState:
    """
    Core game state. Tracks player positions, fences on the board,
    remaining fence counts, and whose turn it is.
    """

    def __init__(self):
        self.reset()

    def reset(self):
        """Initialize or reinitialize to the starting position."""
        # Player 0: starts bottom center (row 8), goal is top (row 0)
        # Player 1: starts top center (row 0), goal is bottom (row 8)
        self.pos = np.array([[8, 4], [0, 4]], dtype=np.int8)
        self.goals = np.array([0, 8], dtype=np.int8)
        self.walls_left = np.array(
            [INITIAL_WALLS_PER_PLAYER, INITIAL_WALLS_PER_PLAYER], dtype=np.int8
        )
        self.h_walls = np.zeros((FENCE_GRID, FENCE_GRID), dtype=np.bool_)
        self.v_walls = np.zeros((FENCE_GRID, FENCE_GRID), dtype=np.bool_)
        self.turn = 0
        self.done = False
        self.winner = -1

    def clone(self):
        s = QuoridorState.__new__(QuoridorState)
        s.pos = self.pos.copy()
        s.goals = self.goals
        s.walls_left = self.walls_left.copy()
        s.h_walls = self.h_walls.copy()
        s.v_walls = self.v_walls.copy()
        s.turn = self.turn
        s.done = self.done
        s.winner = self.winner
        return s

    def switch_turn(self):
        self.turn = 1 - self.turn

    def check_win(self):
        if self.pos[self.turn, 0] == self.goals[self.turn]:
            self.done = True
            self.winner = self.turn
            return True
        return False

    DIRECTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def get_valid_moves(self):
        row, col = int(self.pos[self.turn, 0]), int(self.pos[self.turn, 1])
        opp_r, opp_c = int(self.pos[self.turn ^ 1, 0]), int(self.pos[self.turn ^ 1, 1])
        moves = []
        for dr, dc in self.DIRECTIONS:
            nr, nc = row + dr, col + dc
            if not self._in_bounds(nr, nc):
                continue
            if self._blocked(row, col, nr, nc):
                continue
            if nr != opp_r or nc != opp_c:
                moves.append((nr, nc))
                continue
            jr, jc = nr + dr, nc + dc
            if self._in_bounds(jr, jc) and not self._blocked(nr, nc, jr, jc):
                moves.append((jr, jc))
                continue
            for ddr, ddc in self.DIRECTIONS:
                if (ddr, ddc) == (dr, dc) or (ddr, ddc) == (-dr, -dc):
                    continue
                diag_r, diag_c = nr + ddr, nc + ddc
                if (
                    self._in_bounds(diag_r, diag_c)
                    and not self._blocked(nr, nc, diag_r, diag_c)
                    and (diag_r != row or diag_c != col)
                ):
                    moves.append((diag_r, diag_c))
        return moves

    def move_to(self, row, col):
        if (row, col) not in self.get_valid_moves():
            raise ValueError(f"illegal move to ({row}, {col})")
        self.pos[self.turn] = [row, col]
        if self.check_win():
            return True
        self.switch_turn()
        return False

    def place_fence(self, row, col, orientation):
        if not self._fence_ok(row, col, orientation):
            raise ValueError(f"illegal fence: ({row}, {col}, {orientation})")
        grid = self.h_walls if orientation == "h" else self.v_walls
        grid[row, col] = True
        self.walls_left[self.turn] -= 1
        self.switch_turn()

    def _fence_ok(self, row, col, orientation):
        if self.walls_left[self.turn] <= 0:
            return False
        if not (0 <= row < FENCE_GRID and 0 <= col < FENCE_GRID):
            return False
        grid = self.h_walls if orientation == "h" else self.v_walls
        if grid[row, col]:
            return False
        if orientation == "h":
            if col > 0 and self.h_walls[row, col - 1]:
                return False
            if col < FENCE_GRID - 1 and self.h_walls[row, col + 1]:
                return False
        else:
            if row > 0 and self.v_walls[row - 1, col]:
                return False
            if row < FENCE_GRID - 1 and self.v_walls[row + 1, col]:
                return False
        other = self.v_walls if orientation == "h" else self.h_walls
        if other[row, col]:
            return False
        grid[row, col] = True
        paths_ok = self._has_path(0) and self._has_path(1)
        grid[row, col] = False
        return paths_ok

    def shortest_path(self, player):
        start = (int(self.pos[player, 0]), int(self.pos[player, 1]))
        goal = int(self.goals[player])
        if start[0] == goal:
            return 0
        visited = set()
        visited.add(start)
        queue = deque([(start[0], start[1], 0)])
        while queue:
            cr, cc, dist = queue.popleft()
            for dr, dc in self.DIRECTIONS:
                nr, nc = cr + dr, cc + dc
                if (
                    self._in_bounds(nr, nc)
                    and (nr, nc) not in visited
                    and not self._blocked(cr, cc, nr, nc)
                ):
                    if nr == goal:
                        return dist + 1
                    visited.add((nr, nc))
                    queue.append((nr, nc, dist + 1))
        return float("inf")

    def bfs_distance_map(self, player: int) -> np.ndarray:
        goal_row = int(self.goals[player])
        dist = np.full((BOARD_SIZE, BOARD_SIZE), BFS_NORM_FACTOR, dtype=np.float32)
        queue: deque = deque()
        for c in range(BOARD_SIZE):
            dist[goal_row, c] = 0.0
            queue.append((goal_row, c))
        while queue:
            cr, cc = queue.popleft()
            for dr, dc in self.DIRECTIONS:
                nr, nc = cr + dr, cc + dc
                if not self._in_bounds(nr, nc):
                    continue
                if self._blocked(nr, nc, cr, cc):
                    continue
                new_dist = dist[cr, cc] + 1.0
                if new_dist < dist[nr, nc]:
                    dist[nr, nc] = new_dist
                    queue.append((nr, nc))
        return dist / BFS_NORM_FACTOR

    def _has_path(self, player):
        return self.shortest_path(player) < float("inf")

    def fences_count(self):
        return int(self.h_walls.sum() + self.v_walls.sum())

    def _in_bounds(self, r, c):
        return 0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE

    def _blocked(self, row1, col1, row2, col2):
        if row2 > row1:
            return (col1 > 0 and self.h_walls[row1, col1 - 1]) or (
                col1 < FENCE_GRID and self.h_walls[row1, col1]
            )
        if row2 < row1:
            return self._blocked(row2, col2, row1, col1)
        if col2 > col1:
            return (row1 > 0 and self.v_walls[row1 - 1, col1]) or (
                row1 < FENCE_GRID and self.v_walls[row1, col1]
            )
        return self._blocked(row2, col2, row1, col1)

    def get_observation(self, use_bfs: bool = False) -> tuple[np.ndarray, np.ndarray]:
        current = self.turn
        opponent = 1 - current
        flip = current == 1

        n_channels = 6 if use_bfs else 4
        spatial = np.zeros((n_channels, 9, 9), dtype=np.float32)

        cur_r, cur_c = int(self.pos[current, 0]), int(self.pos[current, 1])
        opp_r, opp_c = int(self.pos[opponent, 0]), int(self.pos[opponent, 1])
        if flip:
            cur_r = 8 - cur_r
            opp_r = 8 - opp_r

        spatial[0, cur_r, cur_c] = 1.0
        spatial[1, opp_r, opp_c] = 1.0

        h = self.h_walls.astype(np.float32)
        v = self.v_walls.astype(np.float32)
        if flip:
            h = np.flipud(h)
            v = np.flipud(v)
        spatial[2, :8, :8] = h
        spatial[3, :8, :8] = v

        if use_bfs:
            cur_dist = self.bfs_distance_map(current)
            opp_dist = self.bfs_distance_map(opponent)
            if flip:
                cur_dist = np.flipud(cur_dist)
                opp_dist = np.flipud(opp_dist)
            spatial[4] = cur_dist
            spatial[5] = opp_dist

        scalars = np.array(
            [
                self.walls_left[current] / INITIAL_WALLS_PER_PLAYER,
                self.walls_left[opponent] / INITIAL_WALLS_PER_PLAYER,
            ],
            dtype=np.float32,
        )
        return spatial, scalars

    def get_legal_mask(self) -> np.ndarray:
        from app.ai.torch.action_encoding import (
            DELTA_TO_INDEX,
            H_WALL_OFFSET,
            NUM_ACTIONS,
            V_WALL_OFFSET,
        )
        from app.ai.torch.action_encoding import FENCE_GRID as _FG

        mask = np.zeros(NUM_ACTIONS, dtype=bool)

        cur_r, cur_c = int(self.pos[self.turn, 0]), int(self.pos[self.turn, 1])
        for dest_r, dest_c in self.get_valid_moves():
            dr, dc = dest_r - cur_r, dest_c - cur_c
            normalized = (int(np.sign(dr)), int(np.sign(dc)))
            if normalized in DELTA_TO_INDEX:
                mask[DELTA_TO_INDEX[normalized]] = True

        for r in range(_FG):
            for c in range(_FG):
                if self._fence_ok(r, c, "h"):
                    mask[H_WALL_OFFSET + r * _FG + c] = True
                if self._fence_ok(r, c, "v"):
                    mask[V_WALL_OFFSET + r * _FG + c] = True

        return mask

    def __repr__(self):
        p = "P0" if self.turn == 0 else "P1"
        return f"QuoridorState(turn={p}, walls={list(self.walls_left)}, done={self.done})"
