import React, { useEffect, useState } from 'react';

interface UpdateInfo {
  version: string;
  url: string;
  body?: string;
  publishedAt?: string;
}

export default function UpdateBadge() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const wmux = (window as any).wmux;
    if (!wmux?.update) return;

    // Pick up an update that may have been detected before this window mounted.
    wmux.update.getLatest().then((info: UpdateInfo | null) => {
      if (info) setUpdate(info);
    }).catch(() => {});

    const unsub = wmux.update.onAvailable((info: UpdateInfo) => setUpdate(info));
    return unsub;
  }, []);

  if (!update) return null;

  const handleClick = () => {
    (window as any).wmux?.update?.openRelease?.(update.url);
  };

  return (
    <button
      className="titlebar__btn titlebar__update-badge"
      onClick={handleClick}
      title={`Mise à jour disponible : v${update.version}\nClic pour télécharger sur GitHub`}
    >
      <span className="titlebar__update-badge__arrow">↑</span>
      <span className="titlebar__update-badge__version">v{update.version}</span>
    </button>
  );
}
