# 更新器签名密钥说明

`.keys/` 目录下保存的是 **Tauri 更新器（updater）签名密钥**（minisign 格式），用于给自动更新的安装包签名：客户端下载更新包后校验签名，确保安装包是官方发出、未经篡改的。

## 密钥文件

| 文件                       | 内容 | 说明                                                                                               |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `.keys/framecatch.key`     | 私钥 | 内容以 `rsign encrypted secret key` 开头，受密码保护，**严禁提交**（`.gitignore` 已忽略 `.keys/`） |
| `.keys/framecatch.key.pub` | 公钥 | 可以公开，客户端内置的就是它                                                                       |

## 生成方式

一次性执行（Tauri CLI 自带的 signer 命令）：

```bash
pnpm tauri signer generate -w .keys/framecatch.key -p '<你的密码>'
```

会产出两个文件：`framecatch.key`（私钥）和 `framecatch.key.pub`（公钥）。

## 三处关联

| 位置                                                    | 内容                            | 用途                           |
| ------------------------------------------------------- | ------------------------------- | ------------------------------ |
| `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` | `.pub` 文件的 base64 原文       | 客户端内置公钥，运行时校验签名 |
| GitHub secret `TAURI_SIGNING_PRIVATE_KEY`               | `.keys/framecatch.key` 文件内容 | CI 里构建时签名                |
| GitHub secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`      | 生成时设置的密码                | CI 里解密私钥                  |

`pubkey` 就是把 `.pub` 文件内容原样（base64）贴进 `tauri.conf.json`，两者必须一致。

## 发布流程（.github/workflows/release.yml）

1. `pnpm tauri build` 用 secrets 里的私钥自动给更新器签名
2. `pnpm tauri signer sign` 生成 `.sig` 签名文件
3. `.sig` 写入 `latest.json`，随安装包一起推送到公开产物仓库 `tcly861204/framecatch`
4. 客户端更新时：下载安装包 → 用内置公钥验证 `.sig` → 通过才安装

## 重新生成

跑上面的 generate 命令，然后同步更新三处：`tauri.conf.json` 的 `pubkey`、GitHub 两个 secrets，以及 CI 中 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
