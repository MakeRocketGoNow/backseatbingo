import { useState } from 'react';
import { useRoom } from '@app/store/room';
import { Sheet } from './Sheet';

/** Guest control: leave the trip, with a confirmation. */
export function LeaveButton({ full }: { full?: boolean }) {
  const { send } = useRoom();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn btn-ghost ${full ? '' : 'btn-auto'}`} onClick={() => setOpen(true)}>
        Leave
      </button>
      <Sheet open={open} title="Leave the trip?" onClose={() => setOpen(false)}>
        <p className="muted center">You can rejoin with the same code.</p>
        <button className="btn btn-danger" onClick={() => send({ type: 'leave' })}>
          Leave
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Stay
        </button>
      </Sheet>
    </>
  );
}
