/**
 * Shared Settings Hub UI primitives (Cursor-style density).
 */
import React, { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section__head">
        <h3 className="settings-section__title">{title}</h3>
        {description ? (
          <p className="settings-section__desc">{description}</p>
        ) : null}
      </div>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-field">
      <label className="settings-field__label">{label}</label>
      {children}
      {hint ? <span className="settings-field__hint">{hint}</span> : null}
    </div>
  );
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`settings-toggle${disabled ? ' is-disabled' : ''}`}>
      <div className="settings-toggle__text">
        <span className="settings-toggle__label">{label}</span>
        {description ? (
          <span className="settings-toggle__desc">{description}</span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`settings-switch${checked ? ' is-on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span className="settings-switch__knob" />
      </button>
    </label>
  );
}

export function SettingsRadioGroup({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-radio-group" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            className={`settings-radio${active ? ' is-active' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
            />
            <span className="settings-radio__mark" aria-hidden />
            <span className="settings-radio__text">
              <span className="settings-radio__label">{opt.label}</span>
              {opt.description ? (
                <span className="settings-radio__desc">{opt.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function SettingsActions({ children }: { children: ReactNode }) {
  return <div className="settings-actions">{children}</div>;
}

export function SettingsStatus({
  kind,
  children,
}: {
  kind: 'success' | 'error' | 'info';
  children: ReactNode;
}) {
  return <p className={`settings-status settings-status--${kind}`}>{children}</p>;
}

/** Persist flat agent-k.* values to the extension host (VS Code configuration). */
export function persistToHost(values: Record<string, unknown>): void {
  try {
    const vscodeApi =
      (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage({ type: 'config.update', values });
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage({ type: 'config.update', values }, '*');
}
