const STORAGE_KEY = 'stock_blocked'

function block() {
  localStorage.setItem(STORAGE_KEY, '1')
  document.title = '访问被拒绝'
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#070b11;font-family:Outfit,sans-serif;text-align:center;padding:20px;box-sizing:border-box;">
      <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#ff188a,#ff6b9d);display:flex;align-items:center;justify-content:center;margin-bottom:24px;box-shadow:0 0 40px rgba(255,24,138,0.15);">
        <span style="color:#fff;font-size:28px;font-weight:700;">!!</span>
      </div>
      <h1 style="color:#e8eaed;font-size:20px;font-weight:600;margin:0 0 8px;letter-spacing:0.02em;">禁止恶意调试</h1>
      <p style="color:#5f6b7a;font-size:13px;margin:0 0 32px;max-width:320px;line-height:1.6;">检测到非法的调试行为，页面已被锁定。请关闭开发者工具后重新访问。</p>
      <div style="width:1px;height:40px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.06),transparent);"></div>
      <span style="color:#3a4050;font-size:10px;font-family:JetBrains Mono,monospace;letter-spacing:0.15em;margin-top:12px;">ACCESS DENIED</span>
    </div>
  `
  document.body.style.cssText = 'margin:0;background:#070b11;'
  throw new Error('access denied')
}

if (localStorage.getItem(STORAGE_KEY)) {
  block()
}

// keyboard shortcuts — use capture phase to intercept before any target element
document.addEventListener(
  'keydown',
  (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'C', 'J'].includes(e.key.toUpperCase())) ||
      (e.metaKey && e.altKey && ['I', 'C', 'J'].includes(e.key.toUpperCase()))
    ) {
      e.preventDefault()
      e.stopPropagation()
      block()
    }
  },
  { capture: true },
)

// context menu
document.addEventListener('contextmenu', (e) => e.preventDefault())

// devtools open detection.
// 1) 尺寸检测:PC 停靠式 DevTools 会让 outer/inner 差值变大。
//    注意:移动模拟模式下 outerWidth 也会被模拟成设备宽度,差值≈0,此检测失效。
// 2) debugger 计时检测:devtools 打开(含移动模拟、真机远程调试)时 debugger 语句
//    会暂停线程,恢复后耗时显著变长,据此识别,任何模式均有效。
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const threshold = 160
let devtoolsOpen = false
const flagBlock = () => {
  if (devtoolsOpen) return
  devtoolsOpen = true
  block()
}

setInterval(() => {
  const widthDiff = window.outerWidth - window.innerWidth
  const heightDiff = window.outerHeight - window.innerHeight
  if (widthDiff > threshold || (!isMobile && heightDiff > threshold)) {
    flagBlock()
  }
}, 1000)

setInterval(() => {
  const start = performance.now()
  debugger
  if (performance.now() - start > 50) {
    flagBlock()
  }
}, 500)

// console override
const noop = () => {}
const methods: ('log'|'info'|'warn'|'error'|'debug'|'dir'|'table'|'group'|'groupEnd')[] = [
  'log','info','warn','error','debug','dir','table','group','groupEnd'
]
methods.forEach((m) => { (console as any)[m] = noop })

// hijack toString to catch devtools inspect
const element = new Image()
Object.defineProperty(element, 'id', {
  get() {
    block()
  },
})
