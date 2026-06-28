import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { validateUsername } from '@/lib/usernameValidation';

export function UsernameSetupPage() {
  const { updateUsername } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateUsername(trimmed);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('409')
          ? 'Username already taken.'
          : 'Something went wrong.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-page flex-center">
      <div className="setup-card">
        <div className="setup-avatar">?</div>
        <h2 className="setup-title">Choose a username</h2>
        <p className="setup-sub">
          Welcome!
          <br />
          Enter a unique username
        </p>

        <form className="setup-form" onSubmit={handleSubmit}>
          <input
            className={`setup-input${error ? ' setup-input-error' : ''}`}
            type="text"
            placeholder="e.g. quoridor_king"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            maxLength={24}
            autoFocus
            spellCheck={false}
          />
          {error && <p className="setup-error">{error}</p>}
          <p className="setup-hint">3–24 characters. Letters, numbers, underscores.</p>
          <button
            className="btn btn-primary setup-submit"
            type="submit"
            disabled={saving || username.trim().length < 3}
          >
            {saving ? 'Saving…' : 'Set username'}
          </button>
        </form>
      </div>
    </div>
  );
}
