import { useState, useEffect, useRef } from 'react';

const STAGES = {
  generate: [
    { label: '准备作品设定', range: [0, 15] },
    { label: '整理最近章节', range: [15, 30] },
    { label: '调用 DeepSeek', range: [30, 45] },
    { label: '等待模型生成', range: [45, 85] },
    { label: '保存章节', range: [85, 95] },
  ],
  rewrite: [
    { label: '准备前文章节', range: [0, 15] },
    { label: '调用 DeepSeek', range: [15, 40] },
    { label: '生成重写版本', range: [40, 85] },
    { label: '保存候选版本', range: [85, 95] },
  ],
};

export default function GenerationProgress({ visible, mode, status, errorMessage, onComplete }) {
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState('');
  const [dots, setDots] = useState('');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 流式状态的点动画
  useEffect(() => {
    if (status !== 'streaming') return;
    const timer = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!visible) {
      setPercent(0);
      setLabel('');
      setDots('');
      return;
    }

    const timers = new Set();
    const addTimer = (id) => { timers.add(id); return id; };
    const clearAll = () => timers.forEach(t => { clearTimeout(t); clearInterval(t); });
    let cancelled = false;

    if (status === 'success') {
      setPercent(100);
      setLabel(mode === 'rewrite' ? '重写完成' : '生成完成');
      addTimer(setTimeout(() => { if (!cancelled) onCompleteRef.current?.(); }, 1500));
      return () => { cancelled = true; clearAll(); };
    }

    if (status === 'error' || status === 'streaming') {
      return () => { cancelled = true; clearAll(); };
    }

    // status === 'running'
    const stages = STAGES[mode] || STAGES.generate;
    setPercent(0);
    setLabel(stages[0].label);

    let currentStage = 0;

    const advanceToStage = (idx) => {
      if (cancelled || idx >= stages.length - 1) return;
      currentStage = idx;
      setPercent(stages[idx].range[0]);
      setLabel(stages[idx].label);

      if (idx < stages.length - 2) {
        setPercent(stages[idx].range[1]);
        addTimer(setTimeout(() => advanceToStage(idx + 1), 400));
      } else {
        let p = stages[idx].range[0];
        addTimer(setInterval(() => {
          if (cancelled) return;
          p = Math.min(p + Math.random() * 2 + 0.5, stages[idx].range[1]);
          setPercent(p);
        }, 400));
      }
    };

    addTimer(setTimeout(() => {
      if (cancelled) return;
      setPercent(stages[0].range[1]);
      addTimer(setTimeout(() => advanceToStage(1), 300));
    }, 200));

    return () => {
      cancelled = true;
      clearAll();
    };
  }, [visible, mode, status]);

  if (!visible) return null;

  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isStreaming = status === 'streaming';

  return (
    <div className={`gen-progress${isError ? ' gen-progress--error' : ''}${isSuccess ? ' gen-progress--success' : ''}${isStreaming ? ' gen-progress--streaming' : ''}`}>
      {isStreaming ? (
        <div className="gen-progress-label">
          正在生成{dots}
        </div>
      ) : (
        <>
          <div className="gen-progress-bar-track">
            <div className="gen-progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="gen-progress-label">
            {isError ? (errorMessage || '生成失败') : label}
          </div>
        </>
      )}
    </div>
  );
}
