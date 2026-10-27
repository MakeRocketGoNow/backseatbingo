import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { MAX_NAME_LENGTH } from '@shared/types';
import { CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '@game/index';
import { getRoomInfo } from '@app/api';
import { Page } from '@app/components/Page';
import { useDisplayName } from '@app/store/identity';

/** Code entry (prefilled from a /j/<CODE> link) and display name. */
export function Join({ initialCode }: { initialCode?: string }) {
  const navigate = useNavigate();
  const [name, setName] = useDisplayName();
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode ?? ''));
  const [error, setError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: getRoomInfo,
    onSuccess: (info, lookedUp) => {
      if (!info) {
        setError('No trip with that code. Check it with the host.');
        return;
      }
      void navigate({ to: '/room/$code', params: { code: lookedUp }, replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  const trimmed = name.trim();
  const ready = isValidRoomCode(code) && trimmed.length > 0 && !lookup.isPending;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidRoomCode(code)) {
      setError(`Codes are ${CODE_LENGTH} letters.`);
      return;
    }
    if (!trimmed) {
      setError('Pick a name so everyone knows who called it.');
      return;
    }
    lookup.mutate(code);
  }

  return (
    <Page title="Join a trip" back="/">
      <form className="stack" onSubmit={submit}>
        <label className="field-label" htmlFor="join-code">
          Room code
        </label>
        <input
          id="join-code"
          className="input code-input"
          value={code}
          placeholder="ABCD"
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="next"
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        />
        <label className="field-label" htmlFor="join-name">
          Your name
        </label>
        <input
          id="join-name"
          className="input"
          value={name}
          placeholder="Kid"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          enterKeyHint="go"
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-big" disabled={!ready}>
          {lookup.isPending ? 'Looking…' : 'Join'}
        </button>
      </form>
    </Page>
  );
}
