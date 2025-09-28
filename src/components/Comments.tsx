import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  fetchCommentsTree, sendComment, upsertVote,
  getMyProfile, deleteComment, togglePin, toggleReplies, toggleDislikes,
  type Comment, type Role
} from "../lib/comments";
import { RoleBadge } from "./RoleBadge";

export default function Comments({ slug }: { slug?: string }) {
  const [tree, setTree] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);

  const isAdmin = me?.role === 'admin' || me?.role === 'creator';

  async function load() {
    setLoading(true);
    try {
      const data = await fetchCommentsTree(slug);
      setTree(data);
      if (!me) setMe(await getMyProfile());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch1 = supabase.channel('comments-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, load)
      .subscribe();
    const ch2 = supabase.channel('votes-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_votes' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [slug]);

  async function submit() {
    if (!text.trim()) return;
    try {
      await sendComment({ content: text.trim(), parentId: replyTo, slug });
      setText("");
      setReplyTo(null);
    } catch (e:any) {
      alert(e.message ?? String(e));
    } finally {
      load();
    }
  }

  function Node({ node, depth = 0 }: { node: Comment; depth?: number }) {
    const time = new Date(node.created_at).toLocaleString();

    return (
      <div style={{ marginLeft: depth * 16, borderLeft: depth ? '1px solid rgba(255,255,255,.08)' : 'none', paddingLeft: depth ? 12 : 0, marginTop: 12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <RoleBadge role={node.author.role} />
          <strong>{node.author.username ?? 'Безымянный'}</strong>
          {node.pinned && <span style={{ fontSize:12, padding:'2px 6px', border:'1px solid rgba(255,255,255,.2)', borderRadius:999 }}>📌 закреплён</span>}
          <span style={{ opacity:.6, fontSize:12, marginLeft:4 }}>{time}</span>
        </div>

        <p style={{ margin:'6px 0 8px' }}>{node.content}</p>

        <div style={{ display:'flex', gap:12, alignItems:'center', fontSize:14 }}>
          <button onClick={() => upsertVote(node.id, 1)}>👍 {node.likes}</button>

          {/* 👎 скрываем, если отключено */}
          {node.allow_dislikes && (
            <button onClick={() => upsertVote(node.id, -1)}>👎 {node.dislikes}</button>
          )}

          {/* Ответ скрыт, если закрыты ответы */}
          {node.allow_replies && (
            <button onClick={() => setReplyTo(node.id)} title="Ответить">↩️ Ответить</button>
          )}

          {/* Панель модератора */}
          {isAdmin && (
            <>
              <button onClick={() => togglePin(node.id, !node.pinned)}>{node.pinned ? 'Открепить' : 'Закрепить'}</button>
              <button onClick={() => toggleReplies(node.id, !node.allow_replies)}>{node.allow_replies ? 'Закрыть ответы' : 'Открыть ответы'}</button>
              <button onClick={() => toggleDislikes(node.id, !node.allow_dislikes)}>{node.allow_dislikes ? 'Выключить дизлайки' : 'Включить дизлайки'}</button>
              <button onClick={() => { if (confirm('Удалить комментарий?')) deleteComment(node.id); }}>🗑 Удалить</button>
            </>
          )}
        </div>

        {node.children.map(child => (
          <Node key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>Комментарии</h3>

      {replyTo && (
        <div style={{ marginBottom: 6, fontSize: 13 }}>
          Ответ на комментарий #{replyTo} — <button onClick={() => setReplyTo(null)}>отменить</button>
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginBottom: 16 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Введите текст…"
          rows={3}
          style={{ flex: 1, resize: 'vertical' }}
        />
        <button onClick={submit} style={{ padding: '8px 14px' }}>Отправить</button>
      </div>

      {loading ? <div>Загрузка…</div> :
       tree.length === 0 ? <div>Пока нет комментариев</div> :
       tree.map(root => <Node key={root.id} node={root} />)}
    </div>
  );
}
