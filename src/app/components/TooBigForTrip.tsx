import { MAX_ITEM_LENGTH, MAX_PACK_ITEMS } from '@shared/types';

/**
 * Why a list cannot be used for a trip. Shown wherever a host picks a list,
 * so they get the reason before the room refuses it.
 */
export function TooBigForTrip() {
  return (
    <div className="notice" role="alert">
      This list is too big for a trip. Trips take up to {MAX_PACK_ITEMS} items of up to {MAX_ITEM_LENGTH} characters.
      Shorten it in Custom lists.
    </div>
  );
}
