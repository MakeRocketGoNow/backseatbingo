import { useState } from 'react';
import { useRoom } from '@app/store/room';
import { Sheet } from './Sheet';

/** Host control: close the trip for everyone, with a confirmation. */
export function CloseTripButton() {
  const { send } = useRoom();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        Close the trip
      </button>
      <Sheet open={open} title="Close the trip?" onClose={() => setOpen(false)}>
        <p className="muted center">Everyone will be sent home. The code stops working.</p>
        <button className="btn btn-danger" onClick={() => send({ type: 'close' })}>
          Close the trip
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Keep it open
        </button>
      </Sheet>
    </>
  );
}
