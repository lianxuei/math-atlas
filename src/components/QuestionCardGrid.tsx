'use client';

import { useState, useEffect, useRef } from 'react';
import type { QuestionMetaLight } from '@/lib/questions';
import MathText from '@/components/MathText';
import DifficultyDots from './DifficultyDots';
import { clientEnv } from '@/lib/env';
import styles from './QuestionCardGrid.module.css';

interface QuestionCardGridProps {
  questions: QuestionMetaLight[];
  loadedContents: Record<number, Record<string, string>>;
  selectedQids: Set<number>;
  loadingQid: number | null;
  onToggleSelect: (qid: number) => void;
  onLoadContent: (qid: number) => void;
  onRefresh: (qid: number) => void;
}

export default function QuestionCardGrid({
  questions,
  loadedContents,
  selectedQids,
  loadingQid,
  onToggleSelect,
  onLoadContent,
  onRefresh,
}: QuestionCardGridProps) {
  const [expandedQid, setExpandedQid] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState<Record<number, boolean>>({});
  const loadedRef = useRef<Set<number>>(new Set());

  // 挂载时懒加载正文内容
  useEffect(() => {
    for (const q of questions) {
      if (!loadedContents[q.qid] && !loadedRef.current.has(q.qid)) {
        loadedRef.current.add(q.qid);
        onLoadContent(q.qid);
      }
    }
  }, [questions, loadedContents, onLoadContent]);

  const toggleExpand = (qid: number) => {
    setExpandedQid((prev) => (prev === qid ? null : qid));
  };

  const toggleSolution = (qid: number) => {
    setShowSolution((prev) => ({ ...prev, [qid]: !prev[qid] }));
  };

  if (questions.length === 0) {
    return <div className={styles.empty}>暂无题目</div>;
  }

  return (
    <div className={styles.grid}>
      {questions.map((q) => {
        const s = loadedContents[q.qid];
        const isLoading = loadingQid === q.qid;
        const isSelected = selectedQids.has(q.qid);
        const isExpanded = expandedQid === q.qid;
        const answerText = s?.['答案']?.trim() || '';
        // 答案简短显示（取第一行或前20字）
        const answerShort = answerText.split('\n')[0].slice(0, 30);

        return (
          <div
            key={q.qid}
            className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${isExpanded ? styles.cardExpanded : ''}`}
          >
            {/* 卡片头部 */}
            <div className={styles.cardHeader}>
              <label className={styles.checkLabel} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(q.qid)}
                />
              </label>
              <span className={styles.numBadge}>{q.number}</span>
              <span className={styles.typeBadge}>{q.type || '—'}</span>
              <DifficultyDots value={q.difficulty} />
              <div className={styles.headerActions}>
                <a
                  className={styles.iconBtn}
                  href={`obsidian://open?vault=${encodeURIComponent(clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject)}&file=${encodeURIComponent(q.filePath.replace(/\\/g, '/').split((clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject) + '/').pop() || '')}`}
                  title="在 Obsidian 中打开"
                  onClick={(e) => e.stopPropagation()}
                >
                  📝
                </a>
                <button
                  className={styles.iconBtn}
                  title="刷新此题"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh(q.qid);
                  }}
                >
                  🔄
                </button>
              </div>
            </div>

            {/* 题干预览区 */}
            <div
              className={`${styles.questionArea} ${isExpanded ? '' : styles.questionCollapsed}`}
              onClick={() => toggleExpand(q.qid)}
            >
              {isLoading && (
                <div className={styles.loading}>加载中...</div>
              )}
              {s?.['题目'] && <MathText text={s['题目']} />}
              {s?.['选项'] && <MathText text={s['选项']} />}
              {!s && !isLoading && (
                <div className={styles.noContent}>暂无内容</div>
              )}
            </div>

            {/* 展开后的解析/备注 */}
            {isExpanded && s && (
              <div className={styles.expandSection}>
                {s['我的备注'] && (
                  <div className={`${styles.detailNote} ${styles.detailNoteMine}`}>
                    <h4>📌 我的备注</h4>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                      {s['我的备注']}
                    </pre>
                  </div>
                )}
                {(s['AI 备注'] || s['AI备注']) && (
                  <div className={`${styles.detailNote} ${styles.detailNoteAI}`}>
                    <h4>AI 备注</h4>
                    <MathText text={s['AI 备注'] || s['AI备注']} />
                  </div>
                )}
                {s['解析'] && (
                  <div className={styles.detailSection}>
                    <h4 className={styles.foldTitle} onClick={() => toggleSolution(q.qid)}>
                      {showSolution[q.qid] ? '▼' : '▶'} 解析
                    </h4>
                    {showSolution[q.qid] && <MathText text={s['解析']} />}
                  </div>
                )}
              </div>
            )}

            {/* 知识点标签 */}
            {q.knowledge.length > 0 && (
              <div className={styles.knowledgeRow}>
                {q.knowledge.map((k, i) => (
                  <span key={i} className={styles.knowledgeTag}>{k}</span>
                ))}
              </div>
            )}

            {/* 答案徽章 */}
            {answerShort && (
              <div className={styles.answerRow}>
                <span className={styles.answerBadge}>答案: {answerShort}</span>
              </div>
            )}

            {/* 来源 */}
            <div className={styles.sourceRow}>{q.source}</div>
          </div>
        );
      })}
    </div>
  );
}
