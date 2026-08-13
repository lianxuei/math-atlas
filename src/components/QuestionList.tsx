'use client';

import type { QuestionMetaLight } from '@/lib/questions';
import DifficultyDots from './DifficultyDots';
import styles from './QuestionList.module.css';

interface QuestionListProps {
  questions: QuestionMetaLight[];
  selectedQids: Set<number>;
  previewQid: number | null;
  loadedContents: Record<number, Record<string, string>>;
  onToggleSelect: (qid: number) => void;
  onPreview: (qid: number) => void;
}

export default function QuestionList({
  questions,
  selectedQids,
  previewQid,
  loadedContents,
  onToggleSelect,
  onPreview,
}: QuestionListProps) {
  return (
    <div className={styles.listWrap}>
      {/* 表头 */}
      <div className={styles.listHeader}>
        <div className={styles.colCheck}></div>
        <div className={styles.colNum}>题号</div>
        <div className={styles.colType}>题型</div>
        <div className={styles.colDiff}>难度</div>
        <div className={styles.colKnowledge}>知识点</div>
        <div className={styles.colSource}>来源试卷</div>
        <div className={styles.colStatus}>状态</div>
      </div>

      {/* 列表行 */}
      <div className={styles.listBody}>
        {questions.length === 0 && (
          <div className={styles.empty}>暂无题目</div>
        )}
        {questions.map((q) => {
          const isSelected = selectedQids.has(q.qid);
          const isPreview = previewQid === q.qid;
          const s = loadedContents[q.qid];
          const hasNote = !!s?.['我的备注'];
          return (
            <div
              key={q.qid}
              className={`${styles.listRow} ${isPreview ? styles.rowActive : ''} ${isSelected ? styles.rowSelected : ''}`}
              onClick={() => onPreview(q.qid)}
            >
              <div className={styles.colCheck} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(q.qid)}
                />
              </div>
              <div className={styles.colNum}>{q.number}</div>
              <div className={styles.colType}>
                <span className={styles.typeBadge}>{q.type || '—'}</span>
              </div>
              <div className={styles.colDiff}>
                <DifficultyDots value={q.difficulty} />
              </div>
              <div className={styles.colKnowledge}>
                {q.knowledge.length > 0 ? q.knowledge.join('、') : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </div>
              <div className={styles.colSource}>{q.source}</div>
              <div className={styles.colStatus}>
                {hasNote && <span title="有备注">📌</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
