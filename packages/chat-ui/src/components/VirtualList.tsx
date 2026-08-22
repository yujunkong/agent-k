/**
 * UI-024 — Simple virtual list shell (windowing host-ready).
 */
import type { JSX, ReactNode } from 'react';

export function VirtualList(props: {
  items: ReactNode[];
  className?: string;
}): JSX.Element {
  return (
    <div className={`virtual-list${props.className ? ` ${props.className}` : ''}`} data-testid="ui-virtual-list">
      {props.items.map((item, i) => (
        <div key={i} className="virtual-list__row">
          {item}
        </div>
      ))}
    </div>
  );
}
