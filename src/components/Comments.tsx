/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Row = {
  id: number;
  text: string;
  created_at: string;
  author: string | null; // uuid
  profiles?: { nickname: string } | null;
};

export default function Comments({ slug = 'global' }: { slug?: string }) {
  const [list, setList]   = useState<Row[]>([]);
  const [text, setText]   = useState('');
  const [userId, setUid]  = useState<string | null>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [loading, setL]   = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    const sub = supabase.auth.onAuthStateChange((_e, s)=> setUid(s?.user?.id ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function load() {
    setL(true); setErr(null);
    // благодаря FK на profiles можно выбрать ник через релейшн
    const { data, error } = await supabase
      .from('comments')
      .select('id, text, created_at, author, profiles(nickname)')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) setErr(error.message);
    setList(data || []);
    setL(false);
  }

  useEffect(() => {
    load();
    // realtime: новые вставки по этому slug
    const channel = supabase
      .channel('comments-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `slug=eq.${slug}` },
        (payload) => setList(prev => [payload.new as Row, ...prev])
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [slug]);

  async function submit(e: Event) {
    e.preventDefault();
    setErr(null);
    const t = text.trim();
    if (!userId) return setErr('Нужно войти, чтобы написать.');
    if (t.length < 1) return setErr('Пустой комментарий.');
    if (t.length > 2000) return setErr('Максимум 2000 символов.');

    const { error } = await supabase
      .from('comments')
      .insert([{ text: t, slug, author: userId }]); // важно: author = user.id
    if (error) return setErr(error.message);

    setText('');
    // список обновится и через realtime; можно и руками:
    // await load();
  }

  return (
    <div style={{ maxWidth: 760, margin: '20px auto', padding: 12 }}>
      <h2>Комментарии</h2>

      <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <textarea
          rows={4}
          placeholder={userId ? 'Напишите что-нибудь…' : 'Войдите, чтобы писать'}
          disabled={!userId}
          value={text}
          onInput={(e:any)=>setText(e.currentTarget.value)}
          style={{ borderRadius: 10, padding: 10, border: '1px solid #ccc', resize: 'vertical' }}
        />
        <button disabled={!userId} type="submit">Отправить</button>
        {err && <div style={{ color:'crimson' }}>{err}</div>}
      </form>

      {loading ? (
        <div>Загрузка…</div>
      ) : list.length === 0 ? (
        <div>Пока нет комментариев.</div>
      ) : (
        <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
          {list.map(c=>(
            <li key={c.id} style={{ padding:12, border:'1px solid #eee', borderRadius:12 }}>
              <div style={{ fontWeight:600 }}>
                {c.profiles?.nickname ?? 'Без ника'}
              </div>
              <div style={{ opacity:.7, fontSize:13, margin:'2px 0 8px' }}>
                {new Date(c.created_at).toLocaleString()}
              </div>
              <div style={{ whiteSpace:'pre-wrap' }}>{c.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
