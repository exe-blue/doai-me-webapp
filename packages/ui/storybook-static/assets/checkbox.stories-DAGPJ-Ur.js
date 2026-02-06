import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{C as s}from"./checkbox-Ckr9pw7k.js";import{L as r}from"./label-YJEBS_My.js";import"./index-DwQS_Y10.js";import"./index-DKCiyFsV.js";import"./index-BRR7KkZm.js";import"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-51PM6oTJ.js";import"./index-CpLX3slL.js";import"./index-CNOV0ziW.js";import"./index-C2vczdB5.js";import"./utils-CDN07tui.js";import"./check-DXZjYRQi.js";import"./createLucideIcon-DjN-KrIq.js";import"./index-D63EQwXG.js";const Q={title:"Components/Checkbox",component:s,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 체크박스."}}}},a={render:()=>e.jsx(s,{})},t={render:()=>e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{id:"terms"}),e.jsx(r,{htmlFor:"terms",children:"Accept terms and conditions"})]})},i={render:()=>e.jsx(s,{defaultChecked:!0})},c={render:()=>e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{id:"disabled",disabled:!0}),e.jsx(r,{htmlFor:"disabled",className:"opacity-50",children:"Disabled"})]})},d={render:()=>e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{variant:"default",defaultChecked:!0}),e.jsx(r,{children:"Default"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{variant:"outline",defaultChecked:!0}),e.jsx(r,{children:"Outline"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{variant:"solid",defaultChecked:!0}),e.jsx(r,{children:"Solid"})]})]})},n={render:()=>e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsx(s,{size:"sm",defaultChecked:!0}),e.jsx(s,{size:"md",defaultChecked:!0}),e.jsx(s,{size:"lg",defaultChecked:!0})]})},o={render:()=>e.jsxs("div",{className:"grid gap-2",children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{id:"option1",defaultChecked:!0}),e.jsx(r,{htmlFor:"option1",children:"Option 1"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{id:"option2"}),e.jsx(r,{htmlFor:"option2",children:"Option 2"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(s,{id:"option3"}),e.jsx(r,{htmlFor:"option3",children:"Option 3"})]})]})};var l,m,p;a.parameters={...a.parameters,docs:{...(l=a.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => <Checkbox />
}`,...(p=(m=a.parameters)==null?void 0:m.docs)==null?void 0:p.source}}};var x,h,u;t.parameters={...t.parameters,docs:{...(x=t.parameters)==null?void 0:x.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
}`,...(u=(h=t.parameters)==null?void 0:h.docs)==null?void 0:u.source}}};var b,f,v;i.parameters={...i.parameters,docs:{...(b=i.parameters)==null?void 0:b.docs,source:{originalSource:`{
  render: () => <Checkbox defaultChecked />
}`,...(v=(f=i.parameters)==null?void 0:f.docs)==null?void 0:v.source}}};var C,k,j;c.parameters={...c.parameters,docs:{...(C=c.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-2">
      <Checkbox id="disabled" disabled />
      <Label htmlFor="disabled" className="opacity-50">Disabled</Label>
    </div>
}`,...(j=(k=c.parameters)==null?void 0:k.docs)==null?void 0:j.source}}};var N,L,g;d.parameters={...d.parameters,docs:{...(N=d.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <div className="flex items-center space-x-2">
        <Checkbox variant="default" defaultChecked />
        <Label>Default</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox variant="outline" defaultChecked />
        <Label>Outline</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox variant="solid" defaultChecked />
        <Label>Solid</Label>
      </div>
    </div>
}`,...(g=(L=d.parameters)==null?void 0:L.docs)==null?void 0:g.source}}};var S,F,O;n.parameters={...n.parameters,docs:{...(S=n.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <Checkbox size="sm" defaultChecked />
      <Checkbox size="md" defaultChecked />
      <Checkbox size="lg" defaultChecked />
    </div>
}`,...(O=(F=n.parameters)==null?void 0:F.docs)==null?void 0:O.source}}};var z,D,A;o.parameters={...o.parameters,docs:{...(z=o.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => <div className="grid gap-2">
      <div className="flex items-center space-x-2">
        <Checkbox id="option1" defaultChecked />
        <Label htmlFor="option1">Option 1</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="option2" />
        <Label htmlFor="option2">Option 2</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="option3" />
        <Label htmlFor="option3">Option 3</Label>
      </div>
    </div>
}`,...(A=(D=o.parameters)==null?void 0:D.docs)==null?void 0:A.source}}};const T=["Default","WithLabel","Checked","Disabled","AllVariants","AllSizes","CheckboxGroup"];export{n as AllSizes,d as AllVariants,o as CheckboxGroup,i as Checked,a as Default,c as Disabled,t as WithLabel,T as __namedExportsOrder,Q as default};
