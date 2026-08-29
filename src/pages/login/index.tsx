import { useState, type CSSProperties, type ReactNode, type SubmitEvent as ReactSubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'

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

  const submit = (e: ReactSubmitEvent<HTMLFormElement>) => {
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
      {/* <header className='lg-top'>
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
      </header> */}

      {/* ===== 登录面板 ===== */}
      <main className='lg-main'>
        <div className='lg-panel'>
          {/* ---- 信号侧栏 ---- */}
          <aside className='lg-side' aria-hidden>
            <div className='lg-radar'>
              <span className='lg-radar-rings' />
              {/* <span className='lg-radar-cross' /> */}
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
      <footer className='lg-foot py-4'>
        <span>SIGNAL FEED · V0.1.0</span>
        <span className='lg-foot-sep' aria-hidden />
        <span>© 2026 FRAMECATCH</span>
      </footer>
    </section>
  )
}

export default Login
