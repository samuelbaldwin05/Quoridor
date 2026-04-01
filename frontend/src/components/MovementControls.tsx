interface MovementControlsProps {
  onMove: (dir: 'up' | 'down' | 'left' | 'right') => void;
  disabled: boolean;
}

export function MovementControls({ onMove, disabled }: MovementControlsProps) {
  return (
    <div className="panel controls-section">
      <h3>Movement</h3>
      <div className="direction-controls">
        <button
          className="btn direction-btn flex-center"
          id="move-up"
          onClick={() => onMove('up')}
          disabled={disabled}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          className="btn direction-btn flex-center"
          id="move-left"
          onClick={() => onMove('left')}
          disabled={disabled}
          aria-label="Move left"
        >
          ←
        </button>
        <button
          className="btn direction-btn flex-center"
          id="move-right"
          onClick={() => onMove('right')}
          disabled={disabled}
          aria-label="Move right"
        >
          →
        </button>
        <button
          className="btn direction-btn flex-center"
          id="move-down"
          onClick={() => onMove('down')}
          disabled={disabled}
          aria-label="Move down"
        >
          ↓
        </button>
      </div>
    </div>
  );
}
