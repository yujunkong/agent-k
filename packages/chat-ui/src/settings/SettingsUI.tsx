/**
 * Shared Settings Hub UI primitives (v2.1 SettingsUI port).
 */
import type { JSX, ReactNode } from 'react';

export function SettingsSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
}): JSX.Element {
  const { title, description, children } = props;
  return (
    <section className="settings-section">
      <div className="settings-section__head">
        <h3 className="settings-section__title">{title}</h3>
        {description ? <p className="settings-section__desc">{description}</p> : null}
      </div>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

export function SettingsField(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  const { label, hint, children } = props;
  return (
    <div className="settings-field">
      <label className="settings-field__label">{label}</label>
      {children}
      {hint ? <span className="settings-field__hint">{hint}</span> : null}
    </div>
  );
}

export function SettingsToggle(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  const { label, description, checked, onChange, disabled } = props;
  return (
    <label className={`settings-toggle${disabled ? ' is-disabled' : ''}`}>
      <div className="settings-toggle__text">
        <span className="settings-toggle__label">{label}</span>
        {description ? <span className="settings-toggle__desc">{description}</span> : null}
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

export function SettingsRadioGroup(props: {
  name: string;
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
}): JSX.Element {
  const { name, value, options, onChange } = props;
  return (
    <div className="settings-radio-group" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label key={opt.value} className={`settings-radio${active ? ' is-active' : ''}`}>
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

export function SettingsActions(props: { children: ReactNode }): JSX.Element {
  return <div className="settings-actions">{props.children}</div>;
}

export function SettingsStatus(props: {
  kind: 'success' | 'error' | 'info';
  children: ReactNode;
}): JSX.Element {
  return <p className={`settings-status settings-status--${props.kind}`}>{props.children}</p>;
}
