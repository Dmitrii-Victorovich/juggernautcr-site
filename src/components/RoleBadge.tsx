export function RoleBadge({ role }: { role: 'user'|'clanmate'|'admin'|'creator'|'streamer' }) {
  const map: Record<string, { label: string; className: string }> = {
    creator:  { label: 'Создатель', className: 'bg-purple-700' },
    admin:    { label: 'Админ',     className: 'bg-red-700' },
    clanmate: { label: 'Соклан',    className: 'bg-blue-700' },
    streamer: { label: 'Стример',   className: 'bg-pink-700' },
    user:     { label: '',          className: 'hidden' }, // без префикса
  };
  const { label, className } = map[role] ?? map.user;
  if (!label) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${className}`}>
      {label}
    </span>
  );
}
