/** SubjectOption 是顶部可选主体的安全摘要，不包含发布方凭据。 */
export interface SubjectOption {
  /** id 是无精度损失的内部主体主键。 */
  id: string
  /** name 是主体显示名称。 */
  name: string
}

/** Subject 是主体管理返回的发布方资料，Secret 不返回原文。 */
export interface Subject extends SubjectOption {
  /** remark 是主体用途说明。 */
  remark: string
  /** tiktokAppId 是主体发布方的官方 AppID。 */
  tiktokAppId: string
  /** clientKey 是主体发布方公开客户端标识，不替代应用登录配置。 */
  clientKey: string
  /** clientSecretConfigured 表示服务端已保存发布密钥。 */
  clientSecretConfigured: boolean
  /** createdAt 是创建时间。 */
  createdAt: string
  /** updatedAt 是最后保存时间。 */
  updatedAt: string
}

/** SubjectInput 整体保存主体资料；编辑时空密钥保留服务端现值。 */
export type SubjectInput = Pick<Subject, 'name' | 'remark' | 'tiktokAppId' | 'clientKey'> & {
  /** clientSecret 仅用于本次替换，表单关闭后清空，不写浏览器存储。 */
  clientSecret?: string
}
