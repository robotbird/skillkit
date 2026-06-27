import { useEffect, useState } from 'react';
import type { ToastState } from '../components/Toast';

export default function WarehouseView({ toast }: { toast: ToastState }) {
  const [root, setRoot] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRoot(await window.skillkit.getWarehouseRoot());
    } catch (e: any) {
      toast.show(`读取仓库目录失败：${e?.message ?? e}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function choose() {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await window.skillkit.pickWarehouseRoot();
      if (!picked) return; // 用户取消，保持现状
      const persisted = await window.skillkit.setWarehouseRoot(picked);
      setRoot(persisted);
      toast.show('仓库目录已更新');
    } catch (e: any) {
      toast.show(`设置失败：${e?.message ?? e}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="view-head">
        <div>
          <h1 className="view-title">仓库</h1>
          <p className="view-sub">
            所有 skill「原件」统一存放在这里。后续 clone 的开源仓库、纳入的本地目录都会放在此目录下，实现一处更新、处处生效。
          </p>
        </div>
      </div>

      <div className="install-grid is-single">
        <article className="install-card">
          <div className="install-icon">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path fill="currentColor" d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
            </svg>
          </div>
          <h2 className="install-title">仓库根目录</h2>
          <p className="install-desc">选择一个本地目录作为仓库根（默认 ~/GitHub）。原件集中存放于此，是软链接工作流的基础。</p>
          <div className="install-input">
            <input
              value={loading ? '加载中…' : root}
              readOnly
              placeholder="~/GitHub"
              title={root}
            />
            <button className="btn-primary" onClick={choose} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" /> 选择中
                </>
              ) : (
                '选择目录'
              )}
            </button>
          </div>
          <div className="install-hint">设置后，clone / 纳入已有目录 / 一键更新都会基于此目录</div>
        </article>

        <article className="install-card">
          <h2 className="install-title">仓库项目管理</h2>
          <p className="install-desc">clone 开源 Skills 仓库 · 纳入已有本地目录 · 一键拉取上游更新 —— 即将支持。</p>
        </article>
      </div>
    </section>
  );
}
