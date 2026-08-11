/**
 * Shared Save button with brief “저장됨” flash (Settings Hub).
 */
import React, { useCallback, useState } from 'react';

export function SettingsSaveButton({
  onSave,
  disabled,
  label = '저장'
}: {
  onSave: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    onSave();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 2000);
  }, [onSave]);

  return (
    <div className="settings-actions">
      <button
        type="button"
        onClick={handleClick}
        className="settings-btn primary"
        disabled={disabled}
      >
        {flash ? '저장됨' : label}
      </button>
    </div>
  );
}
