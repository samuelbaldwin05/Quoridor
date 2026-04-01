import { z } from 'zod';

export const PositionSchema = z.object({
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
});

export const WallSchema = z.object({
  row: z.number().int().min(0).max(7),
  col: z.number().int().min(0).max(7),
  orientation: z.enum(['h', 'v']),
});

export const MoveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pawn'), to: PositionSchema }),
  z.object({ kind: z.literal('wall'), wall: WallSchema }),
]);

export type PositionInput = z.infer<typeof PositionSchema>;
export type WallInput = z.infer<typeof WallSchema>;
export type MoveInput = z.infer<typeof MoveSchema>;
