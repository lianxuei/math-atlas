'use client';

interface DifficultyDotsProps {
  value: number; // 0 ~ 1
  max?: number;
}

/** 难度圆点显示：将 0~1 的数值映射为 max 个圆点（默认 5） */
export default function DifficultyDots({ value, max = 5 }: DifficultyDotsProps) {
  const filled = Math.min(max, Math.max(0, Math.round((value || 0) * max)));
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', lineHeight: 1 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: i < filled ? 'var(--accent)' : 'var(--border)',
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  );
}
