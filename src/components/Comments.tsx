/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

export default function Comments({ slug }: { slug: string }) {
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    load();
  }, [slug]);

  async function load() {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, text, created_at,
        profiles ( nickname )
      `)
      .eq('slug', slug)
      .order('created_at', { ascending: false });
    if (!error) setList(data ?? []);
  }

  async function send() {
    if (!user || !text.trim()) return;
    const { error } = await supabase
      .from('comments')
      .insert({ text: text.trim(), slug, author: user.id });
    if (!error) {
      setText('');
      load();
    }
  }

  return (
    <section style="margin-top:24px;">
      <h2 style="margin-bottom:12px;">Комментарии</h2>
      {user ? (
        <div style="margin-bottom:16px;">
          <textarea
            value={text}
            onInput={(e: any) => setText(e.target.value)}
            placeholder="Введите текст..."
            style="width:100%;padding:8px;border-radius:6px;resize:vertical;min-height:80px;"
          />
          <button
            onClick={send}
            style="margin-top:8px;padding:8px 14px;background:#1e253a;color:#a3d9ff;border:none;border-radius:6px;cursor:pointer;"
          >
            Отправить
          </button>
        </div>
      ) : (
        <p style="opacity:.7;">Войдите, чтобы оставить комментарий.</p>
      )}

      {list.length === 0 ? (
        <p style="opacity:.6;">Пока нет комментариев.</p>
      ) : (
        <ul style="list-style:none;padding:0;margin:0;">
          {list.map((c) => (
            <li
              key={c.id}
              style="padding:12px;margin-bottom:10px;background:#1e253a;border-radius:8px;"
            >
              <strong>{c.profiles?.nickname ?? 'Аноним'}</strong>
              <span style="opacity:.6;margin-left:8px;font-size:.9em;">
                {new Date(c.created_at).toLocaleString('ru-RU')}
              </span>
              <p style="margin:6px 0 0;white-space:pre-line;">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
