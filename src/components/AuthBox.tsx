/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

type Profile = { id: string; nickname: string | null };

export default function AuthBox() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [nick, setNick] = useState('');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // стартовое состояние
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
    });

    // подписка на изменения сессии
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setMsg(null);
      if (u) fetchProfile(u.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchProfile(uid: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, nickname')
      .eq('id', uid)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
    if (data?.nickname) setNick(data.nickname);
  }

  async function onLogin() {
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (error) setMsg(error.message);
    setLoading(false);
  }

  async function onRegister() {
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { nickname: nick || null } },
    });
    if (!error) setMsg('Проверь почту: подтвердите адрес.');
    else setMsg(error.message);
    setLoading(false);
  }

  async function onLogout() {
    await supabase.auth.signOut();
  }

  async function saveNick() {
    if (!user) return;
    setLoading(true); setMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: nick.trim() || null })
      .eq('id', user.id);
    if (error) setMsg(error.message);
    else setMsg('Ник обновлён');
    setLoading(false);
    fetchProfile(user.id);
  }

  return (
    <section
      aria-label="Авторизация"
      style="max-width:520px;margin:20px auto 10px;background:#171c2d;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;"
    >
      {!user ? (
        <>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            <button
              onClick={() => setMode('login')}
              disabled={mode === 'login'}
              style={`padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:${mode==='login'?'#263154':'#1e253a'};color:#cfe6ff;cursor:pointer;`}
            >
              Вход
            </button>
            <button
              onClick={() => setMode('register')}
              disabled={mode === 'register'}
              style={`padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:${mode==='register'?'#263154':'#1e253a'};color:#cfe6ff;cursor:pointer;`}
            >
              Регистрация
            </button>
          </div>

          {mode === 'register' && (
            <input
              type="text"
              placeholder="Никнейм (необязательно)"
              value={nick}
              onInput={(e: any) => setNick(e.target.value)}
              style="width:100%;margin:6px 0 8px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#0f1320;color:#e9eef7;"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onInput={(e: any) => setEmail(e.target.value)}
            style="width:100%;margin:6px 0;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#0f1320;color:#e9eef7;"
          />
          <input
            type="password"
            placeholder="Пароль"
            value={pass}
            onInput={(e: any) => setPass(e.target.value)}
            style="width:100%;margin:6px 0 10px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#0f1320;color:#e9eef7;"
          />

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button
              onClick={mode === 'login' ? onLogin : onRegister}
              disabled={loading}
              style="padding:8px 14px;border-radius:8px;background:#1e253a;color:#a3d9ff;border:1px solid rgba(255,255,255,.18);cursor:pointer;"
            >
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </div>

          {msg && <p style="margin:8px 0 0;color:#f3a5a5;">{msg}</p>}
        </>
      ) : (
        <>
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
            <div>
              <div style="opacity:.7;font-size:.9rem;">Вы вошли как</div>
              <div style="font-weight:600">{profile?.nickname || user.email}</div>
            </div>
            <button
              onClick={onLogout}
              style="padding:8px 12px;border-radius:8px;background:#1e253a;color:#a3d9ff;border:1px solid rgba(255,255,255,.18);cursor:pointer;"
            >
              Выйти
            </button>
          </div>

          <div style="margin-top:12px;">
            <label style="display:block;opacity:.8;margin-bottom:6px;">Никнейм</label>
            <div style="display:flex;gap:8px;">
              <input
                type="text"
                value={nick}
                onInput={(e: any) => setNick(e.target.value)}
                placeholder="Ваш ник"
                style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#0f1320;color:#e9eef7;"
              />
              <button
                onClick={saveNick}
                disabled={loading}
                style="padding:8px 12px;border-radius:8px;background:#1e253a;color:#a3d9ff;border:1px solid rgba(255,255,255,.18);cursor:pointer;white-space:nowrap;"
              >
                Сохранить
              </button>
            </div>
          </div>

          {msg && <p style="margin:8px 0 0;color:#a5f3c1;">{msg}</p>}
        </>
      )}
    </section>
  );
}
