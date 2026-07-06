/**
 * 将本地文件读取为 data URL（base64 编码）。
 * 用于图片/视频本地上传，直接存入 node.props.src 或 poster。
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result as string)
    }
    reader.onerror = () => {
      reject(new Error(`文件读取失败: ${file.name}`))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 校验文件大小，返回结构化结果。
 * @param maxSizeMB 最大允许大小（MB）
 */
export function validateFileSize(
  file: File,
  maxSizeMB: number,
): { valid: boolean; message: string } {
  const maxBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    return {
      valid: false,
      message: `文件过大 (${sizeMB}MB)，最大允许 ${maxSizeMB}MB`,
    }
  }
  return { valid: true, message: '' }
}

/**
 * 校验文件 MIME 类型，支持通配符（如 "image/*"）。
 * @param acceptTypes 允许的 MIME 类型列表，如 ["image/*", "video/mp4"]
 */
export function validateFileType(
  file: File,
  acceptTypes: string[],
): { valid: boolean; message: string } {
  if (acceptTypes.length === 0) return { valid: true, message: '' }

  const match = acceptTypes.some((type) => {
    if (type.endsWith('/*')) {
      const prefix = type.slice(0, -1) // e.g. "image/"
      return file.type.startsWith(prefix)
    }
    return file.type === type
  })

  if (!match) {
    return {
      valid: false,
      message: `不支持的文件类型 (${file.type})，请选择 ${acceptTypes.join(', ')}`,
    }
  }
  return { valid: true, message: '' }
}