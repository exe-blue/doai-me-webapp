import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as T}from"./index-DwQS_Y10.js";import{c as Z}from"./index-C2vczdB5.js";import{c as s}from"./utils-CDN07tui.js";import{S as F}from"./smartphone-wNdBRhlc.js";import{c as O}from"./createLucideIcon-DjN-KrIq.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],H=O("activity",G);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=[["path",{d:"M 22 14 L 22 10",key:"nqc4tb"}],["rect",{x:"2",y:"6",width:"16",height:"12",rx:"2",key:"13zb55"}]],U=O("battery",M),J=Z("px-2.5 py-1 text-xs font-head font-bold uppercase tracking-wider border-2 border-border",{variants:{status:{idle:"bg-green-500 text-white",busy:"bg-blue-500 text-white",offline:"bg-muted text-muted-foreground",error:"bg-destructive text-destructive-foreground"}},defaultVariants:{status:"idle"}}),t=T.forwardRef(({className:R,device:r,onConnect:l,onViewLogs:m,...z},q)=>{const P=r.status==="offline";return e.jsx("div",{ref:q,className:s("flex flex-col w-full max-w-sm overflow-hidden rounded bg-background","border-2 border-border shadow-md",R),...z,children:e.jsxs("div",{className:"flex flex-col w-full h-full p-5",children:[e.jsxs("div",{className:"flex items-start justify-between mb-4",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:s("p-2 border-2 border-border",r.status==="idle"&&"bg-green-100 text-green-600",r.status==="busy"&&"bg-blue-100 text-blue-600",r.status==="offline"&&"bg-muted text-muted-foreground",r.status==="error"&&"bg-red-100 text-red-600"),children:e.jsx(F,{size:20})}),e.jsxs("div",{children:[e.jsx("h3",{className:"font-head font-bold text-foreground leading-tight",children:r.model}),e.jsx("p",{className:"text-xs text-muted-foreground font-mono mt-0.5",children:r.serial})]})]}),e.jsx("span",{className:s(J({status:r.status})),children:r.status})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3 mb-5",children:[e.jsxs("div",{className:"p-3 bg-muted border-2 border-border",children:[e.jsxs("div",{className:"flex items-center gap-2 text-xs text-muted-foreground mb-1",children:[e.jsx(U,{size:14})," Battery"]}),e.jsxs("span",{className:s("text-lg font-bold",r.batteryLevel<20?"text-destructive":"text-foreground"),children:[r.batteryLevel,"%"]})]}),e.jsxs("div",{className:"p-3 bg-muted border-2 border-border",children:[e.jsxs("div",{className:"flex items-center gap-2 text-xs text-muted-foreground mb-1",children:[e.jsx(H,{size:14})," Last Seen"]}),e.jsx("span",{className:"text-sm font-semibold text-foreground",children:new Date(r.lastSeen).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3 mt-auto",children:[e.jsx("button",{onClick:()=>l==null?void 0:l(r.id),disabled:P,className:s("flex items-center justify-center py-2.5 text-sm font-head font-bold","bg-primary text-primary-foreground border-2 border-border shadow-md","hover:shadow active:shadow-none transition-shadow","disabled:opacity-50 disabled:cursor-not-allowed"),children:"Control"}),e.jsx("button",{onClick:()=>m==null?void 0:m(r.id),className:s("flex items-center justify-center py-2.5 text-sm font-head font-bold","bg-background text-foreground border-2 border-border shadow-md","hover:shadow active:shadow-none transition-shadow"),children:"Logs"})]})]})})});t.displayName="DeviceCard";t.__docgenInfo={description:"",methods:[],displayName:"DeviceCard",props:{device:{required:!0,tsType:{name:"DeviceCardDevice"},description:""},onConnect:{required:!1,tsType:{name:"signature",type:"function",raw:"(deviceId: string) => void",signature:{arguments:[{type:{name:"string"},name:"deviceId"}],return:{name:"void"}}},description:""},onViewLogs:{required:!1,tsType:{name:"signature",type:"function",raw:"(deviceId: string) => void",signature:{arguments:[{type:{name:"string"},name:"deviceId"}],return:{name:"void"}}},description:""}}};const V={title:"Components/DeviceCard",component:t,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 디바이스 카드. 디바이스 상태, 배터리, 마지막 접속 시간을 표시."}}}},u={id:"device-001",model:"Galaxy S24 Ultra",serial:"R5CR30ABCDE",status:"idle",batteryLevel:87,lastSeen:new Date().toISOString()},_={id:"device-002",model:"Pixel 8 Pro",serial:"1A2B3C4D5E6F",status:"busy",batteryLevel:62,lastSeen:new Date().toISOString()},E={id:"device-003",model:"iPhone 15 Pro",serial:"DNQXYZ123456",status:"offline",batteryLevel:15,lastSeen:new Date(Date.now()-36e5).toISOString()},A={id:"device-004",model:"Galaxy Z Fold 5",serial:"R5ZZ99FGHIJ",status:"error",batteryLevel:3,lastSeen:new Date(Date.now()-72e5).toISOString()},a={args:{device:u}},o={args:{device:_}},d={args:{device:E}},i={args:{device:A}},n={args:{device:{...u,batteryLevel:8}}},c={render:()=>e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsx(t,{device:u}),e.jsx(t,{device:_}),e.jsx(t,{device:E}),e.jsx(t,{device:A})]})};var g,p,x;a.parameters={...a.parameters,docs:{...(g=a.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    device: idleDevice
  }
}`,...(x=(p=a.parameters)==null?void 0:p.docs)==null?void 0:x.source}}};var v,f,b;o.parameters={...o.parameters,docs:{...(v=o.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    device: busyDevice
  }
}`,...(b=(f=o.parameters)==null?void 0:f.docs)==null?void 0:b.source}}};var h,y,D;d.parameters={...d.parameters,docs:{...(h=d.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    device: offlineDevice
  }
}`,...(D=(y=d.parameters)==null?void 0:y.docs)==null?void 0:D.source}}};var j,w,S;i.parameters={...i.parameters,docs:{...(j=i.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    device: errorDevice
  }
}`,...(S=(w=i.parameters)==null?void 0:w.docs)==null?void 0:S.source}}};var N,I,C;n.parameters={...n.parameters,docs:{...(N=n.parameters)==null?void 0:N.docs,source:{originalSource:`{
  args: {
    device: {
      ...idleDevice,
      batteryLevel: 8
    }
  }
}`,...(C=(I=n.parameters)==null?void 0:I.docs)==null?void 0:C.source}}};var L,B,k;c.parameters={...c.parameters,docs:{...(L=c.parameters)==null?void 0:L.docs,source:{originalSource:`{
  render: () => <div className="grid grid-cols-2 gap-4">
      <DeviceCard device={idleDevice} />
      <DeviceCard device={busyDevice} />
      <DeviceCard device={offlineDevice} />
      <DeviceCard device={errorDevice} />
    </div>
}`,...(k=(B=c.parameters)==null?void 0:B.docs)==null?void 0:k.source}}};const ee=["Idle","Busy","Offline","Error","LowBattery","AllStatuses"];export{c as AllStatuses,o as Busy,i as Error,a as Idle,n as LowBattery,d as Offline,ee as __namedExportsOrder,V as default};
