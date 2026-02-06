import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{B as a}from"./badge-BsHBd_Vu.js";import"./index-C2vczdB5.js";import"./utils-CDN07tui.js";const D={title:"Components/Badge",component:a,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 배지. 두꺼운 테두리와 다양한 상태 색상."}}}},r={args:{children:"Badge"}},s={render:()=>e.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[e.jsx(a,{variant:"default",children:"Default"}),e.jsx(a,{variant:"primary",children:"Primary"}),e.jsx(a,{variant:"secondary",children:"Secondary"}),e.jsx(a,{variant:"outline",children:"Outline"}),e.jsx(a,{variant:"solid",children:"Solid"}),e.jsx(a,{variant:"surface",children:"Surface"}),e.jsx(a,{variant:"destructive",children:"Destructive"})]})},n={render:()=>e.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[e.jsx(a,{variant:"success",children:"Success"}),e.jsx(a,{variant:"warning",children:"Warning"}),e.jsx(a,{variant:"info",children:"Info"}),e.jsx(a,{variant:"destructive",children:"Error"})]})},t={render:()=>e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(a,{size:"sm",children:"Small"}),e.jsx(a,{size:"md",children:"Medium"}),e.jsx(a,{size:"lg",children:"Large"})]})},i={render:()=>e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"font-bold",children:"Status:"}),e.jsx(a,{variant:"success",children:"Online"})]})};var d,c,o;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    children: "Badge"
  }
}`,...(o=(c=r.parameters)==null?void 0:c.docs)==null?void 0:o.source}}};var l,m,g;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="solid">Solid</Badge>
      <Badge variant="surface">Surface</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
}`,...(g=(m=s.parameters)==null?void 0:m.docs)==null?void 0:g.source}}};var u,p,v;n.parameters={...n.parameters,docs:{...(u=n.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="destructive">Error</Badge>
    </div>
}`,...(v=(p=n.parameters)==null?void 0:p.docs)==null?void 0:v.source}}};var x,B,f;t.parameters={...t.parameters,docs:{...(x=t.parameters)==null?void 0:x.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
}`,...(f=(B=t.parameters)==null?void 0:B.docs)==null?void 0:f.source}}};var h,j,S;i.parameters={...i.parameters,docs:{...(h=i.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-2">
      <span className="font-bold">Status:</span>
      <Badge variant="success">Online</Badge>
    </div>
}`,...(S=(j=i.parameters)==null?void 0:j.docs)==null?void 0:S.source}}};const I=["Default","AllVariants","StatusBadges","AllSizes","InContext"];export{t as AllSizes,s as AllVariants,r as Default,i as InContext,n as StatusBadges,I as __namedExportsOrder,D as default};
