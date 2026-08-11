'use client';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useCallback } from 'react';
import MathText from '@/components/MathText';
import styles from './page.module.css';
import { clientEnv } from '@/lib/env';

// ========== 新增：知识点表格解析 ==========
/**
 * 解析知识点表格文本
 * 输入示例：
 * 无理数	1	1	3	4.35%	2.5%
 * 二次根式的混合运算	3	2,16,22	25	13.04%	20.83%
 * 
 * 返回: { "1": ["无理数"], "2": ["二次根式的混合运算"], "16": ["二次根式的混合运算"], ... }
 */
function parseKnowledgeTable(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  if (!text.trim()) return result;

  const lines = text.trim().split('\n');

  for (const line of lines) {
    // 跳过空行和分隔符
    if (!line.trim() || line.startsWith('---') || line.startsWith('===')) continue;

    // 按制表符或多个空格拆分
    const cols = line.split(/\t+| {2,}/).map(s => s.trim()).filter(Boolean);

    if (cols.length < 3) continue;

    // 跳过表头行
    if (cols[0] === '知识点' || cols[0] === '考点' || cols[0].includes('知识')) {
      console.log('跳过表头:', cols[0]);
      continue;
    }

    const knowledgeName = cols[0];           // 知识点名称
    const numberStr = cols[2];               // 题号列，如 "1" 或 "2,16,22"

    console.log('解析行:', { knowledgeName, numberStr });

    // 解析题号（支持逗号分隔）
    const numbers = numberStr.split(/[,，]/).map(n => n.trim()).filter(Boolean);

    for (const num of numbers) {
      if (!result[num]) {
        result[num] = [];
      }
      if (!result[num].includes(knowledgeName)) {
        result[num].push(knowledgeName);
      }
    }
  }

  console.log('知识点解析结果:', result);
  return result;
}
// ========== 知识点解析结束 ==========

/**
 * 解析后的题目结构
 */
interface ParsedQuestion {
  sections: Record<string, string>;
  yaml: Record<string, any>;
  raw: string;
  body: string;
  startIndex: number;
  endIndex: number;
  remoteImages: string[];
}

/** 判断是否为远程图片链接（非本地路径） */
function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

/** 从文本中提取所有远程图片链接 */
function extractRemoteImages(text: string): string[] {
  const images: string[] = [];
  const mdImageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const urlImageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp)(?:\?[^\s]*)?)/gi;

  let match;
  while ((match = mdImageRegex.exec(text)) !== null) {
    if (isRemoteImageUrl(match[1])) {
      images.push(match[1]);
    }
  }

  urlImageRegex.lastIndex = 0;
  while ((match = urlImageRegex.exec(text)) !== null) {
    if (!images.includes(match[0]) && isRemoteImageUrl(match[0])) {
      images.push(match[0]);
    }
  }

  return [...new Set(images)];
}

/** 解析单道题的 YAML 和 sections */
function parseOneQuestion(trimmed: string): { yaml: Record<string, any>; body: string; sections: Record<string, string>; remoteImages: string[] } {
  let yaml: Record<string, any> = {};
  let body = trimmed;

  try {
    const fmMatch = trimmed.match(/^---\n([\s\S]*?)\n---\n/);
    if (fmMatch) {
      body = trimmed.slice(fmMatch[0].length);
      fmMatch[1].split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let val: any = line.slice(colonIdx + 1).trim();
          if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean);
          }
          yaml[key] = val;
        }
      });
    }
  } catch { /* 解析失败就忽略 */ }

  const sections: Record<string, string> = {};
  const parts = body.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## (.+?)\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const content = m[2].trim();
    if (title === '备注') {
      const subs = content.split(/\n(?=### )/);
      for (const sub of subs) {
        const sm = sub.match(/^### (.+?)\n([\s\S]*)$/);
        if (sm) sections[sm[1].trim()] = sm[2].trim();
      }
    } else {
      sections[title] = content;
    }
  }

  const allText = body + ' ' + Object.values(sections).join(' ');
  const remoteImages = extractRemoteImages(allText);

  return { yaml, body, sections, remoteImages };
}

function parseQuestions(text: string): ParsedQuestion[] {
  const results: ParsedQuestion[] = [];
  const sepRe = /\n?==========\n?/g;
  let blockStart = 0;
  let match: RegExpExecArray | null;

  while ((match = sepRe.exec(text)) !== null) {
    const blockEnd = match.index;
    const block = text.slice(blockStart, blockEnd).trim();
    if (block) {
      const parsed = parseOneQuestion(block);
      results.push({ ...parsed, raw: block, startIndex: blockStart, endIndex: blockEnd, remoteImages: parsed.remoteImages });
    }
    blockStart = match.index + match[0].length;
  }

  const lastBlock = text.slice(blockStart).trim();
  if (lastBlock) {
    const parsed = parseOneQuestion(lastBlock);
    results.push({ ...parsed, raw: lastBlock, startIndex: blockStart, endIndex: text.length, remoteImages: parsed.remoteImages });
  }

  return results;
}

export default function AddPage() {
  // ===== 状态管理 =====
  const [input, setInput] = useState('');
  const [source, setSource] = useState('');
  const [examType, setExamType] = useState('');
  const [defaultType, setDefaultType] = useState('');
  const router = useRouter();

  const [defaultGrade, setDefaultGrade] = useState(clientEnv.defaultGrade);
  const [defaultSemester, setDefaultSemester] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [conflictList, setConflictList] = useState<{ index: number; number: string; source: string; fileName: string }[] | null>(null);
  const pendingListRef = useRef<Record<string, any>[]>([]);

  // ========== 新增：知识点表格状态 ==========
  const [knowledgeInput, setKnowledgeInput] = useState('');
  const [showKnowledgeInput, setShowKnowledgeInput] = useState(false);
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, string[]>>({});
  // ========================================

  // ===== DOM 引用 =====
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ====================== 年级联动配置 ======================
  const semesterOptionsMap: Record<string, { value: string; label: string }[]> = {
    "初中": [
      { value: "七上", label: "七上" }, { value: "七下", label: "七下" },
      { value: "八上", label: "八上" }, { value: "八下", label: "八下" },
      { value: "九上", label: "九上" }, { value: "九下", label: "九下" },
    ],
    "高中": [
      { value: "高一上", label: "高一上" }, { value: "高一下", label: "高一下" },
      { value: "高二上", label: "高二上" }, { value: "高二下", label: "高二下" },
      { value: "高三上", label: "高三上" }, { value: "高三下", label: "高三下" },
    ]
  };
  const examTypeOptionsMap: Record<string, { value: string; label: string }[]> = {
    "初中": [
      { value: "中考真题", label: "中考真题" }, { value: "月考", label: "月考" },
      { value: "期中考试", label: "期中考试" }, { value: "期末考试", label: "期末考试" },
      { value: "模拟题", label: "模拟题" },
    ],
    "高中": [
      { value: "高考真题", label: "高考真题" }, { value: "月考", label: "月考" },
      { value: "期中考试", label: "期中考试" }, { value: "期末考试", label: "期末考试" },
      { value: "模拟题", label: "模拟题" },
    ]
  };

  const currentSemesterOptions = useMemo(() => semesterOptionsMap[defaultGrade] ?? [], [defaultGrade]);
  const currentExamTypeOptions = useMemo(() => examTypeOptionsMap[defaultGrade] ?? [], [defaultGrade]);

  const handleGradeChange = (val: string) => {
    setDefaultGrade(val);
    setDefaultSemester("");
    setExamType("");
  };

  // ========== 新增：解析知识点表格 ==========
  const handleParseKnowledge = () => {
    const map = parseKnowledgeTable(knowledgeInput);
    setKnowledgeMap(map);
    const totalItems = Object.keys(map).length;
    if (totalItems > 0) {
      setMessage(`✅ 已解析 ${totalItems} 道题的知识点，入库时将自动填充`);
    } else {
      setMessage('⚠️ 未能解析到知识点，请检查表格格式');
    }
  };
  // ======================================

  // ===== 图片上传 =====
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/images/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const imgLine = `\n![${file.name.split('.')[0] || 'img'}](images/${data.filename})\n`;
        setInput(prev => prev.slice(0, start) + imgLine + prev.slice(end));
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + imgLine.length;
        }, 50);
      }
    } catch {
      setMessage('❌ 图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  // ===== 下载远程图片 =====
  const downloadAndUploadRemoteImage = async (remoteUrl: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/download-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteUrl }),
      });
      if (!res.ok) {
        console.warn(`下载远程图片失败: ${remoteUrl}`);
        return null;
      }
      const data = await res.json();
      return `images/${data.filename}`;
    } catch (error) {
      console.error(`下载远程图片出错: ${remoteUrl}`, error);
      return null;
    }
  };

  // ===== 题目解析 =====
  const questions = useMemo(() => {
    if (!input.trim()) return [];
    return parseQuestions(input);
  }, [input]);

  const remoteImageCount = useMemo(() => {
    return questions.reduce((total, q) => total + q.remoteImages.length, 0);
  }, [questions]);

  // ===== 光标位置变化 → 高亮对应卡片 =====
  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || questions.length === 0) return;
    const pos = ta.selectionStart;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (pos >= q.startIndex && pos <= q.endIndex) {
        setHighlightedIndex(i);
        cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    setHighlightedIndex(null);
  }, [questions]);

  // ===== 点击预览卡片 → 跳转到原文 =====
  const handleCardClick = (index: number) => {
    const ta = textareaRef.current;
    if (!ta || index >= questions.length) return;
    const q = questions[index];
    ta.focus();
    ta.setSelectionRange(q.startIndex, q.endIndex);
    const textBefore = input.slice(0, q.startIndex);
    const lineCount = textBefore.split('\n').length;
    const totalLines = (input.match(/\n/g) || []).length + 1;
    const realLineHeight = ta.scrollHeight / totalLines;
    ta.scrollTop = Math.max(0, (lineCount - 3) * realLineHeight);
    const cardEl = cardRefs.current[index];
    cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHighlightedIndex(index);
  };

  // ========== 核心修改：buildQuestionList 中注入知识点 ==========
  const buildQuestionList = async (): Promise<Record<string, any>[] | null> => {
    const list: Record<string, any>[] = [];

    // 收集所有远程图片，全局去重
    const allRemoteImages = new Map<string, string>();
    for (const q of questions) {
      for (const imgUrl of q.remoteImages) {
        if (!allRemoteImages.has(imgUrl)) {
          allRemoteImages.set(imgUrl, '');
        }
      }
    }

    if (allRemoteImages.size > 0) {
      setDownloadingImages(true);
      setMessage(`🔄 正在下载 ${allRemoteImages.size} 张远程图片...`);
      for (const [remoteUrl] of allRemoteImages) {
        const localPath = await downloadAndUploadRemoteImage(remoteUrl);
        if (localPath) {
          allRemoteImages.set(remoteUrl, localPath);
        }
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const y = q.yaml;

      const finalType = y.type || defaultType;
      if (!finalType) {
        setMessage(`❌ 第 ${i + 1} 道题缺少题型（YAML 没写，页面也没选默认值）`);
        setDownloadingImages(false);
        return null;
      }

      // 替换远程图片
      let processedBody = q.body;
      for (const [remoteUrl, localPath] of allRemoteImages) {
        if (!localPath) continue;
        const escapedUrl = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        processedBody = processedBody.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g'),
          `![$1](${localPath})`
        );
        processedBody = processedBody.replace(new RegExp(escapedUrl, 'g'), localPath);
      }

      for (const key of Object.keys(q.sections)) {
        let sectionContent = q.sections[key];
        for (const [remoteUrl, localPath] of allRemoteImages) {
          if (!localPath) continue;
          const escapedUrl = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          sectionContent = sectionContent.replace(
            new RegExp(`!\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g'),
            `![$1](${localPath})`
          );
          sectionContent = sectionContent.replace(new RegExp(escapedUrl, 'g'), localPath);
        }
        q.sections[key] = sectionContent;
      }

      // ========== 核心修改：从知识点表格中获取知识点 ==========
      let finalKnowledge: string[] = Array.isArray(y.knowledge) ? y.knowledge : [];

      // 获取当前题目的题号（去掉可能的 T 前缀，用于匹配表格）
      const rawNumber = y.number || '';  // 如 "T1"
      const questionNumber = rawNumber.replace(/^T/i, '');  // 变成 "1"

      // 如果 YAML 中没写知识点，且知识点表格中有对应题号，则自动填充
      if (finalKnowledge.length === 0 && questionNumber && knowledgeMap[questionNumber]) {
        finalKnowledge = knowledgeMap[questionNumber];
      }
      // 如果 YAML 中写了知识点，但表格中也有，就合并（去重）
      else if (questionNumber && knowledgeMap[questionNumber]) {
        for (const k of knowledgeMap[questionNumber]) {
          if (!finalKnowledge.includes(k)) {
            finalKnowledge.push(k);
          }
        }
      }

      console.log(`题目 ${rawNumber}: 最终知识点 =`, finalKnowledge);
      // ==========================================

      list.push({
        source: y.source || source.trim(),
        number: rawNumber,  // 保留原始题号（如 "T1"）
        type: finalType,
        grade: y.grade || defaultGrade,
        semester: y.semester || defaultSemester,
        exam_type: y.exam_type || examType,
        difficulty: y.difficulty != null && y.difficulty !== '' ? Number(y.difficulty) : null,
        knowledge: finalKnowledge,  // 使用合并后的知识点
        tags: Array.isArray(y.tags) ? y.tags : [],
        content: processedBody,
        originalRemoteImages: q.remoteImages,
      });
    }

    setDownloadingImages(false);
    return list;
  };

  // ===== 实际执行写入 =====
  const doSave = async (list: Record<string, any>[], onConflict: string) => {
    setSaving(true);
    setConflictList(null);
    setMessage('');
    try {
      const res = await fetch('/api/add-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: list, action: 'write', onConflict }),
      });
      const data = await res.json();
      if (res.ok) {
        const written = data.results.filter((r: any) => !r.skipped).length;
        const skipped = data.results.filter((r: any) => r.skipped).length;
        let msg = `✅ 成功入库 ${written} 道题`;
        if (skipped > 0) msg += `，跳过 ${skipped} 道（文件已存在）`;
        const totalImages = list.reduce((total, q) => total + (q.originalRemoteImages?.length || 0), 0);
        if (totalImages > 0) msg += `，已下载并替换 ${totalImages} 张远程图片`;
        const knowledgeCount = Object.keys(knowledgeMap).length;
        if (knowledgeCount > 0) msg += `，已填充 ${knowledgeCount} 道题的知识点`;
        setMessage(msg);
        setInput('');
        setKnowledgeInput('');
        setKnowledgeMap({});
        setHighlightedIndex(null);
      } else {
        setMessage(`❌ ${data.error || '入库失败'}`);
      }
    } catch {
      setMessage('❌ 网络错误');
    } finally {
      setSaving(false);
    }
  };

  // ===== 入库入口 =====
  const handleSave = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }

    const list = await buildQuestionList();
    if (!list) { setSaving(false); return; }

    setSaving(true);
    setMessage('');

    try {
      const checkRes = await fetch('/api/add-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: list, action: 'check' }),
      });
      const checkData = await checkRes.json();
      const conflicts: { index: number; number: string; source: string; fileName: string }[] = checkData.conflicts || [];

      if (conflicts.length === 0) {
        await doSave(list, 'overwrite');
      } else {
        pendingListRef.current = list;
        setConflictList(conflicts);
        setSaving(false);
      }
    } catch {
      setMessage('❌ 网络错误');
      setSaving(false);
    }
  };

  // ===== 界面 =====
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>添加题目</h1>

      {/* 顶部元数据设置栏 */}
      <div className={styles.metaBar}>
        <label className={styles.metaLabel}>
          来源
          <input className={styles.metaInput} placeholder="留空则取 YAML 中的来源" value={source} onChange={e => setSource(e.target.value)} />
        </label>
        <label className={styles.metaLabel}>
          年级
          <select className={styles.metaSelect} value={defaultGrade} onChange={e => handleGradeChange(e.target.value)}>
            {clientEnv.gradeList.map((item) => (<option key={item} value={item}>{item}</option>))}
          </select>
        </label>
        <label className={styles.metaLabel}>
          学期
          <select className={styles.metaSelect} value={defaultSemester} onChange={e => setDefaultSemester(e.target.value)}>
            <option value="">（不设默认）</option>
            {currentSemesterOptions.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
          </select>
        </label>
        <label className={styles.metaLabel}>
          类别
          <select className={styles.metaSelect} value={examType} onChange={e => setExamType(e.target.value)}>
            <option value="练习题">练习题</option>
            {currentExamTypeOptions.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
          </select>
        </label>
        <label className={styles.metaLabel}>
          题型
          <select className={styles.metaSelect} value={defaultType} onChange={e => setDefaultType(e.target.value)}>
            <option value="">（不设默认）</option>
            <option value="单选题">单选题</option>
            <option value="多选题">多选题</option>
            <option value="填空题">填空题</option>
            <option value="解答题">解答题</option>
          </select>
        </label>

        {/* ========== 新增：知识点表格按钮 ========== */}
        <button
          type="button"
          className={styles.knowledgeBtn}
          onClick={() => setShowKnowledgeInput(!showKnowledgeInput)}
          title="粘贴知识点表格"
        >
          📋 知识点
        </button>
        {/* ===================================== */}

        {remoteImageCount > 0 && (
          <div className={styles.remoteImageHint}>🌐 检测到 {remoteImageCount} 张远程图片，入库时将自动下载</div>
        )}

        {/* ========== 新增：已解析知识点提示 ========== */}
        {Object.keys(knowledgeMap).length > 0 && (
          <div className={styles.remoteImageHint} style={{ background: '#d4edda', color: '#155724', borderColor: '#28a745' }}>
            ✅ 已匹配 {Object.keys(knowledgeMap).length} 道题的知识点
          </div>
        )}
        {/* ===================================== */}

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving || downloadingImages}>
          {downloadingImages ? '下载图片中...' : saving ? '入库中...' : `确认入库 (${questions.length} 题)`}
        </button>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.65rem 1.4rem', border: '1px solid #999', borderRadius: '8px',
            backgroundColor: 'transparent', fontSize: '0.92rem', cursor: 'pointer',
            transition: '0.2s all', display: 'inline-flex', alignItems: 'center', gap: '6px'
          }}
          onMouseOver={(e) => { const btn = e.target as HTMLButtonElement; btn.style.background = '#edf2ff'; btn.style.borderColor = 'var(--accent)'; }}
          onMouseOut={(e) => { const btn = e.target as HTMLButtonElement; btn.style.background = 'transparent'; btn.style.borderColor = '#999'; }}
        >
          ← 返回首页
        </button>
      </div>

      {/* ========== 新增：知识点表格输入区 ========== */}
      {showKnowledgeInput && (
        <div className={styles.knowledgePanel}>
          <div className={styles.panelHeader}>
            知识点表格（题号列在第三列）
            <button
              className={styles.knowledgeParseBtn}
              onClick={handleParseKnowledge}
            >
              解析表格
            </button>
          </div>
          <textarea
            className={styles.knowledgeTextarea}
            placeholder={`粘贴知识点表格，格式示例：
知识点	题量	题号	分值	题量占比	分值占比
无理数	1	1	3	4.35%	2.5%
二次根式的混合运算	3	2,16,22	25	13.04%	20.83%
勾股数	1	3	3	4.35%	2.5%
勾股定理	3	4,9,23	16	13.04%	13.33%

该格式直接复制于箐优网的分析-知识点分析
解析后会自动匹配题号，入库时填充 knowledge 字段`}
            value={knowledgeInput}
            onChange={e => setKnowledgeInput(e.target.value)}
            rows={6}
          />
          {Object.keys(knowledgeMap).length > 0 && (
            <div className={styles.knowledgePreview}>
              <strong>已解析的知识点：</strong>
              {Object.entries(knowledgeMap).map(([num, knowledges]) => (
                <div key={num} className={styles.knowledgeItem}>
                  <span className={styles.knowledgeNum}>T{num}:</span>
                  {knowledges.join('、')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ===================================== */}

      {/* 提示消息 */}
      {message && (
        <div className={message.startsWith('✅') || message.startsWith('⚠') || message.startsWith('🔄') ? styles.msgOk : styles.msgErr}>
          {message}
        </div>
      )}

      {/* 冲突弹窗 */}
      {conflictList && conflictList.length > 0 && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>⚠️ 文件冲突</div>
            <div className={styles.dialogBody}>
              以下 {conflictList.length} 道题的文件已存在：
              <ul className={styles.conflictList}>
                {conflictList.map((c, i) => (<li key={i}>{c.fileName}</li>))}
              </ul>
              请选择处理方式：
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogBtnSecondary} onClick={() => setConflictList(null)}>取消</button>
              <button className={styles.dialogBtnSecondary} onClick={() => doSave(pendingListRef.current, 'skip')}>跳过已存在的</button>
              <button className={styles.dialogBtnPrimary} onClick={() => doSave(pendingListRef.current, 'overwrite')}>覆盖全部</button>
            </div>
          </div>
        </div>
      )}

      {/* 双栏：左输入，右预览 */}
      <div className={styles.columns}>
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            粘贴区
            <label className={styles.uploadBtn}>
              {uploading ? '上传中...' : '📷 上传图片'}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            </label>
          </div>
          <textarea ref={textareaRef} className={styles.textarea}
            placeholder={`粘贴 AI 格式化好的题目…`}
            value={input} onChange={e => setInput(e.target.value)}
            onMouseUp={handleCursorMove} onKeyUp={handleCursorMove}
            onPaste={e => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (file) handleUpload(file);
                  return;
                }
              }
            }}
          />
        </div>

        {/* 右侧：预览区 */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>预览 ({questions.length} 题)</div>
          <div className={styles.previewList}>
            {questions.length === 0 ? (
              <div className={styles.empty}>粘贴题目后在此预览</div>
            ) : (
              questions.map((q, i) => (
                <div key={i} ref={el => { cardRefs.current[i] = el; }}
                  className={`${styles.card} ${highlightedIndex === i ? styles.cardHighlighted : ''}`}
                  onClick={() => handleCardClick(i)} title={`点击跳转到原文第 ${q.startIndex + 1} 个字符`}>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardIdx}>{q.yaml.number || `T${i + 1}`}</span>
                    {(() => {
                      const src = q.yaml.source || source.trim();
                      if (src) return <span className={styles.yamlTag}>{src}</span>;
                      return null;
                    })()}
                    <span className={styles.cardType}>{q.yaml.type || defaultType || '?'}</span>
                    {(() => {
                      const y = q.yaml;
                      const vals: string[] = [];
                      vals.push(y.grade || defaultGrade);
                      const sem = y.semester || defaultSemester;
                      if (sem) vals.push(sem);
                      const et = y.exam_type || examType;
                      if (et) vals.push(et);
                      const diff = y.difficulty;
                      if (diff != null && diff !== '') vals.push(String(diff));
                      return vals.map((v, j) => (<span key={j} className={styles.yamlTag}>{v}</span>));
                    })()}
                    {q.remoteImages.length > 0 && (
                      <span className={styles.remoteTag} title="入库时将自动下载远程图片">🌐 {q.remoteImages.length}</span>
                    )}
                    {/* ========== 新增：显示匹配的知识点（修复题号匹配） ========== */}
                    {(() => {
                      const rawNum = q.yaml.number || '';
                      const num = rawNum.replace(/^T/i, '');  // 去掉 T 前缀
                      if (num && knowledgeMap[num]) {
                        return <span className={styles.knowledgeTag} title={`知识点: ${knowledgeMap[num].join('、')}`}>📚 {knowledgeMap[num].length}</span>;
                      }
                      return null;
                    })()}
                    {/* ===================================== */}
                  </div>
                  {q.sections['题目'] && (<div className={styles.cardSection}><MathText text={q.sections['题目']} /></div>)}
                  {q.sections['选项'] && (<div className={styles.cardOption}><MathText text={q.sections['选项']} /></div>)}
                  {q.sections['答案'] && (<div className={styles.cardAnswer}><strong>答案：</strong><MathText text={q.sections['答案']} /></div>)}
                  {q.sections['解析'] && (<details className={styles.cardDetail}><summary>解析</summary><MathText text={q.sections['解析']} /></details>)}
                  {q.remoteImages.length > 0 && (
                    <details className={styles.cardDetail} style={{ fontSize: '0.8rem', color: '#666' }}>
                      <summary>🌐 远程图片 ({q.remoteImages.length})</summary>
                      {q.remoteImages.map((url, idx) => (<div key={idx} style={{ wordBreak: 'break-all', marginBottom: '4px' }}>{url}</div>))}
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}