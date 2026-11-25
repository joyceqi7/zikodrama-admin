import type { Application } from '../applications'
import type { SubjectOption } from '../subjects'

/** SubjectSelection 将主体和应用作为同一份选择，避免不同归属短暂组合。 */
export interface SubjectSelection {
  /** subjectId 是顶部选中的 TikTok 发布主体。 */
  subjectId: string
  /** applicationId 是该主体下选中的应用，无应用时为空。 */
  applicationId: string
}

/** resolveSubjectSelection 校验保存的选择；主体切换后优先启用应用，不借用其他主体的应用。 */
export function resolveSubjectSelection(subjects: SubjectOption[], applications: Pick<Application,'id'|'subjectId'|'status'>[], current: SubjectSelection): SubjectSelection {
  const savedApp = applications.find(app => app.id === current.applicationId)
  const subjectId = subjects.some(subject => subject.id === current.subjectId)
    ? current.subjectId
    : subjects.find(subject => subject.id === savedApp?.subjectId)?.id ?? subjects[0]?.id ?? ''
  const candidates = applications.filter(app => app.subjectId === subjectId)
  const applicationId = candidates.find(app => app.id === current.applicationId)?.id
    ?? candidates.find(app => app.status === 'active')?.id ?? candidates[0]?.id ?? ''
  return { subjectId, applicationId }
}
