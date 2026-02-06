import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{I as a}from"./input-BOlX0cV-.js";import{L as r}from"./label-YJEBS_My.js";import{B as f}from"./button-gDusbB4c.js";import"./index-DwQS_Y10.js";import"./utils-CDN07tui.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-D63EQwXG.js";import"./index-DKCiyFsV.js";import"./index-C2vczdB5.js";const _={title:"Components/Input",component:a,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 입력 필드. 두꺼운 테두리와 그림자."}}}},s={render:()=>e.jsx(a,{placeholder:"Enter text...",className:"w-[300px]"})},t={render:()=>e.jsxs("div",{className:"grid w-[300px] gap-2",children:[e.jsx(r,{htmlFor:"email",children:"Email"}),e.jsx(a,{id:"email",type:"email",placeholder:"email@example.com"})]})},l={render:()=>e.jsx(a,{placeholder:"Disabled input",disabled:!0,className:"w-[300px]"})},d={render:()=>e.jsxs("div",{className:"flex w-[400px] gap-2",children:[e.jsx(a,{placeholder:"Search...",className:"flex-1"}),e.jsx(f,{children:"Search"})]})},p={render:()=>e.jsxs("div",{className:"grid w-[300px] gap-4",children:[e.jsxs("div",{className:"grid gap-2",children:[e.jsx(r,{children:"Text"}),e.jsx(a,{type:"text",placeholder:"Text input"})]}),e.jsxs("div",{className:"grid gap-2",children:[e.jsx(r,{children:"Password"}),e.jsx(a,{type:"password",placeholder:"Password"})]}),e.jsxs("div",{className:"grid gap-2",children:[e.jsx(r,{children:"Number"}),e.jsx(a,{type:"number",placeholder:"0"})]}),e.jsxs("div",{className:"grid gap-2",children:[e.jsx(r,{children:"File"}),e.jsx(a,{type:"file"})]})]})};var i,o,n;s.parameters={...s.parameters,docs:{...(i=s.parameters)==null?void 0:i.docs,source:{originalSource:`{
  render: () => <Input placeholder="Enter text..." className="w-[300px]" />
}`,...(n=(o=s.parameters)==null?void 0:o.docs)==null?void 0:n.source}}};var c,m,x;t.parameters={...t.parameters,docs:{...(c=t.parameters)==null?void 0:c.docs,source:{originalSource:`{
  render: () => <div className="grid w-[300px] gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="email@example.com" />
    </div>
}`,...(x=(m=t.parameters)==null?void 0:m.docs)==null?void 0:x.source}}};var u,h,g;l.parameters={...l.parameters,docs:{...(u=l.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <Input placeholder="Disabled input" disabled className="w-[300px]" />
}`,...(g=(h=l.parameters)==null?void 0:h.docs)==null?void 0:g.source}}};var b,j,N;d.parameters={...d.parameters,docs:{...(b=d.parameters)==null?void 0:b.docs,source:{originalSource:`{
  render: () => <div className="flex w-[400px] gap-2">
      <Input placeholder="Search..." className="flex-1" />
      <Button>Search</Button>
    </div>
}`,...(N=(j=d.parameters)==null?void 0:j.docs)==null?void 0:N.source}}};var v,w,L;p.parameters={...p.parameters,docs:{...(v=p.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => <div className="grid w-[300px] gap-4">
      <div className="grid gap-2">
        <Label>Text</Label>
        <Input type="text" placeholder="Text input" />
      </div>
      <div className="grid gap-2">
        <Label>Password</Label>
        <Input type="password" placeholder="Password" />
      </div>
      <div className="grid gap-2">
        <Label>Number</Label>
        <Input type="number" placeholder="0" />
      </div>
      <div className="grid gap-2">
        <Label>File</Label>
        <Input type="file" />
      </div>
    </div>
}`,...(L=(w=p.parameters)==null?void 0:w.docs)==null?void 0:L.source}}};const C=["Default","WithLabel","Disabled","WithButton","Types"];export{s as Default,l as Disabled,p as Types,d as WithButton,t as WithLabel,C as __namedExportsOrder,_ as default};
