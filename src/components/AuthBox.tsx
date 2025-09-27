/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

export default function AuthBox() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signUp(e: Event) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password: pass });
    setMsg(error ? error.message : 'Проверьте почту и подтвердите регистрацию.');
  }

  async function signIn(e: Event) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) setMsg(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ maxWidth: 420, margin: '16px auto', padding: 12 }}>
      {userId ? (
        <>
          <div style={{ marginBottom: 8 }}>Вы вошли: <code>{userId}</code></div>
          <button onClick={signOut}>Выйти</button>
        </>
      ) : (
        <form style={{ display: 'grid', gap: 8 }}>
          <input placeholder="Email" value={email} onInput={(e: any)=>setEmail(e.currentTarget.value)} />
          <input placeholder="Пароль" type="password" value={pass} onInput={(e: any)=>setPass(e.currentTarget.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={signIn}>Войти</button>
            <button onClick={signUp} type="button">Регистрация</button>
          </div>
          {msg && <div style={{ color:'crimson' }}>{msg}</div>}
        </form>
      )}
    </div>
  );
}
