import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

export default function AuthBox() {
  const [mode, setMode] = useState<'register' | 'login'>('register');

  // общее
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ email: string | null; role: Role; username: string } | null>(null);

  // регистрация
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regBusy, setRegBusy]   = useState(false);
  const [regSent, setRegSent]   = useState(false);

  // вход
  const [logEmail, setLogEmail]     = useState('');
  const [logPassword, setLogPassword] = useState('');
  const [logBusy, setLogBusy]       = useState(false);

  // ник после входа (если пустой)
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // не ждём в useEffect, просто триггерим подгрузку
      loadMe();
    });
    loadMe();
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function loadMe() {
    setLoading(true);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;

      if (!user) {
        setMe(null);
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('username, role')
        .eq('id', user.id)
        .maybeSingle();
      if (pErr) throw pErr;

      setMe({
        email: user.email ?? null,
        role: (profile?.role ?? 'user') as Role,
        username: profile?.username ?? '',
      });
    } catch (e:any) {
      console.warn('loadMe error:', e?.message ?? e);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  async function checkUsernameFree(name: string) {
    const u = name.trim();
    if (!u) return false;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', u) // регистронезависимая «равно»
        .limit(1);
      if (error) return true;         // не блокируем регу из-за сбоя проверки
      return (data?.length ?? 0) === 0;
    } catch {
      return true;
    }
  }

  async function register(e: Event) {
    e.preventDefault();
    const email = regEmail.trim();
    const username = regUsername.trim();
    const password = regPassword;

    if (!email || !username || !password) {
      alert('Заполни email, ник и пароль.');
      return;
    }

    const free = await checkUsernameFree(username);
    if (!free) {
      alert('Такой ник уже занят. Выбери другой.');
      return;
    }

    setRegBusy(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },         // триггер положит в profiles.username
          emailRedirectTo: redirectTo // после клика вернёт сюда и залогинит
        }
      });
      if (error) throw error;

      if (!data.session) {
        setRegSent(true); // письмо ушло, ждём клик
      } else {
        await loadMe();   // если подтверждение отключено
      }
    } catch (e:any) {
      alert(e?.message ?? String(e));
    } finally {
      setRegBusy(false);
    }
  }

  async function login(e: Event) {
    e.preventDefault();
    setLogBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: logEmail.trim(),
        password: logPassword,
      });
      if (error) throw error;
      await loadMe();
    } catch (e:any) {
      alert(e?.message ?? String(e));
    } finally {
      setLogBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    await loadMe();
  }

  async function saveUsernameFirstTime(e?: Event) {
    if (e) e.preventDefault();
    const u = newUsername.trim();
    if (!u) return alert('Введите ник.');

    const free = await checkUsernameFree(u);
    if (!free) return alert('Такой ник уже занят. Выберите другой.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Сначала войдите.');

    setSavingUsername(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, username: u }, { onConflict: 'id' });
      if (error) throw error;
      await loadMe();
      alert('Ник сохранён.');
    } catch (e:any) {
      const msg = String(e?.message ?? e);
      if (/unique|uniq_profiles_username_ci|duplicate/i.test(msg)) {
        alert('Такой ник уже занят. Выберите другой.');
      } else if (/once|set only once/i.test(msg)) {
        alert('Ник уже был установлен — изменить может только админ/создатель.');
      } else {
        alert(msg);
      }
    } finally {
      setSavingUsername(false);
    }
  }

  // ---------- UI ----------
  if (loading) {
    return <div style={{margin:'0 auto 16px',maxWidth:580}}>Загрузка…</div>;
  }

  // авторизован
  if (me) {
    return (
      <div style={{ background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16, maxWidth:580, margin:'0 auto 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            Вы вошли как <strong>{me.username || 'Без ника'}</strong> — роль: <strong>{me.role}</strong>
          </div>
          <button onClick={signOut}>Выйти</button>
        </div>

        {!me.username && (
          <form onSubmit={saveUsernameFirstTime} style={{ display:'grid', gap:8 }}>
            <label>Задайте ник (можно только один раз)</label>
            <input
              value={newUsername}
              onInput={(e:any)=>setNewUsername(e.currentTarget.value)}
              placeholder="Ваш ник"
              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }}
              maxLength={32}
              required
            />
            <button type="submit" disabled={savingUsername} style={{ width:'fit-content', padding:'8px 12px' }}>
              {savingUsername ? 'Сохраняю…' : 'Сохранить ник'}
            </button>
            <small style={{opacity:.7}}>После сохранения изменить ник сможет только админ/создатель.</small>
          </form>
        )}
      </div>
    );
  }

  // не авторизован
  return (
    <div style={{ background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16, maxWidth:580, margin:'0 auto 16px' }}>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={()=>setMode('register')} disabled={mode==='register'}>Регистрация</button>
        <button onClick={()=>setMode('login')} disabled={mode==='login'}>Вход</button>
      </div>

      {mode === 'register' ? (
        regSent ? (
          <div>
            <b>Письмо отправлено.</b><br/>
            Проверь почту (включая «Спам») и перейди по ссылке — после этого ты автоматически войдёшь на эту страницу.
          </div>
        ) : (
          <form onSubmit={register} style={{ display:'grid', gap:8 }}>
            <label>Email</label>
            <input type="email" required value={regEmail} onInput={(e:any)=>setRegEmail(e.currentTarget.value)} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }} />

            <label>Ник</label>
            <input required value={regUsername} onInput={(e:any)=>setRegUsername(e.currentTarget.value)} placeholder="Например, Дмитрий" style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }} />

            <label>Пароль</label>
            <input type="password" required value={regPassword} onInput={(e:any)=>setRegPassword(e.currentTarget.value)} minLength={6} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }} />

            <button type="submit" disabled={regBusy} style={{ width:'fit-content', padding:'8px 12px' }}>
              {regBusy ? 'Отправляю…' : 'Зарегистрироваться'}
            </button>
            <small style={{opacity:.7}}>После регистрации мы вышлем письмо для подтверждения. Клик — и ты уже внутри.</small>
          </form>
        )
      ) : (
        <form onSubmit={login} style={{ display:'grid', gap:8 }}>
          <label>Email</label>
          <input type="email" required value={logEmail} onInput={(e:any)=>setLogEmail(e.currentTarget.value)} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }} />

          <label>Пароль</label>
          <input type="password" required value={logPassword} onInput={(e:any)=>setLogPassword(e.currentTarget.value)} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)' }} />

          <button type="submit" disabled={logBusy} style={{ width:'fit-content', padding:'8px 12px' }}>
            {logBusy ? 'Вхожу…' : 'Войти'}
          </button>
        </form>
      )}
    </div>
  );
}
