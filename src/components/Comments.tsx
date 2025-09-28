import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

type Profile = { username: string | null; role: Role | null } | null;

type CommentRow = {
  id: number;
  content: string;
  created_at: string;
  parent_id: number | null;
  author_id: string | null;
  pinned: boolean | null;
  allow_replies: boolean | null;
  allow_dislikes: boolean | null;
  profiles?: Profile;
};

type StatRow = { comment_id: number; likes: number; dislikes: number };
type MyVote = { comment_id: number; value: 1 | -1 };

export default function Comments({ slug = 'feedback' }: { slug?: string }) {
  // текущий пользователь
  const [me, setMe] = useState<{ id: string | null; role: Role }>({ id: null, role: 'user' });

  // лента
  const [items, setItems] = useState<CommentRow[]>([]);
  const [stats, setStats] = useState<Record<number, StatRow>>({});
  const [myVotes, setMyVotes] = useState<Record<number, 1 | -1>>({});

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState('');

  // состояние мини-формы ответа под каждым комментом
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');

  const isAdmin = me.role === 'creator' || me.role === 'admin';

  useEffect(() => {
    (async () => {
      // кто я
      const u = await supabase.auth.getUser();
      const uid = u.data.user?.id ?? null;

      let role: Role = 'user';
      if (uid) {
        const prof = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
        role = (prof.data?.role ?? 'user') as Role;
      }
      setMe({ id: uid, role });

      // грузим ленту + стату + мои голоса
      await loadAll(uid);
    })();
  }, [slug]);

  async function loadAll(uid: string | null) {
    setLoading(true);
    try {
      const list = await selectWithFk('comments_author_id_fkey'); // «правильное» имя FK
      let rows: CommentRow[] | null = null;

      if (!list.error) {
        rows = list.data as CommentRow[] | null;
      } else {
        const alt = await selectWithFk('comments_author_fk'); // запасной вариант имени
        if (!alt.error) rows = alt.data as CommentRow[] | null;
      }

      if (!rows) {
        // фолбек без JOIN, чтобы всё равно показать ленту
        const plain = await supabase
          .from('comments')
          .select('id, content, created_at, parent_id, author_id, pinned, allow_replies, allow_dislikes')
          .eq('slug', slug)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false });
        if (plain.error) throw plain.error;
        rows = plain.data as CommentRow[];
      }

      setItems(rows ?? []);

      const ids = (rows ?? []).map(r => r.id);
      if (ids.length) {
        // стата лайков/дизлайков
        const st = await supabase.from('comment_stats').select('*').in('comment_id', ids);
        const byId: Record<number, StatRow> = {};
        (st.data ?? []).forEach((s: any) => (byId[s.comment_id] = s));
        setStats(byId);

        // мои голоса
        if (uid) {
          const mv = await supabase
            .from('comment_votes')
            .select('comment_id,value')
            .eq('user_id', uid)
            .in('comment_id', ids);
          const map: Record<number, 1 | -1> = {};
          (mv.data ?? []).forEach((v: MyVote) => (map[v.comment_id] = v.value));
          setMyVotes(map);
        } else {
          setMyVotes({});
        }
      } else {
        setStats({});
        setMyVotes({});
      }
    } catch (e) {
      console.error('comments load fatal:', e);
      setItems([]);
      setStats({});
      setMyVotes({});
    } finally {
      setLoading(false);
    }
  }

  function selectWithFk(fkName: string) {
    const sel =
      `id, content, created_at, parent_id, author_id, pinned, allow_replies, allow_dislikes, ` +
      `profiles!${fkName}(username, role)`;
    return supabase
      .from('comments')
      .select(sel)
      .eq('slug', slug)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
  }

  // публикация корневого
  async function submit(e: Event) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    if (!me.id) return alert('Войдите, чтобы комментировать.');

    setPosting(true);
    try {
      const ins = await supabase
        .from('comments')
        .insert({ content, slug, author_id: me.id })
        .select('id');
      if (ins.error) throw ins.error;
      setText('');
      await loadAll(me.id);
    } catch (e: any) {
      alert(prettyDbError(e?.message ?? String(e)));
    } finally {
      setPosting(false);
    }
  }

  // публикация ответа
  async function submitReply(parentId: number) {
    const content = replyText.trim();
    if (!content) return;
    if (!me.id) return alert('Войдите, чтобы отвечать.');
    setPosting(true);
    try {
      const ins = await supabase
        .from('comments')
        .insert({ content, slug, author_id: me.id, parent_id: parentId })
        .select('id');
      if (ins.error) throw ins.error;
      setReplyText('');
      setReplyFor(null);
      await loadAll(me.id);
    } catch (e: any) {
      alert(prettyDbError(e?.message ?? String(e)));
    } finally {
      setPosting(false);
    }
  }

  // лайк / дизлайк
  async function vote(commentId: number, value: 1 | -1) {
    if (!me.id) return alert('Войдите, чтобы голосовать.');
    const c = items.find(i => i.id === commentId);
    if (!c) return;
    if (value === -1 && !c.allow_dislikes) return; // выключены дизлайки

    const current = myVotes[commentId] ?? 0;
    try {
      if (current === value) {
        // снять голос
        const del = await supabase.from('comment_votes').delete().eq('comment_id', commentId).eq('user_id', me.id);
        if (del.error) throw del.error;
      } else {
        // поставить/переключить
        const up = await supabase.from('comment_votes').upsert(
          { comment_id: commentId, user_id: me.id!, value },
          { onConflict: 'comment_id,user_id' }
        );
        if (up.error) throw up.error;
      }
      await loadAll(me.id);
    } catch (e: any) {
      alert(prettyDbError(e?.message ?? String(e)));
    }
  }

  // админ-действия
  async function togglePin(id: number, pinned: boolean | null) {
    if (!isAdmin) return;
    const q = await supabase.from('comments').update({ pinned: !pinned }).eq('id', id);
    if (q.error) return alert(prettyDbError(q.error.message));
    await loadAll(me.id);
  }
  async function toggleReplies(id: number, allow: boolean | null) {
    if (!isAdmin) return;
    const q = await supabase.from('comments').update({ allow_replies: !allow }).eq('id', id);
    if (q.error) return alert(prettyDbError(q.error.message));
    await loadAll(me.id);
  }
  async function toggleDislikes(id: number, allow: boolean | null) {
    if (!isAdmin) return;
    const q = await supabase.from('comments').update({ allow_dislikes: !allow }).eq('id', id);
    if (q.error) return alert(prettyDbError(q.error.message));
    await loadAll(me.id);
  }
  async function removeComment(id: number) {
    if (!isAdmin) return;
    if (!confirm('Удалить комментарий?')) return;
    const q = await supabase.from('comments').delete().eq('id', id);
    if (q.error) return alert(prettyDbError(q.error.message));
    await loadAll(me.id);
  }

  // разрезаем дерево: корни + ответы
  const roots = useMemo(() => items.filter(i => i.parent_id == null), [items]);
  const childrenByParent = useMemo(() => {
    const map: Record<number, CommentRow[]> = {};
    items.forEach(i => {
      if (i.parent_id != null) {
        (map[i.parent_id] ||= []).push(i);
      }
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.created_at < b.created_at ? -1 : 1));
    return map;
  }, [items]);

  function statFor(id: number): StatRow {
    return stats[id] ?? { comment_id: id, likes: 0, dislikes: 0 };
  }

  function badge(role?: Role | null) {
    if (!role || role === 'user') return null;
    const label =
      role === 'creator' ? 'Создатель' :
      role === 'admin'    ? 'Админ' :
      role === 'clanmate' ? 'Соклановец' :
      role === 'streamer' ? 'Стример' : role;
    return (
      <span style={{
        marginLeft: 8,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        border: '1px solid rgba(255,255,255,.2)',
        opacity: .9
      }}>{label}</span>
    );
  }

  return (
    <div style={{maxWidth:880, margin:'0 auto'}}>
      <h3 style={{margin:'16px 0 8px'}}>Комментарии</h3>

      <form onSubmit={submit} style={{display:'flex', gap:8, marginBottom:12}}>
        <input
          style={{flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)'}}
          placeholder="Введите текст…"
          value={text}
          onInput={(e:any)=>setText(e.currentTarget.value)}
        />
        <button disabled={posting}>Отправить</button>
      </form>

      {loading ? (
        <div>Загрузка…</div>
      ) : roots.length === 0 ? (
        <div style={{opacity:.7}}>Пока нет комментариев</div>
      ) : (
        <div style={{display:'grid', gap:8}}>
          {roots.map(c => {
            const name = c.profiles?.username ?? 'Гость';
            const role = (c.profiles?.role ?? 'user') as Role;
            const st = statFor(c.id);
            const my = myVotes[c.id] ?? 0;

            return (
              <div key={c.id}
                style={{
                  background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))',
                  border:'1px solid rgba(255,255,255,.12)',
                  borderRadius:12, padding:12
                }}>
                <div style={{display:'flex', justifyContent:'space-between', gap:10, marginBottom:6, alignItems:'center'}}>
                  <div>
                    <strong>{name}</strong>
                    {badge(role)}
                    {c.pinned ? <span style={{marginLeft:8, fontSize:12, opacity:.8}}>📌 закреплён</span> : null}
                  </div>
                  <div style={{opacity:.6, fontSize:12}}>
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>

                <div style={{marginBottom:8}}>{c.content}</div>

                {/* панель действий */}
                <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
                  {/* голоса */}
                  <button type="button" onClick={()=>vote(c.id, 1)} disabled={!me.id}
                    title="Нравится"
                    style={{opacity: me.id ? 1 : .6, borderRadius:8, padding:'4px 8px'}}>
                    👍 {st.likes}{my === 1 ? ' • ваш' : ''}
                  </button>

                  <button type="button" onClick={()=>vote(c.id, -1)}
                    disabled={!me.id || !c.allow_dislikes}
                    title={c.allow_dislikes ? 'Не нравится' : 'Дизлайки отключены'}
                    style={{opacity: (!me.id || !c.allow_dislikes) ? .5 : 1, borderRadius:8, padding:'4px 8px'}}>
                    👎 {st.dislikes}{my === -1 ? ' • ваш' : ''}
                  </button>

                  {/* ответ */}
                  {c.allow_replies !== false ? (
                    <button type="button" onClick={()=>{setReplyFor(c.id); setReplyText('');}}>
                      Ответить
                    </button>
                  ) : (
                    <span style={{opacity:.7, fontSize:13}}>Ответы отключены</span>
                  )}

                  {/* админ-кнопки */}
                  {isAdmin && (
                    <>
                      <button type="button" onClick={()=>togglePin(c.id, !!c.pinned)}>
                        {c.pinned ? 'Открепить' : 'Закрепить'}
                      </button>
                      <button type="button" onClick={()=>toggleReplies(c.id, c.allow_replies !== false)}>
                        Ответы: {c.allow_replies === false ? 'выкл' : 'вкл'}
                      </button>
                      <button type="button" onClick={()=>toggleDislikes(c.id, c.allow_dislikes !== false)}>
                        Дизлайки: {c.allow_dislikes === false ? 'выкл' : 'вкл'}
                      </button>
                      <button type="button" onClick={()=>removeComment(c.id)} style={{color:'#f88'}}>
                        Удалить
                      </button>
                    </>
                  )}
                </div>

                {/* форма ответа */}
                {replyFor === c.id && c.allow_replies !== false && (
                  <div style={{marginTop:8, display:'flex', gap:8}}>
                    <input
                      value={replyText}
                      onInput={(e:any)=>setReplyText(e.currentTarget.value)}
                      placeholder="Ваш ответ…"
                      style={{flex:1, padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)'}}
                    />
                    <button disabled={posting} onClick={()=>submitReply(c.id)}>Отправить</button>
                    <button type="button" onClick={()=>{setReplyFor(null); setReplyText('');}}>Отмена</button>
                  </div>
                )}

                {/* ответы (1 уровень) */}
                {(childrenByParent[c.id] ?? []).map(r => {
                  const rname = r.profiles?.username ?? 'Гость';
                  const rrole = (r.profiles?.role ?? 'user') as Role;
                  const rst = statFor(r.id);
                  const rmy = myVotes[r.id] ?? 0;
                  return (
                    <div key={r.id} style={{
                      marginTop:10, marginLeft:14, padding:10,
                      borderLeft:'2px solid rgba(255,255,255,.15)', borderRadius:8
                    }}>
                      <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                        <div><strong>{rname}</strong>{badge(rrole)}</div>
                        <div style={{opacity:.6, fontSize:12}}>{new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <div style={{marginBottom:8}}>{r.content}</div>
                      <div style={{display:'flex', gap:10, alignItems:'center'}}>
                        <button type="button" onClick={()=>vote(r.id, 1)} disabled={!me.id}
                          style={{opacity: me.id ? 1 : .6, borderRadius:8, padding:'4px 8px'}}>
                          👍 {rst.likes}{rmy === 1 ? ' • ваш' : ''}
                        </button>
                        <button type="button" onClick={()=>vote(r.id, -1)}
                          disabled={!me.id || !r.allow_dislikes}
                          style={{opacity: (!me.id || !r.allow_dislikes) ? .5 : 1, borderRadius:8, padding:'4px 8px'}}>
                          👎 {rst.dislikes}{rmy === -1 ? ' • ваш' : ''}
                        </button>
                        {isAdmin && (
                          <>
                            <button type="button" onClick={()=>removeComment(r.id)} style={{color:'#f88'}}>
                              Удалить
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// дружелюбные сообщения для RLS/чеков
function prettyDbError(msg: string) {
  if (/5 minutes|5 minute|5мин/i.test(msg)) return 'Можно оставлять 1 комментарий раз в 5 минут.';
  if (/Only admin\/creator/i.test(msg)) return 'Только создатель/админ могут менять эти флаги.';
  if (/Username can be set only once/i.test(msg)) return 'Ник можно задать только один раз.';
  return msg;
}
