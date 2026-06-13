import { useEffect, useRef, useState, useCallback } from 'react';

export interface ToastState {
  show: (msg: string, kind?: 'info' | 'error', ms?: number) => void;
  props: { msg: string; kind: 'info' | 'error'; visible: boolean };
}

export function useToast(): ToastState {
  const [msg, setMsg] = useState('');
  const [kind, setKind] = useState<'info' | 'error'>('info');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string, k: 'info' | 'error' = 'info', ms = 2200) => {
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
  kind: 'info' | 'error';
  visible: boolean;
}) {
  return (
    <div className={`toast${visible ? ' show' : ''}${kind === 'error' ? ' error' : ''}`}>
      {msg}
    </div>
  );
}
