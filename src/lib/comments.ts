import { supabase } from "../lib/supabaseClient";

export type Role = 'user' | 'clanmate' | 'admin' | 'creator' | 'streamer';

export type Comment = {
  id: number;
  content: string;
  created_at: string;
  parent_id: number | null;
  author: { id: string; username: string | null; role: Role };
  likes: number;
  dislikes: number;
  pinned: boolean;
  allow_replies: boolean;
  allow_dislikes: boolean;
  children: Comment[];
};

export async function getMyProfile(): Promise<{ id: string; role: Role } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, role: (data.role ?? 'user') as Role };
}

export async function fetchCommentsTree(slug?: string): Promise<Comment[]> {
  // 1) базовые поля + автор
  const query = supabase
    .from("comments")
    .select(`
      id, content, created_at, parent_id, pinned, allow_replies, allow_dislikes, slug,
      author:author_id ( id, username, role )
    `)
    .order("created_at", { ascending: true });

  if (slug) query.eq('slug', slug);

  const { data: rows, error } = await query;
  if (error) throw error;

  // 2) счётчики
  const statsQ = supabase.from("comment_stats").select("*");
  const { data: stats, error: statsErr } = await statsQ;
  if (statsErr) throw statsErr;

  const statMap = new Map<number, { likes: number; dislikes: number }>();
  (stats ?? []).forEach((s: any) => statMap.set(s.comment_id, { likes: s.likes, dislikes: s.dislikes }));

  // 3) дерево
  const byId = new Map<number, Comment>();
  const roots: Comment[] = [];

  (rows ?? []).forEach((r: any) => {
    byId.set(r.id, {
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      parent_id: r.parent_id,
      author: {
        id: r.author?.id,
        username: r.author?.username,
        role: (r.author?.role ?? 'user') as Role
      },
      likes: statMap.get(r.id)?.likes ?? 0,
      dislikes: statMap.get(r.id)?.dislikes ?? 0,
      pinned: !!r.pinned,
      allow_replies: r.allow_replies ?? true,
      allow_dislikes: r.allow_dislikes ?? true,
      children: []
    });
  });

  byId.forEach((c) => {
    if (c.parent_id && byId.get(c.parent_id)) {
      byId.get(c.parent_id)!.children.push(c);
    } else {
      roots.push(c);
    }
  });

  // 4) сортировка: pinned сверху, потом по времени
  roots.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || a.created_at.localeCompare(b.created_at));
  return roots;
}

export async function sendComment({ content, parentId, slug }: { content: string; parentId: number | null; slug?: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Нужно войти.");

  const payload: any = { content, parent_id: parentId, author_id: user.id };
  if (slug) payload.slug = slug;

  const { error } = await supabase.from("comments").insert(payload);
  if (error) {
    if (error.code === '42501' || /policy|rls/i.test(error.message)) {
      throw new Error("Лимит: 1 комментарий каждые 5 минут или ответы закрыты.");
    }
    throw error;
  }
}

export async function upsertVote(commentId: number, value: 1 | -1) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Нужно войти.");

  const { error } = await supabase
    .from("comment_votes")
    .upsert({ comment_id: commentId, user_id: user.id, value }, { onConflict: "comment_id,user_id" });
  if (error) throw error;
}

export async function deleteComment(id: number) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

export async function togglePin(id: number, pinned: boolean) {
  const { error } = await supabase.from('comments').update({ pinned }).eq('id', id);
  if (error) throw error;
}

export async function toggleReplies(id: number, allow: boolean) {
  const { error } = await supabase.from('comments').update({ allow_replies: allow }).eq('id', id);
  if (error) throw error;
}

export async function toggleDislikes(id: number, allow: boolean) {
  const { error } = await supabase.from('comments').update({ allow_dislikes: allow }).eq('id', id);
  if (error) throw error;
}
