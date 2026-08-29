import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, LogIn, RadioTower, User } from 'lucide-react'

const reveal = (d: string): CSSProperties => ({ '--d': d }) as CSSProperties

function Field({
  label,
  icon: Icon,
  children,
  ...rest
}: {
  label: string
  icon: typeof User
  children?: ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className='lg-field'>
      <span className='lg-field-label'>{label}</span>
      <div className='lg-input'>
        <Icon size={15} strokeWidth={2} className='lg-input-icon' />
        <input {...rest} />
        {children}
      </div>
    </label>
  )
}

const STATUS_LINES: [string, string][] = [
  ['STATION', '拾帧 · FRAMECATCH'],
  ['UPLINK', 'REQUIRED'],
  ['CIPHER', 'AES-256'],
  ['CHANNEL', 'PRIVATE'],
]

const Login = () => {
  const nav = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!user.trim() || !pass) {
      setErr('请填写用户名与密码以建立连接')
      return
    }
    setErr('')
    setBusy(true)
    window.setTimeout(() => nav('/'), 750)
  }

  return (
    <section className='lg-root p-3 pb-0'>
      {/* ===== 背景层 ===== */}
      <div className='lg-bg-grid' aria-hidden />
      <div className='lg-bg-noise' aria-hidden />
      <div className='lg-vignette' aria-hidden />

      {/* ===== 顶栏 ===== */}
      <header className='lg-top'>
        <div className='lg-brand'>
          <span className='lg-logo'>
            <RadioTower size={18} strokeWidth={2.2} />
          </span>
          <span className='lg-brand-text'>
            <b>拾帧</b>
            <i>FRAMECATCH</i>
          </span>
        </div>
        <span className='lg-top-status'>
          <span className='s-dot s-dot--amber lg-blink' aria-hidden />
          UPLINK STANDBY
        </span>
      </header>

      {/* ===== 登录面板 ===== */}
      <main className='lg-main'>
        <div className='lg-panel'>
          {/* ---- 信号侧栏 ---- */}
          <aside className='lg-side' aria-hidden>
            <div className='lg-radar'>
              <span className='lg-radar-rings' />
              <span className='lg-radar-cross' />
              <span className='lg-radar-sweep' />
            </div>
            <ul className='lg-status'>
              {STATUS_LINES.map(([k, v]) => (
                <li key={k}>
                  <span className='lg-st-k'>{k}</span>
                  <i className='lg-st-line' aria-hidden />
                  <span className='lg-st-v'>{v}</span>
                </li>
              ))}
            </ul>
          </aside>

          {/* ---- 表单 ---- */}
          <form className='lg-form' onSubmit={submit}>
            <p className='s-kicker lg-reveal' style={reveal('80ms')}>
              /// ACCESS GATE
            </p>
            <h1 className='lg-title lg-reveal' style={reveal('220ms')}>
              登录
            </h1>
            <p className='lg-sub lg-reveal' style={reveal('340ms')}>
              输入凭证，接入你的下载控制台。
            </p>

            <div className='lg-fields lg-reveal' style={reveal('460ms')}>
              <Field
                label='USER_ID'
                icon={User}
                value={user}
                onChange={(e) => {
                  setUser(e.target.value)
                  if (err) setErr('')
                }}
                placeholder='用户名'
                autoComplete='username'
                aria-label='用户名'
              />
              <Field
                label='PASSPHRASE'
                icon={Lock}
                type={show ? 'text' : 'password'}
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value)
                  if (err) setErr('')
                }}
                placeholder='密码'
                autoComplete='current-password'
                aria-label='密码'
              >
                <button
                  type='button'
                  className='lg-eye'
                  aria-label={show ? '隐藏密码' : '显示密码'}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </Field>
            </div>

            <button
              type='submit'
              className='lg-btn lg-reveal'
              style={reveal('580ms')}
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className='lg-btn-dot' aria-hidden />
                  正在验证
                </>
              ) : (
                <>
                  <LogIn size={16} strokeWidth={2.4} />
                  进入控制台
                </>
              )}
            </button>

            <p className='lg-hint' role='status'>
              {err || (busy ? '✦ 信号已握手 · 正在跳转…' : '')}
            </p>
          </form>
        </div>
      </main>

      {/* ===== 页脚 ===== */}
      <footer className='lg-foot py-2'>
        <span>SIGNAL FEED · V0.1.0</span>
        <span className='lg-foot-sep' aria-hidden />
        <span>© 2026 FRAMECATCH</span>
      </footer>

      <style>{`
        .lg-root {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-sizing: border-box;
          background: radial-gradient(120% 95% at 50% -8%, #111a2b 0%, #0a0e15 55%, #070a10 100%);
          color: var(--text);
          font-family: var(--ff-sans);
        }

        /* ---------- 背景层 ---------- */
        .lg-bg-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(148, 163, 190, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 190, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          -webkit-mask: radial-gradient(120% 100% at 50% 0%, #000 30%, transparent 78%);
          mask: radial-gradient(120% 100% at 50% 0%, #000 30%, transparent 78%);
        }
        .lg-bg-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
        }
        .lg-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(130% 110% at 50% 42%, transparent 55%, rgba(0, 0, 0, 0.45) 100%);
        }

        /* ---------- 顶栏 ---------- */
        .lg-top {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex: none;
        }
        .lg-brand { display: flex; align-items: center; gap: 12px; }
        .lg-logo {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border: 1px solid rgba(255, 176, 58, 0.5);
          border-radius: 10px;
          color: var(--amber);
          background: rgba(255, 176, 58, 0.08);
          box-shadow: inset 0 0 16px rgba(255, 176, 58, 0.12);
        }
        .lg-brand-text { display: flex; flex-direction: column; gap: 2px; }
        .lg-brand-text b { font-size: 15px; font-weight: 800; letter-spacing: 0.08em; line-height: 1; }
        .lg-brand-text i {
          font-style: normal;
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.24em;
          color: var(--muted);
        }
        .lg-top-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--ff-mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          color: var(--muted);
        }
        .lg-blink { animation: lg-blink 1.6s ease-in-out infinite; }
        @keyframes lg-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ---------- 主面板 ---------- */
        .lg-main {
          position: relative;
          z-index: 2;
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 0;
        }
        .lg-panel {
          display: flex;
          width: min(680px, 100%);
          max-height: 100%;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(10, 15, 24, 0.72);
          backdrop-filter: blur(12px);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }

        /* ---- 信号侧栏 ---- */
        .lg-side {
          flex: none;
          width: 240px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          padding: 28px 20px;
          border-right: 1px solid var(--line);
          background:
            linear-gradient(170deg, rgba(255, 176, 58, 0.05), transparent 55%),
            rgba(8, 12, 20, 0.5);
        }
        .lg-radar {
          position: relative;
          width: min(190px, 30vmin);
          aspect-ratio: 1;
          border-radius: 50%;
          -webkit-mask: radial-gradient(circle at 50% 50%, #000 55%, transparent 92%);
          mask: radial-gradient(circle at 50% 50%, #000 55%, transparent 92%);
        }
        .lg-radar-rings {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: repeating-radial-gradient(
            circle at 50% 50%,
            transparent 0 calc(20% - 1px),
            rgba(148, 163, 190, 0.14) calc(20% - 1px) 20%
          );
        }
        .lg-radar-cross {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            linear-gradient(rgba(148, 163, 190, 0.14) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 190, 0.14) 1px, transparent 1px);
          background-size: 100% 50%, 50% 100%;
          background-position: 50% 50%, 50% 50%;
          background-repeat: no-repeat;
        }
        .lg-radar-sweep {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 0deg, rgba(255, 176, 58, 0.35), rgba(255, 176, 58, 0) 75deg);
          animation: lg-sweep 7s linear infinite;
        }
        .lg-radar::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          translate: -50% -50%;
          border-radius: 50%;
          background: var(--amber);
          box-shadow: 0 0 12px 2px rgba(255, 176, 58, 0.5);
        }
        @keyframes lg-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .lg-status {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 11px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .lg-status li { display: flex; align-items: center; gap: 8px; }
        .lg-st-k {
          flex: none;
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          color: var(--faint);
        }
        .lg-st-line {
          flex: 1;
          height: 1px;
          background: rgba(148, 163, 190, 0.14);
        }
        .lg-st-v {
          flex: none;
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          color: var(--muted);
        }

        /* ---- 表单 ---- */
        .lg-form {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
          padding: 30px clamp(22px, 3.4vw, 40px);
        }
        .lg-title {
          margin: 4px 0 0;
          font-family: var(--ff-serif);
          font-size: clamp(30px, 4vw, 40px);
          font-weight: 900;
          letter-spacing: 0.05em;
          color: var(--text);
        }
        .lg-sub {
          margin: 0 0 16px;
          font-size: 13px;
          color: var(--muted);
        }

        .lg-fields { display: flex; flex-direction: column; gap: 14px; }
        .lg-field { display: flex; flex-direction: column; gap: 7px; }
        .lg-field-label {
          font-family: var(--ff-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--faint);
        }
        .lg-input {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 44px;
          padding: 0 12px;
          border: 1px solid rgba(148, 163, 190, 0.22);
          border-radius: 10px;
          background: rgba(12, 17, 27, 0.72);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lg-input:focus-within {
          border-color: rgba(255, 176, 58, 0.55);
          box-shadow: 0 0 0 4px rgba(255, 176, 58, 0.1);
        }
        .lg-input-icon { flex: none; color: var(--faint); }
        .lg-input input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          font-size: 14.5px;
          font-family: inherit;
          user-select: text;
        }
        .lg-input input::placeholder { color: var(--faint); }
        .lg-eye {
          flex: none;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border: none;
          background: transparent;
          color: var(--faint);
          cursor: pointer;
          border-radius: 6px;
          transition: color 0.18s;
        }
        .lg-eye:hover { color: var(--amber); }
        .lg-eye:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }

        .lg-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          height: 46px;
          margin-top: 18px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--amber-2), var(--amber));
          color: #1a1208;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.08em;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(255, 176, 58, 0.28);
          transition: transform 0.18s, box-shadow 0.25s, filter 0.25s;
        }
        .lg-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.06);
          box-shadow: 0 12px 30px rgba(255, 176, 58, 0.38);
        }
        .lg-btn:active:not(:disabled) { transform: translateY(0); }
        .lg-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .lg-btn:disabled { opacity: 0.75; cursor: progress; }
        .lg-btn-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #1a1208;
          animation: lg-blink 0.8s ease-in-out infinite;
        }

        .lg-hint {
          min-height: 18px;
          font-family: var(--ff-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--amber);
        }

        /* ---------- 页脚 ---------- */
        .lg-foot {
          position: relative;
          z-index: 2;
          flex: none;
          display: flex;
          align-items: center;
          gap: 12px;
          border-top: 1px solid var(--line);
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.2em;
          color: var(--faint);
        }
        .lg-foot-sep { width: 1px; height: 10px; background: rgba(148, 163, 190, 0.3); }

        /* ---------- 入场动效 ---------- */
        .lg-reveal {
          opacity: 0;
          animation: lg-rise 0.65s cubic-bezier(0.22, 0.9, 0.28, 1) var(--d, 0ms) both;
        }
        @keyframes lg-rise {
          from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          to { opacity: 1; transform: none; filter: blur(0); }
        }

        /* ---------- 矮窗口适配 ---------- */
        @media (max-height: 700px) {
          .lg-root { padding-top: 16px; padding-bottom: 14px; }
          .lg-main { padding: 16px 0; }
          .lg-side { width: 200px; gap: 16px; padding: 20px 16px; }
          .lg-radar { width: 130px; }
          .lg-form { gap: 6px; padding: 22px 30px; }
          .lg-fields { gap: 11px; }
          .lg-input { height: 40px; }
          .lg-btn { height: 42px; margin-top: 14px; }
          .lg-sub { margin-bottom: 12px; }
        }

        /* ---------- 窄窗口适配 ---------- */
        @media (max-width: 720px) {
          .lg-side { display: none; }
          .lg-panel { width: min(420px, 100%); }
        }
        @media (max-width: 400px) {
          .lg-root { padding: 18px 16px 14px; }
          .lg-top-status { display: none; }
        }

        /* ---------- 减少动效 ---------- */
        @media (prefers-reduced-motion: reduce) {
          .lg-radar-sweep,
          .lg-blink,
          .lg-btn-dot {
            animation: none !important;
          }
          .lg-reveal {
            animation: none !important;
            opacity: 1 !important;
            filter: none !important;
          }
        }
      `}</style>
    </section>
  )
}

export default Login
