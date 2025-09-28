import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

export default function AuthBox() {
  const [mode, setMode] = useState<'register' | 'login'>('register');

  // общие
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ email: string | null; role: Role; username: string } | null>(null);

  // регистрация
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regBusy, setRegBusy] = useState(false);
  const [regSent, setRegSent] = useState(false);

  // вход
  const [logEmail, setLogEmail] = useState('');
  const [logPassword, setLogPassword] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async () => {
      await loadMe();
    });
    loadMe();
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  async function loadMe() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMe(null);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .maybeSingle();
    setMe({
      email: user.email ?? null,
      role: (profile?.role ?? 'user') as Role,
      username: profile?.username ?? '',
    });
    setLoading(false);
  }

  async function checkUsernameFree(name: string) {
    const u = name.trim();
    if (!u) return false;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', u)  // регистронезависимо
      .limit(1);
    if (error) return true; // не мешаем регистрации из-за ошибки проверки
    return (data?.length ?? 0) === 0;
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
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },            // <- триггер заберёт ник в profiles
        emailRedirectTo: redirectTo,   // <- после клика по письму вернёт сюда и залогинит
      }
    });
    setRegBusy(false);

    if (error) {
      alert(error.message);
      return;
    }
    // Если включено подтверждение, session = null — ждём письмо.
    if (!data.session) {
      setRegSent(true);
    } else {
      // автологин без подтверждения (если выключили Confirm Email)
      await loadMe();
    }
  }

  async function login(e: Event) {
    e.preventDefault();
    setLogBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: logEmail.trim(),
      password: logPassword,
    });
    setLogBusy(false);
    if (error) return alert(error.message);
    await loadMe();
  }

  async function signOut() {
    await supabase.auth.signOut();
    await loadMe();
  }

  if (loading) {
    return <div style={{margin:'0 auto 16px',maxWidth:580}}>Загрузка…</div>;
  }

  // --- авторизован ---
  if (me) {
    return (
      <div style={{ background:'linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16, maxWidth:580, margin:'0 auto 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>Вы вошли как <strong>{me.username || 'Без ника'}</strong> — роль: <strong>{me.role}</strong></div>
          <button onClick={signOut}>Выйти</button>
        </div>
      </div>
    );
  }

  // --- не авторизован: регистрация/вход ---
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
