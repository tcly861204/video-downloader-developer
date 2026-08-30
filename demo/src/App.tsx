import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { sign_datail } from "./lib/abogus";
import {
  AlertIcon,
  BoltIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  HeartIcon,
  LayersIcon,
  MessageIcon,
  PlayIcon,
  RefreshIcon,
  SparklesIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "./components/icons";
import { Checkbox, ProgressBar, SegmentedControl, Spinner, StatChip, ThemeToggle } from "./components/ui";
import "./App.css";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ============================================================
// 类型定义
// ============================================================

interface VideoInfo {
  awemeId: string;
  title: string;
  desc: string;
  author: string;
  durationMs: number;
  cover: string;
  playUrl: string;
}

interface Progress {
  downloaded: number;
  total: number;
}

interface PostItem {
  awemeId: string;
  desc: string;
  author: string;
  durationMs: number;
  cover: string;
  createTime: number;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  playCount: number;
}

interface PostListResult {
  items: PostItem[];
  hasMore: boolean;
  maxCursor: number;
}

interface BatchProgress {
  current: number;
  total: number;
  awemeId: string;
  desc: string;
  status: string;
  error: string | null;
}

type Stage = "idle" | "parsing" | "parsed" | "downloading" | "done";
type Mode = "single" | "batch";
type BatchStage = "idle" | "loading" | "loaded" | "downloading" | "done";
type Theme = "dark" | "light";

// ============================================================
// 工具函数
// ============================================================

function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function formatDuration(ms: number): string {
  if (!ms) return "--:--";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function extractSecUserId(text: string): string | null {
  const match = text.match(/\/user\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function readTheme(): Theme {
  try {
    return localStorage.getItem("dy-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

// ============================================================
// 主组件
// ============================================================

export default function App() {
  const [mode, setMode] = useState<Mode>("single");
  const [theme, setTheme] = useState<Theme>(readTheme);

  // 单个下载状态
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [savedPath, setSavedPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [thunderMsg, setThunderMsg] = useState("");

  // 批量下载状态
  const [batchInput, setBatchInput] = useState("");
  const [batchStage, setBatchStage] = useState<BatchStage>("idle");
  const [batchError, setBatchError] = useState("");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [maxCursor, setMaxCursor] = useState(0);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [itemStatuses, setItemStatuses] = useState<Record<string, string>>({});
  const [batchDoneCount, setBatchDoneCount] = useState(0);
  const [batchFailCount, setBatchFailCount] = useState(0);

  // 共享状态
  const [saveDir, setSaveDir] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("dy-theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    invoke<string>("get_default_dir").then(setSaveDir).catch(() => {});
    const unlistenProgress = listen<Progress>("download-progress", (e) => {
      setProgress(e.payload);
    });
    const unlistenBatch = listen<BatchProgress>("batch-progress", (e) => {
      const p = e.payload;
      setBatchProgress(p);
      setItemStatuses((prev) => ({ ...prev, [p.awemeId]: p.status }));
      if (p.status === "done") setBatchDoneCount((c) => c + 1);
      if (p.status === "error") setBatchFailCount((c) => c + 1);
    });
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenBatch.then((fn) => fn());
    };
  }, []);

  // ============================================================
  // 单个下载逻辑
  // ============================================================

  const handleParse = async () => {
    if (!input.trim()) {
      setError("请先粘贴抖音/快手分享链接");
      return;
    }
    setError("");
    setInfo(null);
    setSavedPath("");
    setProgress(null);
    setStage("parsing");
    try {
      const result = await invoke<VideoInfo>("parse_video", { text: input });
      setInfo(result);
      setStage("parsed");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      setStage("idle");
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    setError("");
    setProgress({ downloaded: 0, total: 0 });
    setStage("downloading");
    try {
      const path = await invoke<string>("download_video", {
        playUrl: info.playUrl,
        title: info.title,
        awemeId: info.awemeId,
        saveDir,
      });
      setSavedPath(path);
      setStage("done");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      setStage("parsed");
    }
  };

  const handleThunderDownload = () => {
    if (!info) return;
    setError("");
    try {
      const encoded = btoa(`AA${info.playUrl}ZZ`);
      const link = document.createElement("a");
      link.href = `thunder://${encoded}`;
      link.click();
      setThunderMsg("已发送到迅雷，请在迅雷中查看下载进度");
    } catch {
      setThunderMsg("");
      setError("调用迅雷失败，请确认已安装迅雷");
    }
  };

  const handleOpenDir = async () => {
    if (!savedPath) return;
    try {
      await revealItemInDir(savedPath);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const handleCopyDesc = async () => {
    if (!info?.desc) return;
    try {
      await navigator.clipboard.writeText(info.desc);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选中文案后 Ctrl+C");
    }
  };

  const handleSaveDesc = async () => {
    if (!info?.desc) return;
    try {
      await invoke("save_desc", { desc: info.desc, title: info.title, saveDir });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const handleReset = () => {
    setInput("");
    setInfo(null);
    setStage("idle");
    setError("");
    setProgress(null);
    setSavedPath("");
    setThunderMsg("");
  };

  // ============================================================
  // 批量下载逻辑
  // ============================================================

  const handleParseUser = async () => {
    const secUserId = extractSecUserId(batchInput);
    if (!secUserId) {
      setBatchError("请粘贴抖音用户主页链接（包含 /user/ 路径）");
      return;
    }
    setBatchError("");
    setPosts([]);
    setSelectedIds(new Set());
    setItemStatuses({});
    setBatchDoneCount(0);
    setBatchFailCount(0);
    setBatchStage("loading");
    try {
      const params = `device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=${secUserId}&max_cursor=0&count=20`;
      const aBogus = sign_datail(params, UA);
      const result = await invoke<PostListResult>("fetch_user_posts", {
        secUserId,
        aBogus,
        maxCursor: null,
      });
      setPosts(result.items);
      setHasMore(result.hasMore);
      setMaxCursor(result.maxCursor);
      setSelectedIds(new Set(result.items.map((i) => i.awemeId)));
      setBatchStage("loaded");
    } catch (e) {
      setBatchError(typeof e === "string" ? e : String(e));
      setBatchStage("idle");
    }
  };

  const handleLoadMore = async () => {
    const secUserId = extractSecUserId(batchInput);
    if (!secUserId) return;
    setBatchStage("loading");
    try {
      const params = `device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=${secUserId}&max_cursor=${maxCursor}&count=20`;
      const aBogus = sign_datail(params, UA);
      const result = await invoke<PostListResult>("fetch_user_posts", {
        secUserId,
        aBogus,
        maxCursor,
      });
      setPosts((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setMaxCursor(result.maxCursor);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        result.items.forEach((i) => next.add(i.awemeId));
        return next;
      });
      setBatchStage("loaded");
    } catch (e) {
      setBatchError(typeof e === "string" ? e : String(e));
      setBatchStage("loaded");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.awemeId)));
    }
  };

  const handleBatchDownload = async () => {
    const selected = posts.filter((p) => selectedIds.has(p.awemeId));
    if (selected.length === 0) {
      setBatchError("请先选择要下载的视频");
      return;
    }
    setBatchError("");
    setBatchStage("downloading");
    setBatchDoneCount(0);
    setBatchFailCount(0);
    setItemStatuses({});
    setBatchProgress(null);
    try {
      await invoke("batch_download", {
        items: selected.map((p) => ({ awemeId: p.awemeId, desc: p.desc })),
        saveDir,
      });
      setBatchStage("done");
    } catch (e) {
      setBatchError(typeof e === "string" ? e : String(e));
      setBatchStage("loaded");
    }
  };

  const handleBatchReset = () => {
    setBatchInput("");
    setPosts([]);
    setSelectedIds(new Set());
    setBatchStage("idle");
    setBatchError("");
    setBatchProgress(null);
    setItemStatuses({});
    setBatchDoneCount(0);
    setBatchFailCount(0);
  };

  const handleChooseDir = async () => {
    try {
      const selected = await openDialog({ directory: true, defaultPath: saveDir || undefined });
      if (typeof selected === "string") setSaveDir(selected);
    } catch {}
  };

  // ============================================================
  // 渲染
  // ============================================================

  const percent =
    progress && progress.total > 0
      ? Math.min(100, (progress.downloaded / progress.total) * 100)
      : null;

  const isBatchBusy = batchStage === "loading" || batchStage === "downloading";
  const isSingleBusy = stage === "parsing" || stage === "downloading";

  return (
    <div className="app">
      {/* ---------- 顶栏 ---------- */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <PlayIcon size={17} />
          </span>
          <div className="brand-text">
            <h1 className="brand-name" data-text="短视频下载工具">
              短视频下载工具
            </h1>
            <p className="brand-sub">抖音 / 快手 · 无水印解析 · 主页批量下载</p>
          </div>
        </div>
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
      </header>

      {/* ---------- 模式切换 ---------- */}
      <SegmentedControl<Mode>
        ariaLabel="下载模式"
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: "单个下载", icon: <PlayIcon size={13} /> },
          { value: "batch", label: "批量下载", icon: <LayersIcon size={13} /> },
        ]}
      />

      <main className="app-main">
        {/* ==================== 单个下载 ==================== */}
        {mode === "single" && (
          <>
            <section className="panel">
              <div className="panel-head">
                <span className="panel-label">视频链接</span>
                <div className="chips">
                  <span className="chip chip-douyin">抖音</span>
                  <span className="chip chip-kuaishou">快手</span>
                </div>
              </div>
              <textarea
                className="link-input"
                placeholder={
                  "粘贴分享文本或链接，例如：\n抖音：7.94 复制打开抖音… https://v.douyin.com/xxxx/\n快手：复制打开快手… https://v.kuaishou.com/xxxx/"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isSingleBusy}
                rows={3}
              />
              <div className="panel-actions">
                <button className="btn btn-primary" onClick={handleParse} disabled={isSingleBusy}>
                  {stage === "parsing" ? (
                    <>
                      <Spinner /> 解析中…
                    </>
                  ) : (
                    <>
                      <SparklesIcon size={15} /> 解析视频
                    </>
                  )}
                </button>
                {stage !== "idle" && (
                  <button className="btn btn-ghost" onClick={handleReset}>
                    <TrashIcon size={14} /> 清空
                  </button>
                )}
              </div>
              {stage === "idle" && (
                <ol className="steps">
                  <li>
                    <i>1</i>粘贴链接
                  </li>
                  <li>
                    <i>2</i>解析信息
                  </li>
                  <li>
                    <i>3</i>下载无水印
                  </li>
                </ol>
              )}
            </section>

            {error && (
              <div className="banner banner-error" role="alert">
                <AlertIcon size={15} />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <section className="panel video-panel">
                <div className="cover-frame">
                  {info.cover ? (
                    <img
                      src={info.cover}
                      alt="视频封面"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.25";
                      }}
                    />
                  ) : (
                    <div className="cover-empty">无封面</div>
                  )}
                  <span className="cover-badge">
                    <ClockIcon size={11} />
                    {formatDuration(info.durationMs)}
                  </span>
                </div>

                <div className="video-meta">
                  <h2 className="video-title">{info.title || "（无标题）"}</h2>
                  <p className="video-author">
                    <span className="handle">
                      <UserIcon size={13} />@{info.author}
                    </span>
                    <span className="dot-sep" aria-hidden="true" />
                    ID {info.awemeId}
                  </p>

                  {stage === "downloading" && progress && (
                    <div className="video-progress">
                      <ProgressBar percent={percent} indeterminate={percent === null} />
                      <p className="progress-text">
                        {formatSize(progress.downloaded)}
                        {progress.total > 0 && ` / ${formatSize(progress.total)}`}
                        {percent !== null && `（${percent.toFixed(1)}%）`}
                      </p>
                    </div>
                  )}

                  {stage === "done" && (
                    <p className="done-text">
                      <CheckIcon size={14} />
                      已保存到：{savedPath}
                    </p>
                  )}

                  {info.desc && (
                    <div className="desc-block">
                      <div className="desc-head">
                        <span className="desc-title">
                          <FileTextIcon size={13} />
                          视频文案
                        </span>
                        <span className="desc-actions">
                          <button className="mini-btn" onClick={handleCopyDesc}>
                            {copied ? (
                              <>
                                <CheckIcon size={12} /> 已复制
                              </>
                            ) : (
                              <>
                                <CopyIcon size={12} /> 复制
                              </>
                            )}
                          </button>
                          <button className="mini-btn" onClick={handleSaveDesc}>
                            <DownloadIcon size={12} /> 存为 txt
                          </button>
                        </span>
                      </div>
                      <p className="desc-text">{info.desc}</p>
                    </div>
                  )}

                  <div className="video-actions">
                    {stage === "parsed" && (
                      <>
                        <button className="btn btn-primary" onClick={handleDownload}>
                          <DownloadIcon size={15} /> 下载视频
                        </button>
                        <button className="btn btn-outline-blue" onClick={handleThunderDownload}>
                          <BoltIcon size={15} /> 迅雷下载
                        </button>
                      </>
                    )}
                    {stage === "downloading" && (
                      <button className="btn btn-primary" disabled>
                        <Spinner /> 下载中…
                      </button>
                    )}
                    {stage === "done" && (
                      <>
                        <button className="btn btn-primary" onClick={handleOpenDir}>
                          <FolderOpenIcon size={15} /> 打开所在文件夹
                        </button>
                        <button className="btn btn-ghost" onClick={handleReset}>
                          <RefreshIcon size={14} /> 再下载一个
                        </button>
                      </>
                    )}
                  </div>

                  {thunderMsg && (
                    <p className="thunder-msg">
                      <BoltIcon size={13} />
                      {thunderMsg}
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {/* ==================== 批量下载 ==================== */}
        {mode === "batch" && (
          <>
            <section className="panel">
              <div className="panel-head">
                <span className="panel-label">用户主页链接</span>
                <div className="chips">
                  <span className="chip chip-douyin">仅支持抖音</span>
                </div>
              </div>
              <textarea
                className="link-input"
                placeholder={"粘贴抖音用户主页链接，例如：\nhttps://www.douyin.com/user/MS4wLjABAAAA…"}
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                disabled={isBatchBusy}
                rows={2}
              />
              <div className="panel-actions">
                <button className="btn btn-primary" onClick={handleParseUser} disabled={isBatchBusy}>
                  {batchStage === "loading" && posts.length === 0 ? (
                    <>
                      <Spinner /> 解析中…
                    </>
                  ) : (
                    <>
                      <SparklesIcon size={15} /> 解析主页
                    </>
                  )}
                </button>
                {posts.length > 0 && (
                  <button className="btn btn-ghost" onClick={handleBatchReset}>
                    <TrashIcon size={14} /> 清空
                  </button>
                )}
              </div>
            </section>

            {batchError && (
              <div className="banner banner-error" role="alert">
                <AlertIcon size={15} />
                <span>{batchError}</span>
              </div>
            )}

            {/* 批量进度 */}
            {(batchStage === "downloading" || batchStage === "done") && batchProgress && (
              <section className="panel batch-progress">
                <div className="batch-progress-head">
                  <span className="panel-label">批量下载进度</span>
                  <div className="chips">
                    <StatChip tone="neutral">
                      {batchProgress.current}/{batchProgress.total}
                    </StatChip>
                    <StatChip tone="success" icon={<CheckIcon size={12} />}>
                      {batchDoneCount}
                    </StatChip>
                    <StatChip tone="danger" icon={<XIcon size={12} />}>
                      {batchFailCount}
                    </StatChip>
                  </div>
                </div>
                <ProgressBar percent={(batchProgress.current / batchProgress.total) * 100} />
                <p className="progress-text">
                  {batchProgress.status === "downloading" && `正在下载：${batchProgress.desc.slice(0, 30)}…`}
                  {batchProgress.status === "done" && `完成：${batchProgress.desc.slice(0, 30)}`}
                  {batchProgress.status === "error" && `失败：${batchProgress.error || ""}`}
                </p>
                {batchStage === "done" && (
                  <div className="panel-actions">
                    <button className="btn btn-primary" onClick={() => openPath(saveDir)}>
                      <FolderOpenIcon size={15} /> 打开保存文件夹
                    </button>
                    <button className="btn btn-ghost" onClick={handleBatchReset}>
                      <RefreshIcon size={14} /> 再来一批
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* 作品列表 */}
            {posts.length > 0 ? (
              <section className="panel">
                <div className="batch-toolbar">
                  <Checkbox
                    checked={selectedIds.size === posts.length && posts.length > 0}
                    onChange={toggleSelectAll}
                    disabled={batchStage === "downloading"}
                    label={`全选（${selectedIds.size}/${posts.length}）`}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleBatchDownload}
                    disabled={isBatchBusy || selectedIds.size === 0}
                  >
                    {batchStage === "downloading" ? (
                      <>
                        <Spinner /> 下载中…
                      </>
                    ) : (
                      <>
                        <DownloadIcon size={14} /> 下载选中（{selectedIds.size}）
                      </>
                    )}
                  </button>
                </div>

                <div className="post-grid">
                  {posts.map((post) => {
                    const status = itemStatuses[post.awemeId];
                    const isSelected = selectedIds.has(post.awemeId);
                    const locked = batchStage === "downloading";
                    return (
                      <article
                        key={post.awemeId}
                        className={[
                          "post-card",
                          isSelected ? "is-selected" : "",
                          status ? `is-${status}` : "",
                        ].join(" ")}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={locked}
                        tabIndex={locked ? -1 : 0}
                        onClick={() => {
                          if (!locked) toggleSelect(post.awemeId);
                        }}
                        onKeyDown={(e) => {
                          if (locked) return;
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            toggleSelect(post.awemeId);
                          }
                        }}
                      >
                        <div className="post-cover">
                          {post.cover ? (
                            <img
                              src={post.cover}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.opacity = "0.25";
                              }}
                            />
                          ) : (
                            <div className="cover-empty">无封面</div>
                          )}
                          <span className="post-check" aria-hidden="true">
                            <CheckIcon size={11} strokeWidth={3} />
                          </span>
                          <span className="cover-badge">{formatDuration(post.durationMs)}</span>
                          {status === "downloading" && (
                            <div className="post-veil">
                              <Spinner size={18} />
                              <span>下载中</span>
                            </div>
                          )}
                          {status === "done" && (
                            <div className="post-veil veil-done">
                              <CheckIcon size={20} />
                              <span>已下载</span>
                            </div>
                          )}
                          {status === "error" && (
                            <div className="post-veil veil-error">
                              <XIcon size={20} />
                              <span>失败</span>
                            </div>
                          )}
                        </div>
                        <p className="post-desc">{post.desc || "（无文案）"}</p>
                        <div className="post-stats">
                          <span title="发布日期">
                            <CalendarIcon size={11} />
                            {formatDate(post.createTime)}
                          </span>
                          {post.diggCount > 0 && (
                            <span title="点赞">
                              <HeartIcon size={11} />
                              {formatCount(post.diggCount)}
                            </span>
                          )}
                          {post.playCount > 0 && (
                            <span title="播放量">
                              <EyeIcon size={11} />
                              {formatCount(post.playCount)}
                            </span>
                          )}
                          {post.commentCount > 0 && (
                            <span title="评论">
                              <MessageIcon size={11} />
                              {formatCount(post.commentCount)}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {hasMore && batchStage !== "downloading" && (
                  <div className="load-more">
                    <button className="btn btn-ghost" onClick={handleLoadMore} disabled={batchStage === "loading"}>
                      {batchStage === "loading" ? (
                        <>
                          <Spinner /> 加载中…
                        </>
                      ) : (
                        <>
                          <ChevronDownIcon size={14} /> 加载更多
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>
            ) : (
              batchStage === "idle" &&
              !batchError && (
                <section className="panel empty-state">
                  <span className="empty-art" aria-hidden="true">
                    <LayersIcon size={24} />
                  </span>
                  <p className="empty-title">粘贴用户主页链接，批量下载 TA 的作品</p>
                  <p className="empty-sub">解析后可自由勾选 · 支持分页加载更多</p>
                </section>
              )
            )}
          </>
        )}
      </main>

      {/* ---------- 底部状态栏：保存位置 ---------- */}
      <footer className="statusbar">
        <FolderIcon size={14} />
        <span className="statusbar-label">保存位置</span>
        <span className="statusbar-path" title={saveDir}>
          {saveDir || "获取中…"}
        </span>
        <button className="mini-btn" onClick={handleChooseDir}>
          更改
        </button>
      </footer>
    </div>
  );
}
