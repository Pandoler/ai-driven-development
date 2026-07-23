import { MemberRow } from './MemberRow';
import type { Member } from '../types';

interface Props {
  members: Member[];
  /** 自動命名済みのメンバー（placeholder 表示用） */
  namedMembers: Member[];
  onAdd: () => void;
  onUpdate: (member: Member) => void;
  onRemove: (id: string) => void;
}

export function MemberList({ members, namedMembers, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="member-list">
      <div className="section-header">
        <h2>👥 メンバー（{members.length}人）</h2>
        <button type="button" className="btn-add" onClick={onAdd}>
          ＋追加
        </button>
      </div>
      {members.map((m, i) => (
        <MemberRow
          key={m.id}
          member={m}
          placeholder={namedMembers[i].name}
          canRemove={members.length > 1}
          onUpdate={onUpdate}
          onRemove={() => onRemove(m.id)}
        />
      ))}
    </div>
  );
}
