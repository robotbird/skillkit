import { useEffect, useRef, useState, useCallback } from 'react';

export interface ToastState {
  show: (msg: string, kind?: 'info' | 'success' | 'error', ms?: number) => void;
  props: { msg: string; kind: 'info' | 'success' | 'error'; visible: boolean };
}

export function useToast(): ToastState {
  const [msg, setMsg] = useState('');
  const [kind, setKind] = useState<'info' | 'success' | 'error'>('info');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string, k: 'info' | 'success' | 'error' = 'info', ms = 2200) => {
    setMsg(m);
    setKind(k);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), ms);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { show, props: { msg, kind, visible } };
}

export default function Toast({
  msg,
  kind,
  visible,
}: {
  msg: string;
  kind: 'info' | 'success' | 'error';
  visible: boolean;
}) {
  const tone = kind === 'error' ? ' error' : kind === 'success' ? ' success' : '';
  return (
    <div className={`toast${visible ? ' show' : ''}${tone}`}>
      {msg}
    </div>
  );
}
