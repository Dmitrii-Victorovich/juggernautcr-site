import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

type Row = {
  id: number;
  content: string;
  created_at: string;
  parent_id: number | null;
  pinned: boolean | null;
  author_id: string | null;
  profiles?: { username: string | null; role: Role | null } | null;
};

export default function Comments({ slug = 'feedback' }: { slug?: string }) {
  const [items, setItems] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => { load(); }, [slug]);

  async function load() {
    setLoading(true);
    try {
      // Попробуем с FK именем comments_author_id_fkey
      const withFk = await selectWithFk('comments_author_id_fkey');
      if (!withFk.error) {
        setItems(withFk.data ?? []);
        return;
      }

      // Попробуем альтернативное имя FK (если ты не переименовывал)
      const withOld = await selectWithFk('comments_author_fk');
      if (!withOld.error) {
        setItems(withOld.data ?? []);
        return;
      }

      // Фолбек: без JOIN, чтобы хотя бы комментарии показать
      const plain = await supabase
        .from('comments')
        .select('id, content, created_at, parent_id, pinned, author_id')
        .eq('slug', slug)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (plain.error) throw plain.error;
      setItems((plain.data as Row[]) ?? []);
    } catch (e) {
      console.error('comments load fatal:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function selectWithFk(fkName: string) {
    const sel =
      `id, content, created_at, parent_id, pinned, author_id, ` +
      `profiles!${fkName}(username, role)`;

    return supabase
      .from('comments')
      .select(sel)
      .eq('slug', slug)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
  }

  async function submit(e: Event) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    setPosting(true);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) {
        alert('Сначала войдите, чтобы писать комментарии.');
        return;
      }

      const ins = await supabase
        .from('comments')
        .insert({ content, slug, author_id: user.id })
        .select('id'); // чтобы понять, что всё ок

      if (ins.error) throw ins.error;
      setText('');
      await load();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Сообщение про RLS-ограничение "1 коммент раз в 5 минут" будет тоже здесь
      alert(msg);
    } finally {
      setPosting(false);
    }
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
      }}>
        {label}
      </span>
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
      ) : items.length === 0 ? (
        <div style={{opacity:.7}}>Пока нет комментариев</div>
      ) : (
        <div style={{display:'grid', gap:8}}>
          {items.map((c) => {
            const name = c.profiles?.username ?? 'Гость';
            const role = (c.profiles?.role ?? 'user') as Role;
            return (
              <div key={c.id}
                style={{
                  background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))',
                  border:'1px solid rgba(255,255,255,.12)',
                  borderRadius:12, padding:12
                }}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                  <div>
                    <strong>{name}</strong>
                    {badge(role)}
                  </div>
                  <div style={{opacity:.6, fontSize:12}}>
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
                <div>{c.content}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
