/** 复用生产组件检查加白菜单、应用审核设置、清单保存及移动布局；替身只用于本地视觉验收。 */
import { useMemo,useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Alert,ConfigProvider,Menu,Drawer } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { ReviewWhitelistManagement } from '../../src/features/applications/ReviewWhitelistManagement'
import { ReviewSettingsManagement } from '../../src/features/applications/ReviewSettingsManagement'
import { DramaDistributionPanel } from '../../src/features/dramas/DramaDistributionPanel'
import { ApplicationManagement } from '../../src/features/applications/ApplicationManagement'
import { navigationItems } from '../../src/app/navigation'
import type { OperationsApi } from '../../src/api'
import type { Application,MiniReviewSettings } from '../../src/applications'
import type { AdminSession } from '../../src/domain'
const rows=[{id:'201',title:'Love Beyond the Contract',coverUrl:''},{id:'202',title:'The CEO’s Hidden Promise',coverUrl:''}]
const initial:Application={id:'101',subjectId:'1',name:'Plotimo',tiktokAppId:'7694137787536181256',clientKey:'public-preview-key',secretRef:'',regionCode:'GLOBAL',timeZone:'UTC',complianceBaseUrl:'',logoUrl:'',status:'active',monetizationMode:'IAA',adUnits:{rewardedVideo:['rewarded'],interstitial:['interstitial']},miniReview:{version:'0.1.0',enabled:true,revision:2},createdAt:'',updatedAt:''}
export function Preview(){
 const [application,setApplication]=useState(initial)
 const [notice,setNotice]=useState('')
 const settingsView=new URLSearchParams(location.search).has('settings')
 const distributionView=new URLSearchParams(location.search).has('distribution')
 const appView=new URLSearchParams(location.search).has('application')
 const api=useMemo(()=>{let config={revision:2,dramaIds:['201'],dramas:[rows[0]]};let settings:MiniReviewSettings={versions:[{version:'1.0.0',enabled:false},{version:'1.1.0',enabled:true},{version:'1.2.0',enabled:true}],revision:2};let distributions:unknown[]=[];return {
  getReviewWhitelist:async()=>config,reviewWhitelistTargets:async()=>({items:rows}),saveReviewWhitelist:async(_channel:string,_subjectId:string,input:typeof config)=>{config={...input,revision:config.revision+1,dramas:rows.filter(row=>input.dramaIds.includes(row.id))};return config},
  getReviewSettings:async()=>settings,
  saveReviewSettings:async(_id:string,input:MiniReviewSettings)=>{settings={...input,revision:input.revision+1};return settings},
  listDramaDistributions:async()=>distributions,
  setDramaDistribution:async(_id:string,applicationId:string,enabled:boolean)=>{distributions=[{dramaId:'201',applicationId,ownerApplicationId:'101',enabled,desiredAuthorized:enabled,status:enabled?'authorized':'revoked',attempts:1,errorCode:'',nextAttemptAt:''}];},
  createApplication:async(input:Application)=>({...initial,...input,id:"102",status:"disabled"}),
  updateApplication:async(_id:string,input:Application)=>({...application,...input}),
 } as unknown as OperationsApi},[application])
 const session={user:{isSuper:false},permissions:['operations.official_review_list.read','operations.official_review_list.update','operations.direct_review_list.read','operations.direct_review_list.update','operations.review_settings.read','operations.review_settings.update'],menus:[
  {id:'white',name:'加白管理',route:'',children:[{id:'settings',name:'审核开关',route:'/whitelist/review-settings',children:[]}]},
  {id:'official',name:'官方发布',route:'',children:[{id:'review',name:'审核列表',route:'/official/review-list',children:[]}]},
  {id:'direct',name:'直连发布',route:'',children:[{id:'direct-review',name:'审核列表',route:'/direct/review-list',children:[]}]},
 ]} as unknown as AdminSession
 return <ConfigProvider theme={{token:{motion:false}}}><main style={{maxWidth:1100,margin:'0 auto',padding:20}}>
 <Menu mode="inline" defaultOpenKeys={['directory:white','directory:official','directory:direct']} selectedKeys={[settingsView?'reviewSettings:settings':'officialReviewList:review']} items={navigationItems(session)} />
 {notice&&<Alert title={notice} type="success" />}
 {distributionView?<Drawer open title="日薪一万，我在博物馆值夜班 · 授权明细" size={1100}><DramaDistributionPanel api={api} dramaId="201" ownerApplicationId="101" applications={[{...initial,clientKeyConfigured:true},{id:'102',subjectId:'1',name:'Glimora',tiktokAppId:'102',status:'active',playbackProvider:'byteplus_web',clientKeyConfigured:true}]} canUpdate onChanged={async()=>{}} /></Drawer>:settingsView?<ReviewSettingsManagement applicationId="101" api={api} canUpdate notify={setNotice} />:appView?<ApplicationManagement subjectId="1" api={api} applications={[application]} canCreate canUpdate canDistribute={false} loading={false} onRefresh={async()=>{}} onChanged={setApplication} notify={setNotice} />:<ReviewWhitelistManagement subjectId="1" channel="official" api={api} canUpdate notify={setNotice} />}
 </main></ConfigProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
