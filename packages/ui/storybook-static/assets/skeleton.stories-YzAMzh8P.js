import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{c as A}from"./index-C2vczdB5.js";import{c as T}from"./utils-CDN07tui.js";const R=A("border-2 border-border",{variants:{variant:{default:"bg-muted animate-pulse",loader:"bg-primary"}},defaultVariants:{variant:"default"}});function a({className:d,variant:m,...i}){return e.jsx("div",{className:T(R({variant:m}),d),...i})}function s({className:d,count:m=3,duration:i=.5,delayStep:I=100,...q}){return e.jsx("div",{className:T("flex gap-1",d),...q,children:Array.from({length:m}).map((B,p)=>e.jsx("div",{className:"h-3 w-3 bg-primary border-2 border-foreground animate-bounce",style:{animationDuration:`${i}s`,animationDelay:`${p*I}ms`}},p))})}a.__docgenInfo={description:"Skeleton - RetroUI/NeoBrutalist 스타일 스켈레톤 로더",methods:[],displayName:"Skeleton",composes:["VariantProps"]};s.__docgenInfo={description:"",methods:[],displayName:"Loader",props:{count:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"3",computed:!1}},duration:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"0.5",computed:!1}},delayStep:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"100",computed:!1}}}};const $={title:"Components/Skeleton",component:a,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 스켈레톤 로더."}}}},r={render:()=>e.jsx(a,{className:"h-4 w-[250px]"})},n={render:()=>e.jsxs("div",{className:"flex flex-col space-y-3 w-[300px]",children:[e.jsx(a,{className:"h-[125px] w-full"}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(a,{className:"h-4 w-full"}),e.jsx(a,{className:"h-4 w-[200px]"})]})]})},o={render:()=>e.jsxs("div",{className:"flex items-center space-x-4",children:[e.jsx(a,{className:"h-12 w-12"}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(a,{className:"h-4 w-[150px]"}),e.jsx(a,{className:"h-4 w-[100px]"})]})]})},t={render:()=>e.jsxs("div",{className:"w-[400px] space-y-2",children:[e.jsx(a,{className:"h-10 w-full"}),e.jsx(a,{className:"h-10 w-full"}),e.jsx(a,{className:"h-10 w-full"}),e.jsx(a,{className:"h-10 w-full"})]})},l={name:"Loader",render:()=>e.jsx(s,{})},c={name:"Loader Custom",render:()=>e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx("p",{className:"mb-2 font-bold text-sm",children:"3 dots (default)"}),e.jsx(s,{count:3})]}),e.jsxs("div",{children:[e.jsx("p",{className:"mb-2 font-bold text-sm",children:"5 dots"}),e.jsx(s,{count:5})]}),e.jsxs("div",{children:[e.jsx("p",{className:"mb-2 font-bold text-sm",children:"Fast animation"}),e.jsx(s,{duration:.3,delayStep:50})]})]})};var u,x,f;r.parameters={...r.parameters,docs:{...(u=r.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <Skeleton className="h-4 w-[250px]" />
}`,...(f=(x=r.parameters)==null?void 0:x.docs)==null?void 0:f.source}}};var N,h,v;n.parameters={...n.parameters,docs:{...(N=n.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col space-y-3 w-[300px]">
      <Skeleton className="h-[125px] w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
}`,...(v=(h=n.parameters)==null?void 0:h.docs)==null?void 0:v.source}}};var j,w,b;o.parameters={...o.parameters,docs:{...(j=o.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
    </div>
}`,...(b=(w=o.parameters)==null?void 0:w.docs)==null?void 0:b.source}}};var y,S,k;t.parameters={...t.parameters,docs:{...(y=t.parameters)==null?void 0:y.docs,source:{originalSource:`{
  render: () => <div className="w-[400px] space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
}`,...(k=(S=t.parameters)==null?void 0:S.docs)==null?void 0:k.source}}};var g,L,C;l.parameters={...l.parameters,docs:{...(g=l.parameters)==null?void 0:g.docs,source:{originalSource:`{
  name: "Loader",
  render: () => <Loader />
}`,...(C=(L=l.parameters)==null?void 0:L.docs)==null?void 0:C.source}}};var _,D,V;c.parameters={...c.parameters,docs:{...(_=c.parameters)==null?void 0:_.docs,source:{originalSource:`{
  name: "Loader Custom",
  render: () => <div className="space-y-4">
      <div>
        <p className="mb-2 font-bold text-sm">3 dots (default)</p>
        <Loader count={3} />
      </div>
      <div>
        <p className="mb-2 font-bold text-sm">5 dots</p>
        <Loader count={5} />
      </div>
      <div>
        <p className="mb-2 font-bold text-sm">Fast animation</p>
        <Loader duration={0.3} delayStep={50} />
      </div>
    </div>
}`,...(V=(D=c.parameters)==null?void 0:D.docs)==null?void 0:V.source}}};const O=["Default","Card","Avatar","Table","LoaderDefault","LoaderCustom"];export{o as Avatar,n as Card,r as Default,c as LoaderCustom,l as LoaderDefault,t as Table,O as __namedExportsOrder,$ as default};
