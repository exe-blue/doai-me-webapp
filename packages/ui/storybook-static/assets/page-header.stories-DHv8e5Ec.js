import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as k}from"./index-DwQS_Y10.js";import{c as z}from"./utils-CDN07tui.js";import{B as o}from"./button-gDusbB4c.js";import{S as T}from"./settings-BAgzYLW5.js";import{S as B}from"./smartphone-wNdBRhlc.js";import{c as W}from"./createLucideIcon-DjN-KrIq.js";import"./index-D63EQwXG.js";import"./index-DKCiyFsV.js";import"./index-C2vczdB5.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],q=W("refresh-cw",_),i=k.forwardRef(({className:D,title:M,description:c,icon:P,actions:m,...C},H)=>e.jsxs("div",{ref:H,className:z("flex items-center justify-between",D),...C,children:[e.jsxs("div",{children:[e.jsxs("h1",{className:"text-2xl font-head font-bold text-foreground flex items-center gap-2",children:[P,M]}),c&&e.jsx("p",{className:"text-sm text-muted-foreground",children:c})]}),m&&e.jsx("div",{className:"flex items-center gap-2",children:m})]}));i.displayName="PageHeader";i.__docgenInfo={description:`PageHeader - 페이지 상단 헤더 컴포넌트\r
제목, 설명, 아이콘, 액션 버튼을 일관된 레이아웃으로 표시\r
\r
@example\r
<PageHeader\r
  title="디바이스 관리"\r
  description="500대 디바이스 상태를 관리합니다"\r
  icon={<Smartphone className="h-6 w-6" />}\r
  actions={<Button>새로고침</Button>}\r
/>`,methods:[],displayName:"PageHeader",props:{title:{required:!0,tsType:{name:"string"},description:"페이지 제목"},description:{required:!1,tsType:{name:"string"},description:"페이지 설명 (선택)"},icon:{required:!1,tsType:{name:"ReactReactNode",raw:"React.ReactNode"},description:"제목 앞에 표시할 아이콘"},actions:{required:!1,tsType:{name:"ReactReactNode",raw:"React.ReactNode"},description:"우측 액션 버튼 영역"}}};const K={title:"Components/PageHeader",component:i,tags:["autodocs"],parameters:{layout:"padded",docs:{description:{component:"RetroUI NeoBrutalist 스타일 페이지 헤더. 제목, 설명, 아이콘, 액션 버튼을 일관된 레이아웃으로 표시."}}}},t={args:{title:"Dashboard",description:"Overview of your project status"}},s={args:{title:"Device Management",description:"Manage and monitor 500 connected devices",icon:e.jsx(B,{className:"h-6 w-6"})}},r={args:{title:"Settings",description:"Configure your workspace preferences",icon:e.jsx(T,{className:"h-6 w-6"}),actions:e.jsxs("div",{className:"flex gap-2",children:[e.jsx(o,{variant:"outline",size:"sm",children:"Cancel"}),e.jsx(o,{size:"sm",children:"Save"})]})}},a={args:{title:"Device Farm",description:"Real-time device status monitoring",icon:e.jsx(B,{className:"h-6 w-6"}),actions:e.jsxs(o,{variant:"outline",size:"sm",children:[e.jsx(q,{className:"h-4 w-4 mr-2"}),"Refresh"]})}},n={args:{title:"Simple Page"}};var d,p,l;t.parameters={...t.parameters,docs:{...(d=t.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    title: "Dashboard",
    description: "Overview of your project status"
  }
}`,...(l=(p=t.parameters)==null?void 0:p.docs)==null?void 0:l.source}}};var u,h,g;s.parameters={...s.parameters,docs:{...(u=s.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    title: "Device Management",
    description: "Manage and monitor 500 connected devices",
    icon: <Smartphone className="h-6 w-6" />
  }
}`,...(g=(h=s.parameters)==null?void 0:h.docs)==null?void 0:g.source}}};var f,v,x;r.parameters={...r.parameters,docs:{...(f=r.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    title: "Settings",
    description: "Configure your workspace preferences",
    icon: <Settings className="h-6 w-6" />,
    actions: <div className="flex gap-2">
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </div>
  }
}`,...(x=(v=r.parameters)==null?void 0:v.docs)==null?void 0:x.source}}};var N,w,R;a.parameters={...a.parameters,docs:{...(N=a.parameters)==null?void 0:N.docs,source:{originalSource:`{
  args: {
    title: "Device Farm",
    description: "Real-time device status monitoring",
    icon: <Smartphone className="h-6 w-6" />,
    actions: <Button variant="outline" size="sm">
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
  }
}`,...(R=(w=a.parameters)==null?void 0:w.docs)==null?void 0:R.source}}};var S,j,y;n.parameters={...n.parameters,docs:{...(S=n.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    title: "Simple Page"
  }
}`,...(y=(j=n.parameters)==null?void 0:j.docs)==null?void 0:y.source}}};const Q=["Default","WithIcon","WithActions","WithRefreshAction","TitleOnly"];export{t as Default,n as TitleOnly,r as WithActions,s as WithIcon,a as WithRefreshAction,Q as __namedExportsOrder,K as default};
