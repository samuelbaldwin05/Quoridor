interface WallPostProps {
  isPlaced: boolean;
  isPreview: boolean;
}

export function WallPost({ isPlaced, isPreview }: WallPostProps) {
  const classes = [
    'fence-slot',
    isPlaced ? 'fence-post' : '',
    !isPlaced && isPreview ? 'fence-post-preview' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes} />;
}
