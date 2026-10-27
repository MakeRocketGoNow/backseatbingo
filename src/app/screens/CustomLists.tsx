import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Pack } from '@shared/types';
import { MAX_ITEM_LENGTH, MAX_PACK_ITEMS } from '@shared/types';
import { BINGO_MIN_ITEMS, itemsFromLines } from '@game/index';
import { Page } from '@app/components/Page';
import { Sheet } from '@app/components/Sheet';
import { useToast } from '@app/components/Toast';
import { newCustomPackId, useCustomPackMutations, usePacks } from '@app/store/packs';

export function CustomLists() {
  const { custom, isLoading } = usePacks();
  const { remove } = useCustomPackMutations();
  const [pendingDelete, setPendingDelete] = useState<Pack | null>(null);
  const toast = useToast();

  return (
    <Page title="Custom lists" back="/">
      <p className="muted">Your own things to spot. Lists stay on this phone.</p>
      <Link to="/lists/new" className="btn btn-primary">
        + New list
      </Link>
      {isLoading ? (
        <div className="notice">Loading…</div>
      ) : custom.length === 0 ? (
        <div className="notice">No custom lists yet.</div>
      ) : (
        <ul className="list">
          {custom.map((p) => (
            <li className="list-item" key={p.id}>
              <Link to="/lists/$packId" params={{ packId: p.id }} className="btn choice grow">
                {p.name}
                <span className="btn-sub">
                  {p.items.length} items{p.items.length < BINGO_MIN_ITEMS ? ' · Called It only' : ''}
                </span>
              </Link>
              <button className="btn btn-icon btn-outline" aria-label={`Delete ${p.name}`} onClick={() => setPendingDelete(p)}>
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!pendingDelete} title={`Delete "${pendingDelete?.name ?? ''}"?`} onClose={() => setPendingDelete(null)}>
        <p className="muted center">This can't be undone.</p>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (!pendingDelete) return;
            remove.mutate(pendingDelete.id, { onSuccess: () => toast.show('List deleted') });
            setPendingDelete(null);
          }}
        >
          Delete
        </button>
        <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
          Cancel
        </button>
      </Sheet>
    </Page>
  );
}

export function EditCustomList({ packId }: { packId?: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { custom, isLoading } = usePacks();
  const { save } = useCustomPackMutations();
  const existing = packId ? custom.find((p) => p.id === packId) : undefined;

  const [name, setName] = useState('');
  const [lines, setLines] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || isLoading) return;
    if (existing) {
      setName(existing.name);
      setLines(existing.items.map((i) => i.text).join('\n'));
    }
    setLoaded(true);
  }, [loaded, isLoading, existing]);

  const items = itemsFromLines(lines);
  // Same caps as a room, so every saved list can host a trip.
  const extra = items.length - MAX_PACK_ITEMS;
  const tooLong = items.filter((i) => i.text.length > MAX_ITEM_LENGTH).length;
  const canSave = name.trim().length > 0 && items.length > 0 && extra <= 0 && tooLong === 0;

  function onSave() {
    if (!canSave) return;
    const pack: Pack = {
      id: existing?.id ?? newCustomPackId(),
      name: name.trim(),
      description: existing?.description ?? '',
      free: true,
      minAge: 0,
      items,
      custom: true,
    };
    save.mutate(pack, {
      onSuccess: () => {
        toast.show('List saved');
        void navigate({ to: '/lists', replace: true });
      },
    });
  }

  if (packId && !isLoading && !existing) {
    return (
      <Page title="Custom list" back="/lists">
        <div className="notice">That list is gone.</div>
      </Page>
    );
  }

  return (
    <Page title={existing ? 'Edit list' : 'New list'} back="/lists">
      <label className="field-label" htmlFor="list-name">
        Name
      </label>
      <input
        id="list-name"
        className="input"
        value={name}
        placeholder="Grandma's house"
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field-label" htmlFor="list-items">
        Things to spot <span className="muted small">(one per line)</span>
      </label>
      <textarea
        id="list-items"
        className="textarea"
        value={lines}
        placeholder={'A red barn\nA green tractor\nA billboard for a personal injury lawyer'}
        onChange={(e) => setLines(e.target.value)}
      />
      <p className="muted small">
        {items.length} of {MAX_PACK_ITEMS} items.{' '}
        {items.length >= BINGO_MIN_ITEMS
          ? 'Works for Called It and Bingo.'
          : `Add ${BINGO_MIN_ITEMS - items.length} more for Bingo.`}
      </p>
      {(extra > 0 || tooLong > 0) && (
        // Polite, not an alert: it changes with every line typed and should not interrupt.
        <div className="notice" role="status">
          {extra > 0 && `Lists can have up to ${MAX_PACK_ITEMS} items. Remove ${extra}. `}
          {tooLong > 0 &&
            `${tooLong === 1 ? 'One item is' : `${tooLong} items are`} longer than ${MAX_ITEM_LENGTH} characters. Shorten ${tooLong === 1 ? 'it' : 'them'}.`}
        </div>
      )}
      <button className="btn btn-primary btn-big" disabled={!canSave || save.isPending} onClick={onSave}>
        Save
      </button>
    </Page>
  );
}
