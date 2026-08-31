export function getFileExtension(url: string): string | null {
  try {
    // 使用 URL API 解析
    const urlObj = new URL(url)
    // 获取路径名
    let pathname = urlObj.pathname

    // 如果路径为空，尝试从整个 URL 中提取
    if (!pathname || pathname === '/') {
      // 有时文件名在路径的最后一部分
      const lastSegment = url.split('?')[0].split('/').pop() || ''
      pathname = lastSegment
    }

    // 提取扩展名
    const lastDotIndex = pathname.lastIndexOf('.')
    if (lastDotIndex === -1) return null

    // 获取扩展名并转为小写
    const extension = pathname.slice(lastDotIndex + 1)
    return extension.toLowerCase()
  } catch (error) {
    // 如果 URL 解析失败，使用备用方法
    console.warn('URL parsing failed, using fallback method', error)
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/)
    return match ? match[1].toLowerCase() : null
  }
}
