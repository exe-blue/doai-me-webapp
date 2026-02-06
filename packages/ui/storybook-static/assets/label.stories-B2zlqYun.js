import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{L as r}from"./label-YJEBS_My.js";import{C as L}from"./checkbox-Ckr9pw7k.js";import{I as j}from"./input-BOlX0cV-.js";import"./index-DwQS_Y10.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-D63EQwXG.js";import"./index-DKCiyFsV.js";import"./index-C2vczdB5.js";import"./utils-CDN07tui.js";import"./index-BRR7KkZm.js";import"./index-D8uAi14N.js";import"./index-51PM6oTJ.js";import"./index-CpLX3slL.js";import"./index-CNOV0ziW.js";import"./check-DXZjYRQi.js";import"./createLucideIcon-DjN-KrIq.js";const B={title:"Components/Label",component:r,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 라벨."}}}},s={render:()=>e.jsx(r,{children:"Label Text"})},a={render:()=>e.jsxs("div",{className:"grid w-[300px] gap-2",children:[e.jsx(r,{htmlFor:"email",children:"Email Address"}),e.jsx(j,{id:"email",type:"email",placeholder:"email@example.com"})]})},t={render:()=>e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(L,{id:"terms"}),e.jsx(r,{htmlFor:"terms",children:"I agree to the terms and conditions"})]})},i={render:()=>e.jsxs("div",{className:"grid w-[300px] gap-2",children:[e.jsxs(r,{htmlFor:"required",children:["Required Field ",e.jsx("span",{className:"text-destructive",children:"*"})]}),e.jsx(j,{id:"required",required:!0})]})};var o,m,d;s.parameters={...s.parameters,docs:{...(o=s.parameters)==null?void 0:o.docs,source:{originalSource:`{
  render: () => <Label>Label Text</Label>
}`,...(d=(m=s.parameters)==null?void 0:m.docs)==null?void 0:d.source}}};var n,c,p;a.parameters={...a.parameters,docs:{...(n=a.parameters)==null?void 0:n.docs,source:{originalSource:`{
  render: () => <div className="grid w-[300px] gap-2">
      <Label htmlFor="email">Email Address</Label>
      <Input id="email" type="email" placeholder="email@example.com" />
    </div>
}`,...(p=(c=a.parameters)==null?void 0:c.docs)==null?void 0:p.source}}};var l,u,x;t.parameters={...t.parameters,docs:{...(l=t.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">I agree to the terms and conditions</Label>
    </div>
}`,...(x=(u=t.parameters)==null?void 0:u.docs)==null?void 0:x.source}}};var h,b,g;i.parameters={...i.parameters,docs:{...(h=i.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => <div className="grid w-[300px] gap-2">
      <Label htmlFor="required">
        Required Field <span className="text-destructive">*</span>
      </Label>
      <Input id="required" required />
    </div>
}`,...(g=(b=i.parameters)==null?void 0:b.docs)==null?void 0:g.source}}};const O=["Default","WithInput","WithCheckbox","Required"];export{s as Default,i as Required,t as WithCheckbox,a as WithInput,O as __namedExportsOrder,B as default};
