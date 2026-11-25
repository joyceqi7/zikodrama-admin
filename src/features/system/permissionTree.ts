import type { AdminPermission } from '../../domain'

// PermissionTreeNode 保留节点资料，并为表格和角色树提供有序的 children。
export interface PermissionTreeNode extends AdminPermission {
  // children 为空时省略，让树控件正确识别叶节点。
  children?: PermissionTreeNode[]
}

// permissionTree 使用字符串 ID 还原树，防御异常数据中的循环并保留完整精度。
export function permissionTree(permissions: AdminPermission[]): PermissionTreeNode[] {
  const byParent = new Map<string, AdminPermission[]>()
  const ids = new Set(permissions.map((item) => item.id))
  for (const item of permissions) {
    const parent = ids.has(item.parentId) ? item.parentId : ''
    byParent.set(parent, [...(byParent.get(parent) || []), item])
  }
  const walk = (parent: string, ancestors: Set<string>): PermissionTreeNode[] => (byParent.get(parent) || [])
    .filter((item) => !ancestors.has(item.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((item) => {
      const children = walk(item.id, new Set([...ancestors, item.id]))
      return { ...item, ...(children.length ? { children } : {}) }
    })
  return walk('', new Set())
}

// descendantPermissionIDs 排除编辑节点及其后代，避免在父节点选择器中创建循环。
export function descendantPermissionIDs(permissions: AdminPermission[], id: string): Set<string> {
  const excluded = new Set(id ? [id] : [])
  let changed = true
  while (changed) {
    changed = false
    for (const item of permissions) if (excluded.has(item.parentId) && !excluded.has(item.id)) { excluded.add(item.id); changed = true }
  }
  return excluded
}
