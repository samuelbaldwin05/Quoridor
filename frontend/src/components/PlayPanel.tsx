import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MatchmakingModal } from './MatchmakingModal';
import { useAuth } from '@/hooks/useAuth';
import type { Settings } from '@/lib/schemas/settingsSchemas';

type PlayMode = Settings['gameMode'] | 'online';

const BOT_OPTIONS: { id: Settings['difficulty']; label: string; desc: string }[] = [
  { id: 'bot0',    label: 'Easy',    desc: 'Random moves' },
  { id: 'bot1',    label: 'Medium',  desc: 'Basic strategy' },
  { id: 'bot2',    label: 'Hard',    desc: 'Advanced AI' },
  { id: 'extreme', label: 'Extreme', desc: 'Trained neural net' },
];

const TIME_CONTROLS: { seconds: number; label: string; sub: string }[] = [
  { seconds: 180, label: '3 min', sub: 'Blitz' },
  { seconds: 300, label: '5 min', sub: 'Rapid' },
  { seconds: 600, label: '10 min', sub: 'Classic' },
];

interface PlayPanelProps {
  currentDifficulty: Settings['difficulty'];
  onPlay: (difficulty: Settings['difficulty'], gameMode: Settings['gameMode']) => void;
}

export function PlayPanel({ currentDifficulty, onPlay }: PlayPanelProps) {
  const { isGuest, profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<PlayMode>('vs-bot');
  const [difficulty, setDifficulty] = useState<Settings['difficulty']>(currentDifficulty);
  const [timeControl, setTimeControl] = useState(300);
  const [showMatchmaking, setShowMatchmaking] = useState(false);

  const userElo = profile?.elo ?? 500;
  const displayName = profile?.display_name ?? 'You';

  function handlePlay() {
    if (mode === 'online') {
      if (isGuest) {
        navigate('/login');
        return;
      }
      setShowMatchmaking(true);
      return;
    }
    const gameMode: Settings['gameMode'] =
      mode === 'vs-bot' || mode === 'pass-and-play' ? mode : 'vs-bot';
    onPlay(difficulty, gameMode);
  }

  function handleMatchFound(
    gameId: string,
    opponentName: string,
    opponentElo: number,
    playerRole: 0 | 1,
  ) {
    setShowMatchmaking(false);
    navigate(
      `/game/online/${gameId}?role=${playerRole}&opponent=${encodeURIComponent(opponentName)}&opponentElo=${opponentElo}&tc=${timeControl}`,
    );
  }

  return (
    <>
      <div className="right-panel play-panel">
        <div className="play-panel-body">
          <p className="play-panel-heading">Game Mode</p>

          <div className="play-mode-list">
            <button
              className={`play-mode-option${mode === 'vs-bot' ? ' play-mode-active' : ''}`}
              onClick={() => setMode('vs-bot')}
            >
              Play vs Bot
            </button>

            <button
              className={`play-mode-option${mode === 'pass-and-play' ? ' play-mode-active' : ''}`}
              onClick={() => setMode('pass-and-play')}
            >
              Pass and Play
            </button>

            {/* Online — locked for guests */}
            <button
              className={`play-mode-option play-mode-online${mode === 'online' ? ' play-mode-active' : ''}${isGuest ? ' play-mode-locked' : ''}`}
              onClick={() => (isGuest ? navigate('/login') : setMode('online'))}
            >
              {isGuest ? (
                <span className="play-mode-lock-label">
                  <span className="play-mode-lock-icon">🔒</span>
                  Sign in to Play Online
                </span>
              ) : (
                <span className="play-mode-online-label">
                  Play Online
                  <span className="play-mode-elo">{userElo}</span>
                </span>
              )}
            </button>
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

          {mode === 'online' && !isGuest && (
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
          <button
            className="btn btn-primary play-panel-play-btn"
            onClick={handlePlay}
            disabled={mode === 'online' && isGuest}
          >
            {mode === 'online' ? (isGuest ? 'Sign in' : 'Find Match') : 'Play'}
          </button>
        </div>
      </div>

      {showMatchmaking && (
        <MatchmakingModal
          timeControl={timeControl}
          displayName={displayName}
          elo={userElo}
          onMatchFound={handleMatchFound}
          onCancel={() => setShowMatchmaking(false)}
        />
      )}
    </>
  );
}
