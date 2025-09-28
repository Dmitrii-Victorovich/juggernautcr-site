import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

export default function AuthBox() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('user');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  const canEditUsername = role === 'admin' || role === 'creator' || !username;
  const isAdmin = role === 'admin' || role === 'creator';

  useEffect(() => {
    (async () => {
      // следим за сессией
      supabase.auth.onAuthStateChange(async () => {
        await loadProfile();
      });
      await loadProfile();
    })();
  }, []);

  async function loadProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUserEmail(null);
      setRole('user');
      setUsername('');
      setLoading(false);
      return;
    }
    setUserEmail(user.email ?? null);

    const { data } = await supabase.from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .maybeSingle();

    setUsername(data?.username ?? '');
    setRole((data?.role ?? 'user') as Role);
    setLoading(false);
  }

  async function signInWithEmail(e: Event) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return;
    setSending(true);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: mail,
      options: { emailRedirectTo: redirectTo }
    });
    setSending(false);
    if (error) return alert(error.message);
    alert('Письмо со ссылкой отправлено. Проверьте почту и перейдите по ссылке.');
  }

  async function saveUsername() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Сначала войдите.');
    const u = username.trim();
    if (!u) return;
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: u }, { onConflict: 'id' });
    if (error) {
      if (/Username can be set only once/i.test(error.message)) {
        return alert('Ник уже был установлен — изменить может только админ/создатель.');
      }
      return alert(error.message);
    }
    alert('Ник сохранён');
    await loadProfile();
  }

  async function signOut() {
    await supabase.auth.signOut();
    await loadProfile();
  }

  // --- Панель назначения ролей для creator/admin (по e-mail) ---
  const [targetEmail, setTargetEmail] = useState('');
  const [targetRole, setTargetRole] = useState<Role>('user');

  async function assignRole() {
    if (!isAdmin) return;
    const em = targetEmail.trim();
    if (!em) return;
    const { data, error } = await supabase.rpc('set_user_role_by_email', {
      p_email: em,
      p_role: targetRole,
    });
    if (error) return alert(error.message);
    alert(data ? 'Роль обновлена' : 'Пользователь не найден');
    setTargetEmail('');
  }

  // --- UI ---
  return (
    <div style={{ background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16, maxWidth:580, margin:'0 auto 16px' }}>
      {loading ? (
        <div>Загрузка…</div>
      ) : userEmail ? (
        <>
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
              disabled={!canEditUsername}
              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }}
            />
            <button onClick={saveUsername} disabled={!canEditUsername} style={{ width:'fit-content', padding:'8px 12px' }}>
              Сохранить
            </button>
            {!canEditUsername && <small style={{opacity:.7}}>Ник можно задать один раз (админ/создатель могут менять всегда).</small>}
          </div>

          {isAdmin && (
            <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid rgba(255,255,255,.12)' }}>
              <div style={{ fontWeight:600, marginBottom:8 }}>Назначить роль (только для администратора/создателя)</div>
              <div style={{ display:'grid', gap:8 }}>
                <input
                  value={targetEmail}
                  onInput={(e:any)=>setTargetEmail((e?.currentTarget?.value ?? '') as string)}
                  placeholder="Email пользователя"
                  style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }}
                />
                <select value={targetRole} onChange={(e:any)=>setTargetRole(e.currentTarget.value as Role)} style={{ padding:'8px 10px', borderRadius:8 }}>
                  <option value="user">user</option>
                  <option value="clanmate">clanmate (соклан)</option>
                  <option value="streamer">streamer</option>
                  <option value="admin">admin</option>
                  <option value="creator">creator</option>
                </select>
                <button onClick={assignRole} style={{ width:'fit-content', padding:'8px 12px' }}>Обновить роль</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={signInWithEmail} style={{ display:'grid', gap:8 }}>
          <div style={{ fontWeight:600 }}>Вход</div>
          <input
            type="email"
            placeholder="Ваш e-mail"
            value={email}
            onInput={(e:any)=>setEmail((e?.currentTarget?.value ?? '') as string)}
            style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }}
            required
          />
          <button type="submit" disabled={sending} style={{ width:'fit-content', padding:'8px 12px' }}>
            {sending ? 'Отправляю…' : 'Войти по ссылке на почту'}
          </button>
          <small style={{opacity:.7}}>Мы отправим письмо со ссылкой. Перейдите по ней — и вы войдёте на этот же экран.</small>
        </form>
      )}
    </div>
  );
}
