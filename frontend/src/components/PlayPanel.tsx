import { useState } from 'react';
import { MatchmakingModal } from './MatchmakingModal';
import type { Settings } from '@/lib/schemas/settingsSchemas';

type PlayMode = Settings['gameMode'] | 'online';

const BOT_OPTIONS: { id: Settings['difficulty']; label: string; desc: string }[] = [
  { id: 'bot0', label: 'Easy',   desc: 'Random moves' },
  { id: 'bot1', label: 'Medium', desc: 'Basic strategy' },
  { id: 'bot2', label: 'Hard',   desc: 'Advanced AI' },
];

const TIME_CONTROLS: { seconds: number; label: string; sub: string }[] = [
  { seconds: 180, label: '3 min',  sub: 'Blitz' },
  { seconds: 300, label: '5 min',  sub: 'Rapid' },
  { seconds: 600, label: '10 min', sub: 'Classic' },
];

interface PlayPanelProps {
  currentDifficulty: Settings['difficulty'];
  onPlay: (difficulty: Settings['difficulty'], gameMode: Settings['gameMode']) => void;
}

export function PlayPanel({ currentDifficulty, onPlay }: PlayPanelProps) {
  const [mode, setMode] = useState<PlayMode>('vs-bot');
  const [difficulty, setDifficulty] = useState<Settings['difficulty']>(currentDifficulty);
  const [timeControl, setTimeControl] = useState(300);
  const [showMatchmaking, setShowMatchmaking] = useState(false);

  const modeOptions: { id: PlayMode; label: string; available: boolean }[] = [
    { id: 'vs-bot',        label: 'Play vs Bot',   available: true },
    { id: 'pass-and-play', label: 'Pass and Play', available: true },
    { id: 'online',        label: 'Play Online',   available: true },
  ];

  function handlePlay() {
    if (mode === 'online') {
      setShowMatchmaking(true);
      return;
    }
    const gameMode: Settings['gameMode'] = mode === 'vs-bot' || mode === 'pass-and-play'
      ? mode
      : 'vs-bot';
    onPlay(difficulty, gameMode);
  }

  function handleMatchFound(_gameId: string, _opponentName: string, _opponentElo: number) {
    // TODO: navigate to online game page once multiplayer is implemented
    setShowMatchmaking(false);
    // For now, fall back to local game
    onPlay(difficulty, 'vs-bot');
  }

  return (
    <>
      <div className="right-panel play-panel">
        <div className="play-panel-body">
          <p className="play-panel-heading">Game Mode</p>

          <div className="play-mode-list">
            {modeOptions.map((opt) => (
              <button
                key={opt.id}
                className={`play-mode-option${mode === opt.id ? ' play-mode-active' : ''}${!opt.available ? ' play-mode-disabled' : ''}`}
                onClick={() => opt.available && setMode(opt.id)}
                disabled={!opt.available}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'vs-bot' && (
            <div className="bot-difficulty">
              <p className="play-panel-heading">Difficulty</p>
              <div className="bot-option-list">
                {BOT_OPTIONS.map((bot) => (
                  <button
                    key={bot.id}
                    className={`bot-option${difficulty === bot.id ? ' bot-option-active' : ''}`}
                    onClick={() => setDifficulty(bot.id)}
                  >
                    <span className="bot-option-label">{bot.label}</span>
                    <span className="bot-option-desc">{bot.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'online' && (
            <div className="bot-difficulty">
              <p className="play-panel-heading">Time Control</p>
              <div className="bot-option-list">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.seconds}
                    className={`bot-option${timeControl === tc.seconds ? ' bot-option-active' : ''}`}
                    onClick={() => setTimeControl(tc.seconds)}
                  >
                    <span className="bot-option-label">{tc.label}</span>
                    <span className="bot-option-desc">{tc.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="play-panel-footer">
          <button className="btn btn-primary play-panel-play-btn" onClick={handlePlay}>
            {mode === 'online' ? 'Find Match' : 'Play'}
          </button>
        </div>
      </div>

      {showMatchmaking && (
        <MatchmakingModal
          timeControl={timeControl}
          displayName="You"
          elo={1200}
          onMatchFound={handleMatchFound}
          onCancel={() => setShowMatchmaking(false)}
        />
      )}
    </>
  );
}
