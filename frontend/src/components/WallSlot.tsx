import type { Orientation } from '@/engine/gameTypes';

interface WallSlotProps {
  orientation: Orientation;
  isPlaced: boolean;
  previewState: 'valid' | 'invalid' | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

export function WallSlot({
  orientation,
  isPlaced,
  previewState,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: WallSlotProps) {
  const classes = [
    'fence-slot',
    isPlaced
      ? orientation === 'h'
        ? 'horizontal-fence'
        : 'vertical-fence'
      : '',
    !isPlaced && previewState === 'valid' ? 'fence-preview-valid' : '',
    !isPlaced && previewState === 'invalid' ? 'fence-preview-invalid' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-fence-type={orientation === 'h' ? 'horizontal' : 'vertical'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}
