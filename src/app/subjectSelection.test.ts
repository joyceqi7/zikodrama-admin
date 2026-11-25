import { describe, expect, it } from 'vitest'
import type { Application } from '../applications'
import { resolveSubjectSelection } from './subjectSelection'

const subjects = [{id:'1',name:'主体 A'},{id:'2',name:'主体 B'},{id:'3',name:'空主体'}]
const applications = [
  {id:'11',subjectId:'1',status:'disabled'}, {id:'12',subjectId:'1',status:'active'},
  {id:'21',subjectId:'2',status:'active'},
] as Application[]

describe('主体与应用选择', () => {
  it('首次进入恢复已选应用的主体，并保留该应用', () => {
    expect(resolveSubjectSelection(subjects,applications,{subjectId:'',applicationId:'21'})).toEqual({subjectId:'2',applicationId:'21'})
  })
  it('切换主体时自动选择该主体的启用应用', () => {
    expect(resolveSubjectSelection(subjects,applications,{subjectId:'1',applicationId:'21'})).toEqual({subjectId:'1',applicationId:'12'})
  })
  it('无应用主体清空旧应用，不从其他主体借用', () => {
    expect(resolveSubjectSelection(subjects,applications,{subjectId:'3',applicationId:'21'})).toEqual({subjectId:'3',applicationId:''})
  })
  it('保留当前主体已选停用应用，以便查询历史报表和维护', () => {
    expect(resolveSubjectSelection(subjects,applications,{subjectId:'1',applicationId:'11'})).toEqual({subjectId:'1',applicationId:'11'})
  })
  it('没有任何主体时清空主体和应用', () => {
    expect(resolveSubjectSelection([],applications,{subjectId:'1',applicationId:'12'})).toEqual({subjectId:'',applicationId:''})
  })
})
