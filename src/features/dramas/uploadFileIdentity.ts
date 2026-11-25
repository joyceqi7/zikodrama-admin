import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

// UploadFileIdentity 是可持久化的文件身份摘要，不保存文件内容或浏览器文件权限。
export interface UploadFileIdentity {
  // name 是浏览器提供的原始文件名。
  name: string
  // size 是文件字节数。
  size: number
  // lastModified 是浏览器提供的最后修改毫秒时间戳。
  lastModified: number
  // type 是浏览器识别的 MIME 类型，可能为空。
  type: string
  // fingerprint 是文件首尾片段与大小计算出的 SHA-256，用于避免同名同大小文件误续传。
  fingerprint: string
}

const fingerprintSliceBytes = 1024 * 1024

// identifyUploadFile 读取不超过 2 MiB 内容生成身份摘要，避免为大视频计算整文件哈希。
export async function identifyUploadFile(file: File): Promise<UploadFileIdentity> {
  const head = await file.slice(0, Math.min(file.size, fingerprintSliceBytes)).arrayBuffer()
  const tailStart = Math.max(0, file.size - fingerprintSliceBytes)
  const tail = await file.slice(tailStart, file.size).arrayBuffer()
  const metadata = new TextEncoder().encode(`${file.size}:${file.lastModified}:${file.type}`)
  const bytes = new Uint8Array(metadata.byteLength + head.byteLength + tail.byteLength)
  bytes.set(metadata, 0)
  bytes.set(new Uint8Array(head), metadata.byteLength)
  bytes.set(new Uint8Array(tail), metadata.byteLength + head.byteLength)
  // HTTP 测试后台没有 Web Crypto；用同一 SHA-256 算法计算，保证跨入口续传指纹一致。
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    : sha256(bytes)
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    type: file.type,
    fingerprint: bytesToHex(digest),
  }
}

// matchesUploadFileIdentity 仅在全部已记录字段一致时允许复用原上传预留和 SDK 分片断点。
export function matchesUploadFileIdentity(expected: Partial<UploadFileIdentity>, actual: UploadFileIdentity): boolean {
  return expected.name === actual.name
    && expected.size === actual.size
    && expected.lastModified === actual.lastModified
    && expected.type === actual.type
    && Boolean(expected.fingerprint)
    && expected.fingerprint === actual.fingerprint
}
