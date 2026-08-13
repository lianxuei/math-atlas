'use client';

import type { QuestionMetaLight } from '@/lib/questions';
import MathText from '@/components/MathText';
import { clientEnv } from '@/lib/env';
import styles from './QuestionPreview.module.css';

interface QuestionPreviewProps {
  question: QuestionMetaLight | null;
  sections: Record<string, string> | undefined;
  isLoading: boolean;
  showAnswer: boolean;
  showSolution: boolean;
  onToggleAnswer: () => void;
  onToggleSolution: () => void;
  onRefresh: (qid: number) => void;
}

export default function QuestionPreview({
  question,
  sections,
  isLoading,
  showAnswer,
  showSolution,
  onToggleAnswer,
  onToggleSolution,
  onRefresh,
}: QuestionPreviewProps) {
  // 未选中题目时显示水印占位
  if (!question) {
    return (
      <div className={styles.previewEmpty}>
        <div className={styles.watermarkText}>点击左侧题目预览</div>
      </div>
    );
  }

  const s = sections;
  const q = question;

  return (
    <div className={styles.previewWrap}>
      {/* 元信息栏 */}
      <div className={styles.previewMeta}>
        <div className={styles.metaLeft}>
          <strong>{q.source}</strong>
          <span className={styles.metaSep}>·</span>
          <span>{q.number}</span>
          <span className={styles.metaSep}>·</span>
          <span>{q.type}</span>
          <span className={styles.metaSep}>·</span>
          <span>{q.grade}</span>
          <span className={styles.metaSep}>·</span>
          <span>{q.exam_type}</span>
          <span className={styles.metaSep}>·</span>
          <span>难度 {q.difficulty}</span>
        </div>
        <div className={styles.metaRight}>
          <a
            className={styles.obsidianLink}
            href={`obsidian://open?vault=${encodeURIComponent(clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject)}&file=${encodeURIComponent(q.filePath.replace(/\\/g, '/').split((clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject) + '/').pop() || '')}`}
            title="在 Obsidian 中打开"
            onClick={(e) => e.stopPropagation()}
          >
            📝 Obsidian
          </a>
          <button
            className={styles.refreshBtn}
            title="刷新此题"
            onClick={() => onRefresh(q.qid)}
          >
            🔄
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className={styles.previewBody}>
        {isLoading && (
          <div className={styles.loading}>加载中...</div>
        )}

        {s && (
          <>
            {s['题目'] && (
              <div className={styles.detailSection}>
                <h3>题目</h3>
                <MathText text={s['题目']} />
              </div>
            )}

            {s['选项'] && (
              <div className={styles.detailSection}>
                <h3>选项</h3>
                <MathText text={s['选项']} />
              </div>
            )}

            {s['我的备注'] && (
              <div className={`${styles.detailNote} ${styles.detailNoteMine}`}>
                <h3>我的备注</h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, color: 'var(--text)' }}>
                  {s['我的备注']}
                </pre>
              </div>
            )}

            {(s['AI 备注'] || s['AI备注']) && (
              <div className={`${styles.detailNote} ${styles.detailNoteAI}`}>
                <h3>AI 备注</h3>
                <MathText text={s['AI 备注'] || s['AI备注']} />
              </div>
            )}

            {s['答案'] && (
              <div className={styles.detailSection}>
                <h3 className={styles.detailFold} onClick={onToggleAnswer}>
                  {showAnswer ? '▼' : '▶'} 答案
                </h3>
                {showAnswer && <MathText text={s['答案']} />}
              </div>
            )}

            {s['解析'] && (
              <div className={styles.detailSection}>
                <h3 className={styles.detailFold} onClick={onToggleSolution}>
                  {showSolution ? '▼' : '▶'} 解析
                </h3>
                {showSolution && <MathText text={s['解析']} />}
              </div>
            )}
          </>
        )}

        {!s && !isLoading && (
          <div className={styles.noContent}>暂无内容</div>
        )}
      </div>
    </div>
  );
}
