import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function SharePanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => `${window.location.origin}/`, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    QRCode.toCanvas(canvas, url, { width: 180, margin: 1 }).catch(() => undefined);
  }, [url]);

  const handleCopy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="share-panel">
      <canvas ref={canvasRef} aria-label="QR code linking to this page" />
      <div className="share-details">
        <p>Open this address on any device in the same network:</p>
        <code>{url}</code>
        <button type="button" className="btn" onClick={() => void handleCopy()}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}
