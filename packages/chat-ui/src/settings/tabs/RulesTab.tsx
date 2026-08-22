/**
 * Rules tab — Cursor-style project rules list.
 *
 * `.agentrules` = 기본 룰
 * `.agentk/rules/*` = 커스텀 룰
 *
 * Edit opens the file in this tab (debounced auto-save). New/Delete apply
 * only to custom rules. ProjectRulesLoader injects both every agent turn.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
} from '../components/SettingsUI';

const AUTO_SAVE_MS = 900;

function postToHost(msg: Record<string, unknown>): void {
  try {
    const vscodeApi =
      (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage(msg);
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage(msg, '*');
}

type RuleKind = 'basic' | 'custom';

type RuleItem = {
  id: string;
  kind: RuleKind;
  fileName: string;
  title: string;
  path: string;
  exists: boolean;
};

type ListPayload = {
  rules?: RuleItem[];
  otherFiles?: string[];
  error?: string;
};

type LoadPayload = {
  id?: string;
  content?: string;
  path?: string;
  exists?: boolean;
  kind?: RuleKind;
  title?: string;
  fileName?: string;
  error?: string;
};

type SavePayload = {
  ok?: boolean;
  id?: string;
  path?: string;
  title?: string;
  error?: string;
};

type CreatedPayload = {
  ok?: boolean;
  rule?: RuleItem;
  content?: string;
  error?: string;
};

type DeletedPayload = {
  ok?: boolean;
  id?: string;
  error?: string;
};

function kindLabel(kind: RuleKind): string {
  return kind === 'basic' ? '기본 룰' : '커스텀 룰';
}

export function RulesTab() {
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [otherFiles, setOtherFiles] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleItem | null>(null);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error'
  >('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  const inFlightSaveRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingIdRef = useRef<string | null>(null);

  contentRef.current = content;
  editingIdRef.current = editing?.id ?? null;

  const clearAutoTimer = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const requestList = useCallback(() => {
    const requestId = `rules_list_${++requestIdRef.current}`;
    if (!editingIdRef.current) setStatus('loading');
    setErrorMsg(null);
    postToHost({ type: 'rules.list', requestId });
  }, []);

  const requestLoad = useCallback((id: string) => {
    const requestId = `rules_load_${++requestIdRef.current}`;
    setStatus('loading');
    setErrorMsg(null);
    postToHost({ type: 'rules.load', requestId, id });
  }, []);

  const requestSave = useCallback((id: string, text: string) => {
    const requestId = `rules_save_${++requestIdRef.current}`;
    inFlightSaveRef.current = text;
    savingRef.current = true;
    setStatus('saving');
    setErrorMsg(null);
    postToHost({ type: 'rules.save', requestId, id, content: text });
  }, []);

  useEffect(() => {
    requestList();
    return () => clearAutoTimer();
  }, [requestList]);

  useEffect(() => {
    const onDoc = () => setMenuId(null);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'rules.listed') {
        const p = data as ListPayload;
        if (p.error) {
          setStatus('error');
          setErrorMsg(String(p.error));
          return;
        }
        setRules(Array.isArray(p.rules) ? p.rules : []);
        setOtherFiles(Array.isArray(p.otherFiles) ? p.otherFiles.map(String) : []);
        if (!editingIdRef.current) setStatus('idle');
        setErrorMsg(null);
        return;
      }

      if (data.type === 'rules.loaded') {
        const p = data as LoadPayload;
        if (p.error) {
          setStatus('error');
          setErrorMsg(String(p.error));
          return;
        }
        const id = String(p.id || '');
        setEditing({
          id,
          kind: p.kind === 'custom' ? 'custom' : 'basic',
          fileName: String(p.fileName || id),
          title: String(p.title || ''),
          path: String(p.path || ''),
          exists: Boolean(p.exists),
        });
        setContent(String(p.content ?? ''));
        contentRef.current = String(p.content ?? '');
        dirtyRef.current = false;
        inFlightSaveRef.current = null;
        savingRef.current = false;
        setStatus('idle');
        setErrorMsg(null);
        return;
      }

      if (data.type === 'rules.saved') {
        const p = data as SavePayload;
        savingRef.current = false;
        if (p.error || p.ok === false) {
          setStatus('error');
          setErrorMsg(String(p.error || 'Save failed'));
          return;
        }
        setErrorMsg(null);
        if (p.title) {
          const savedId = String(p.id || editingIdRef.current || '');
          setRules((prev) =>
            prev.map((r) =>
              r.id === savedId ? { ...r, title: String(p.title), exists: true } : r
            )
          );
          setEditing((cur) =>
            cur && cur.id === savedId
              ? { ...cur, title: String(p.title), exists: true }
              : cur
          );
        }
        if (contentRef.current === inFlightSaveRef.current) {
          dirtyRef.current = false;
          setStatus('saved');
        } else if (editingIdRef.current) {
          dirtyRef.current = true;
          requestSave(editingIdRef.current, contentRef.current);
        }
        return;
      }

      if (data.type === 'rules.created') {
        const p = data as CreatedPayload;
        if (p.error || p.ok === false || !p.rule) {
          setStatus('error');
          setErrorMsg(String(p.error || 'Create failed'));
          return;
        }
        setRules((prev) => {
          const next = prev.filter((r) => r.id !== p.rule!.id);
          next.push(p.rule!);
          return next;
        });
        setEditing(p.rule);
        setContent(String(p.content ?? ''));
        contentRef.current = String(p.content ?? '');
        dirtyRef.current = false;
        savingRef.current = false;
        setStatus('idle');
        setErrorMsg(null);
        return;
      }

      if (data.type === 'rules.deleted') {
        const p = data as DeletedPayload;
        if (p.error || p.ok === false) {
          setStatus('error');
          setErrorMsg(String(p.error || 'Delete failed'));
          return;
        }
        const deletedId = String(p.id || '');
        setRules((prev) => prev.filter((r) => r.id !== deletedId));
        if (editingIdRef.current === deletedId) {
          setEditing(null);
          setContent('');
        }
        setStatus('idle');
        setErrorMsg(null);
        return;
      }
    };

    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [requestSave]);

  const scheduleAutoSave = (id: string, next: string) => {
    clearAutoTimer();
    autoTimerRef.current = setTimeout(() => {
      if (!dirtyRef.current || savingRef.current) return;
      requestSave(id, next);
    }, AUTO_SAVE_MS);
  };

  const onChange = (value: string) => {
    if (!editing) return;
    setContent(value);
    contentRef.current = value;
    dirtyRef.current = true;
    setStatus('dirty');
    setErrorMsg(null);
    scheduleAutoSave(editing.id, value);
  };

  const onManualSave = () => {
    if (!editing) return;
    clearAutoTimer();
    requestSave(editing.id, contentRef.current);
  };

  const openEdit = (item: RuleItem) => {
    setMenuId(null);
    clearAutoTimer();
    requestLoad(item.id);
  };

  const closeEditor = () => {
    if (editing && dirtyRef.current && !savingRef.current) {
      requestSave(editing.id, contentRef.current);
    }
    clearAutoTimer();
    setEditing(null);
    setContent('');
    setStatus('idle');
    requestList();
  };

  const onNew = () => {
    setMenuId(null);
    const title = window.prompt('새 커스텀 룰 이름', '');
    if (title === null) return;
    const requestId = `rules_create_${++requestIdRef.current}`;
    setStatus('loading');
    setErrorMsg(null);
    postToHost({ type: 'rules.create', requestId, title });
  };

  const onDelete = (item: RuleItem) => {
    setMenuId(null);
    if (item.kind !== 'custom') return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    const requestId = `rules_delete_${++requestIdRef.current}`;
    postToHost({ type: 'rules.delete', requestId, id: item.id });
  };

  if (editing) {
    return (
      <div className="settings-tab-content">
        <SettingsSection
          title={editing.title || editing.fileName}
          description={`${kindLabel(editing.kind)} · ${editing.id}`}
        >
          <SettingsField label={editing.fileName} hint={editing.path || undefined}>
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              rows={16}
              spellCheck={false}
              aria-label="Rule content"
              placeholder={'# Rule title\n\n- Prefer small focused diffs\n'}
              style={{
                fontFamily:
                  'var(--vscode-editor-font-family, ui-monospace, monospace)',
                minHeight: 220,
              }}
              disabled={status === 'loading'}
            />
          </SettingsField>
          <SettingsActions>
            <button
              type="button"
              className="settings-btn secondary"
              onClick={closeEditor}
            >
              Back
            </button>
            <button
              type="button"
              className="settings-btn primary"
              onClick={onManualSave}
              disabled={status === 'loading' || status === 'saving'}
            >
              Save
            </button>
          </SettingsActions>
        </SettingsSection>
        {status === 'loading' ? (
          <SettingsStatus kind="info">Loading…</SettingsStatus>
        ) : null}
        {status === 'dirty' ? (
          <SettingsStatus kind="info">Editing — auto-saves in a moment…</SettingsStatus>
        ) : null}
        {status === 'saving' ? (
          <SettingsStatus kind="info">Saving…</SettingsStatus>
        ) : null}
        {status === 'saved' ? (
          <SettingsStatus kind="success">Saved</SettingsStatus>
        ) : null}
        {status === 'error' && errorMsg ? (
          <SettingsStatus kind="error">{errorMsg}</SettingsStatus>
        ) : null}
      </div>
    );
  }

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Project rules"
        description="기본 룰은 .agentrules, 커스텀 룰은 .agentk/rules 에 저장되고 매 턴 주입됩니다."
      >
        <div className="rules-list-head">
          <span className="rules-list-head__label">Rules {rules.length}</span>
          <button type="button" className="settings-btn secondary rules-new-btn" onClick={onNew}>
            + New
          </button>
        </div>

        <ul className="rules-list">
          {rules.map((item) => (
            <li key={item.id} className="rules-item">
              <button
                type="button"
                className="rules-item__main"
                onClick={() => openEdit(item)}
              >
                <span className="rules-item__icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3.5 4h9M3.5 8h9M3.5 12h6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="rules-item__text">
                  <span className="rules-item__title">{item.title}</span>
                  <span className="rules-item__kind">{kindLabel(item.kind)}</span>
                </span>
              </button>
              <div className="rules-item__menu-wrap">
                <button
                  type="button"
                  className="rules-item__more"
                  aria-label="Rule actions"
                  aria-expanded={menuId === item.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((cur) => (cur === item.id ? null : item.id));
                  }}
                >
                  ···
                </button>
                {menuId === item.id ? (
                  <div
                    className="rules-menu"
                    role="menu"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button type="button" role="menuitem" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    {item.kind === 'custom' ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => onDelete(item)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {otherFiles.length > 0 ? (
          <p className="settings-field__hint">
            Also loaded from workspace (read-only):{' '}
            {otherFiles.map((f) => (
              <code key={f} style={{ marginRight: 6 }}>
                {f}
              </code>
            ))}
          </p>
        ) : null}
      </SettingsSection>

      {status === 'loading' ? (
        <SettingsStatus kind="info">Loading workspace rules…</SettingsStatus>
      ) : null}
      {status === 'error' && errorMsg ? (
        <SettingsStatus kind="error">{errorMsg}</SettingsStatus>
      ) : null}
    </div>
  );
}
