/**
 * UI 基础组件 — 进度条 / 分段控制器 / 主题切换 / 复选框 / 统计徽章
 * 全部基于设计 token（App.css），深浅主题自适应
 */
import type { CSSProperties, ReactNode } from "react";
import { CheckIcon, MoonIcon, SpinnerIcon, SunIcon } from "./icons";

/* ---------- 进度条 ---------- */

export function ProgressBar({
  percent,
  indeterminate = false,
}: {
  /** 0-100；indeterminate 为 true 时忽略 */
  percent: number | null;
  indeterminate?: boolean;
}) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent ?? 0)}
    >
      <div
        className={`progress-fill ${indeterminate ? "is-indeterminate" : ""}`}
        style={{ width: indeterminate ? undefined : `${percent ?? 0}%` }}
      />
    </div>
  );
}

/* ---------- 分段控制器（滑动指示器） ---------- */

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      <span
        className="seg-pill"
        aria-hidden="true"
        style={
          {
            "--seg-count": options.length,
            transform: `translateX(${idx * 100}%)`,
          } as CSSProperties
        }
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`seg-item ${o.value === value ? "is-active" : ""}`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 主题切换 ---------- */

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "dark" | "light";
  onToggle: () => void;
}) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "切换到浅色模式" : "切换到深色模式"}
    >
      <span className="theme-toggle-icon" key={theme}>
        {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      </span>
    </button>
  );
}

/* ---------- 自定义复选框 ---------- */

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
}) {
  return (
    <label className={`checkbox ${disabled ? "is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkbox-box" aria-hidden="true">
        <CheckIcon size={12} strokeWidth={2.6} />
      </span>
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
}

/* ---------- 统计徽章 ---------- */

export function StatChip({
  icon,
  children,
  tone = "neutral",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "accent";
}) {
  return (
    <span className={`stat-chip stat-chip-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

/* ---------- 加载指示 ---------- */

export function Spinner({ size = 15 }: { size?: number }) {
  return <SpinnerIcon size={size} />;
}
