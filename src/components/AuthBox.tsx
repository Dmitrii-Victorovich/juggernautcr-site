import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabaseClient';

export default function AuthBox() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>('user');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
        const { data } = await supabase.from('profiles').select('username, role').eq('id', user.id).maybeSingle();
        if (data) {
          setUsername(data.username ?? '');
          setRole(data.role ?? 'user');
        }
      }
    })();
  }, []);

  async function saveUsername() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Войдите');
    const u = username.trim();
    if (!u) return;
    const { error } = await supabase.from('profiles').upsert({ id: user.id, username: u }, { onConflict: 'id' });
    if (error) return alert(error.message);
    alert('Сохранено');
  }

  async function signOut() {
    await supabase.auth.signOut();
    location.reload();
  }

  return (
    <div style={{ background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div>Вы вошли как <strong>{role === 'creator' ? 'Создатель' : role === 'admin' ? 'Админ' : role === 'clanmate' ? 'Соклановец' : role === 'streamer' ? 'Стример' : 'Пользователь'}</strong></div>
        <button onClick={signOut}>Выйти</button>
      </div>
      <div style={{ display:'grid', gap:8 }}>
        <label>Никнейм</label>
        <input
          value={username}
          onInput={(e: any) => setUsername((e?.currentTarget?.value ?? '') as string)}
          placeholder="Ваш ник"
          style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }}
        />
        <button onClick={saveUsername} style={{ width:'fit-content', padding:'8px 12px' }}>Сохранить</button>
      </div>
    </div>
  );
}
