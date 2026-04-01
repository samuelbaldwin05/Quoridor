import { z } from 'zod';

export const SettingsSchema = z.object({
  difficulty: z.enum(['bot0', 'bot1', 'bot2']).default('bot2'),
  theme: z.enum(['modern']).default('modern'),
  volume: z.number().min(0).max(1).default(0.7),
  soundEnabled: z.boolean().default(true),
  keyboardEnabled: z.boolean().default(true),
  clickMoveEnabled: z.boolean().default(true),
  aiDelayEnabled: z.boolean().default(true),
  devMode: z.boolean().default(false),
});

export type Settings = z.infer<typeof SettingsSchema>;
