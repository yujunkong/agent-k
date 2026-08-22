/**
 * SET-011 — Rules tab UI (v2.1 list/editor chrome; host file IO via postMessage).
 */
import { useEffect, useState, type JSX } from 'react';
import { getVsCodeApi } from '../../vscodeApi';
import { SettingsActions, SettingsSection, SettingsStatus } from '../SettingsUI';

type RuleKind = 'basic' | 'custom';
type RuleItem = {
  id: string;
  kind: RuleKind;
  fileName: string;
  title: string;
  path: string;
  exists: boolean;
};

const DEMO_RULES: RuleItem[] = [
  {
    id: 'basic',
    kind: 'basic',
    fileName: '.agentrules',
    title: 'Project rules',
    path: '.agentrules',
    exists: true,
  },
];

export function RulesTab(): JSX.Element {
  const [rules, setRules] = useState<RuleItem[]>(DEMO_RULES);
  const [editing, setEditing] = useState<RuleItem | null>(DEMO_RULES[0] ?? null);
  const [content, setContent] = useState(
    '# Agent K Rules\n\n- Prefer small diffs\n- Run related tests after edits\n',
  );
  const [status, setStatus] = useState<'idle' | 'saved' | 'loading'>('idle');

  useEffect(() => {
    getVsCodeApi().postMessage({ type: 'rules.list' });
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      const msg = data as Record<string, unknown>;
      if (msg.type === 'rules.listResult' && Array.isArray(msg.rules)) {
        setRules(msg.rules as RuleItem[]);
      }
      if (msg.type === 'rules.loadResult' && typeof msg.content === 'string') {
        setContent(msg.content);
        setStatus('idle');
      }
      if (msg.type === 'rules.saveResult') {
        setStatus(msg.ok ? 'saved' : 'idle');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const openRule = (rule: RuleItem) => {
    setEditing(rule);
    setStatus('loading');
    getVsCodeApi().postMessage({ type: 'rules.load', id: rule.id, path: rule.path });
  };

  const saveRule = () => {
    if (!editing) return;
    getVsCodeApi().postMessage({
      type: 'rules.save',
      id: editing.id,
      path: editing.path,
      content,
    });
    setStatus('saved');
  };

  const createRule = () => {
    getVsCodeApi().postMessage({ type: 'rules.create' });
    const id = `custom_${Date.now()}`;
    const item: RuleItem = {
      id,
      kind: 'custom',
      fileName: `${id}.md`,
      title: 'New rule',
      path: `.agentk/rules/${id}.md`,
      exists: true,
    };
    setRules((prev) => [...prev, item]);
    setEditing(item);
    setContent('# New rule\n\n');
    setStatus('idle');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-rules-tab">
      <SettingsSection
        title="Project rules"
        description="`.agentrules` + `.agentk/rules/*`. Host applies file IO when wired."
      >
        <div className="settings-actions" style={{ marginBottom: 8 }}>
          <button type="button" className="settings-btn secondary" onClick={createRule}>
            New rule
          </button>
        </div>
        <ul className="settings-model-list">
          {rules.map((r) => (
            <li key={r.id}>
              <button type="button" className="settings-btn secondary" onClick={() => openRule(r)}>
                {r.title} ({r.kind})
              </button>
              <span className="settings-hint">{r.fileName}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      {editing ? (
        <SettingsSection title={`Edit · ${editing.title}`} description={editing.path}>
          <textarea
            className="settings-json-editor"
            value={content}
            rows={16}
            spellCheck={false}
            aria-label="Rule content"
            onChange={(e) => {
              setContent(e.target.value);
              setStatus('idle');
            }}
          />
          <SettingsActions>
            <button type="button" className="settings-btn primary" onClick={saveRule}>
              Save rule
            </button>
          </SettingsActions>
          {status === 'saved' ? <SettingsStatus kind="success">Rule saved.</SettingsStatus> : null}
          {status === 'loading' ? <SettingsStatus kind="info">Loading…</SettingsStatus> : null}
        </SettingsSection>
      ) : null}
    </div>
  );
}
