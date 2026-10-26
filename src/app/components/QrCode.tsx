import { useEffect, useState } from 'react';

/** Renders a QR code for `text`. The encoder is loaded on demand so it never weighs on the game screens. */
export function QrCode({ text, size = 220 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then(({ toDataURL }) => toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }))
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [text, size]);

  return (
    <div className="qr" style={{ width: size + 16, height: size + 16 }}>
      {src && <img src={src} width={size} height={size} alt={`QR code for ${text}`} />}
    </div>
  );
}
