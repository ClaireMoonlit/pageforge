/**
 * 扫描 HTML 字符串中的 <img src> 和 style="background-image:url(...)"，
 * 找出「本地无法访问」的图片资源（相对路径、绝对磁盘路径等）。
 *
 * 浏览器出于安全考虑，无法访问用户本地文件系统。
 * 因此当用户上传/粘贴一个 HTML，其中图片用的是相对路径（如 `assets/img/...`），
 * 在 PageForge 中必然无法显示。本工具用于检测这种情况并提示用户。
 *
 * 判定为「本地无法访问」的情形（满足任一即算）：
 *   1. 相对路径（`assets/...`、`./...`、`../...`）
 *   2. 绝对磁盘路径（Windows: `C:\...`、`D:/...`；POSIX: `/Users/...` 等）
 *   3. file:// 协议
 *
 * 不算的情形：
 *   - `https://` / `http://` 开头的网络 URL
 *   - `data:` 开头的内联 base64 图
 *   - `blob:` 开头的临时 URL
 *   - 协议相对 `//cdn.xxx.com/...`（视为可访问）
 */
export interface LocalImageRef {
  /** 原始 src / url 字面量 */
  raw: string
  /** 出现位置：'img' 或 'background' */
  kind: 'img' | 'background'
}

const PROTOCOL_OR_ABSOLUTE_RE = /^(?:[a-z]+:|\/\/)/i
const WINDOWS_ABS_PATH_RE = /^[a-zA-Z]:[\\/]/
const POSIX_ABS_PATH_RE = /^\/(?:Users|home|tmp|var|etc|opt|root)\//i

function isLocalUnreachable(src: string): boolean {
  if (!src) return false
  const s = src.trim()
  // 已是可访问 URL：放行
  if (/^https?:\/\//i.test(s)) return false
  if (/^data:/i.test(s)) return false
  if (/^blob:/i.test(s)) return false
  // 协议相对：放行
  if (PROTOCOL_OR_ABSOLUTE_RE.test(s) && s.startsWith('//')) return false
  // file:// 协议：本地文件，浏览器拿不到
  if (/^file:/i.test(s)) return true
  // Windows 绝对路径 C:\ 或 D:/
  if (WINDOWS_ABS_PATH_RE.test(s)) return true
  // POSIX 绝对路径 /Users /home ...
  if (POSIX_ABS_PATH_RE.test(s)) return true
  // 其余（assets/、./、../、images/...）一律视为相对路径
  return true
}

/** 提取 style 属性中所有 background-image: url(...) */
function extractBackgroundUrls(html: string): string[] {
  const out: string[] = []
  const re = /background-image\s*:\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push(m[2])
  }
  return out
}

/** 提取所有 <img src="..."> 的 src */
function extractImgSrcs(html: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push(m[2])
  }
  return out
}

/**
 * 扫描 HTML 字符串，返回所有「本地无法访问」的图片引用。
 * 返回空数组表示没有检测到本地资源（无需弹窗）。
 */
export function scanLocalImages(html: string): LocalImageRef[] {
  if (!html) return []
  const refs: LocalImageRef[] = []
  const seen = new Set<string>()

  for (const src of extractImgSrcs(html)) {
    if (isLocalUnreachable(src) && !seen.has(src)) {
      refs.push({ raw: src, kind: 'img' })
      seen.add(src)
    }
  }
  for (const url of extractBackgroundUrls(html)) {
    if (isLocalUnreachable(url) && !seen.has(url)) {
      refs.push({ raw: url, kind: 'background' })
      seen.add(url)
    }
  }
  return refs
}
