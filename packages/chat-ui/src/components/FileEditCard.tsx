/**
 * UI — File edit card chrome (v2.1 FileEditCard).
 */
import type { JSX } from 'react';

export type FileEditCardProps = {
  path: string;
  additions?: number;
  deletions?: number;
  status?: 'pending' | 'applied' | 'rejected';
  onOpen?: () => void;
};

export function FileEditCard(props: FileEditCardProps): JSX.Element {
  const { path, additions = 0, deletions = 0, status = 'pending', onOpen } = props;
  const name = path.split('/').pop() || path;
  return (
    <button type="button" className={`file-edit-card file-edit-card--${status}`} data-testid="ui-file-edit-card" onClick={onOpen}>
      <span className="file-edit-card__name">{name}</span>
      <span className="file-edit-card__path">{path}</span>
      <span className="file-edit-card__stats">
        <span className="add">+{additions}</span>
        <span className="del">-{deletions}</span>
      </span>
    </button>
  );
}
