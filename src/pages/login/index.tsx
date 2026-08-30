import { useState, type CSSProperties, type SubmitEvent as ReactSubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'
import { Background } from '@/components/background'
import { Field } from '@/components/field'
import { SignalPanel } from '@/components/signal-panel'
import styles from './index.module.scss'
const reveal = (d: string): CSSProperties => ({ '--d': d }) as CSSProperties

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
    <section className={`${styles.login} p-3 pb-0`}>
      {/* ===== 背景层 ===== */}
      <Background />

      {/* ===== 登录面板 ===== */}
      <main className={styles.main}>
        <div className={styles.panel}>
          {/* ---- 信号侧栏 ---- */}
          <SignalPanel />

          {/* ---- 表单 ---- */}
          <form className={styles.form} onSubmit={submit}>
            <p className={`s-kicker ${styles.reveal}`} style={reveal('80ms')}>
              /// ACCESS GATE
            </p>
            <h1 className={`lg-title ${styles.reveal}`} style={reveal('220ms')}>
              登录
            </h1>
            <p className={`${styles.sub} ${styles.reveal}`} style={reveal('340ms')}>
              输入凭证，接入你的下载控制台。
            </p>

            <div className={`${styles.fields} ${styles.reveal}`} style={reveal('460ms')}>
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
                  aria-label={show ? '隐藏密码' : '显示密码'}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </Field>
            </div>

            <button
              type='submit'
              className={`${styles.btn} ${styles.reveal}`}
              style={reveal('580ms')}
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className={styles.dot} aria-hidden />
                  正在验证
                </>
              ) : (
                <>
                  <LogIn size={16} strokeWidth={2.4} />
                  进入控制台
                </>
              )}
            </button>

            <p className={styles.hint} role='status'>
              {err || (busy ? '✦ 信号已握手 · 正在跳转…' : '')}
            </p>
          </form>
        </div>
      </main>

      {/* ===== 页脚 ===== */}
      <footer className={`${styles.foot} py-4`}>
        <span>SIGNAL FEED · V0.1.0</span>
        <span className={styles.sep} aria-hidden />
        <span>© 2026 FRAMECATCH</span>
      </footer>
    </section>
  )
}

export default Login
