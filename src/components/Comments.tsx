/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Comment = {
  id: string;
  created_at: string;
  author: string;
  text: string;
  slug: string;
};

export default function Comments({ slug = 'global' }: { slug?: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setErr(error.message);
    setItems(data || []);
    setLoading(false);
  }

  async function addComment(e: Event) {
    e.preventDefault();
    setErr(null);

    const a = author.trim();
    const t = text.trim();
    if (a.length < 2 || t.length < 2) {
      setErr('Заполните ник и текст (минимум 2 символа).');
      return;
    }
    if (t.length > 2000) {
      setErr('Слишком длинный комментарий (до 2000 символов).');
      return;
    }

    const { error } = await supabase.from('comments').insert([{ author: a, text: t, slug }]);
    if (error) {
      setErr(error.message);
      return;
    }
    setText('');
    await load();
  }

  useEffect(() => {
    load();
    // подписка на новые комменты (реалтайм)
    const channel = supabase
      .channel('comments-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `slug=eq.${slug}` },
        (payload) => {
          setItems((prev) => [payload.new as Comment, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [slug]);

  return (
    <div style={{ maxWidth: 700, margin: '24px auto', padding: '16px' }}>
      <h2 style={{ margin: '0 0 12px' }}>Комментарии</h2>

      <form onSubmit={addComment} style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="Ник"
          value={author}
          onInput={(e: any) => setAuthor(e.currentTarget.value)}
          style={{ padding: '10px', borderRadius: 8, border: '1px solid #ccc' }}
        />
        <textarea
          placeholder="Ваш комментарий…"
          value={text}
          onInput={(e: any) => setText(e.currentTarget.value)}
          rows={4}
          style={{ padding: '10px', borderRadius: 8, border: '1px solid #ccc', resize: 'vertical' }}
        />
        <button type="submit" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #999', cursor: 'pointer' }}>
          Отправить
        </button>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}
      </form>

      {loading ? (
        <div>Загрузка…</div>
      ) : items.length === 0 ? (
        <div>Пока пусто. Будьте первым!</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {items.map((c) => (
            <li key={c.id} style={{ padding: 12, border: '1px solid #e3e3e3', borderRadius: 12, background: '#fafafa' }}>
              <div style={{ fontWeight: 600 }}>{c.author}</div>
              <div style={{ opacity: .8, fontSize: 14, marginBottom: 6 }}>
                {new Date(c.created_at).toLocaleString()}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
