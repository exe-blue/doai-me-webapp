import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{B as t}from"./button-gDusbB4c.js";import{c as d}from"./createLucideIcon-DjN-KrIq.js";import{C as A}from"./chevron-right-CTD2Hx3u.js";import"./index-DwQS_Y10.js";import"./index-D63EQwXG.js";import"./index-DKCiyFsV.js";import"./index-C2vczdB5.js";import"./utils-CDN07tui.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],l=d("loader-circle",O);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],_=d("mail",E);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],R=d("trash-2",I),F={title:"Components/Button",component:t,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 버튼. 두꺼운 테두리, 그림자, 호버 시 이동 효과."}}},argTypes:{variant:{control:"select",options:["default","secondary","destructive","outline","ghost","link"]},size:{control:"select",options:["sm","md","lg","icon"]}}},a={args:{children:"Click Me!"}},n={render:()=>e.jsxs("div",{className:"flex flex-wrap items-center gap-4",children:[e.jsx(t,{variant:"default",children:"Primary"}),e.jsx(t,{variant:"secondary",children:"Secondary"}),e.jsx(t,{variant:"destructive",children:"Destructive"}),e.jsx(t,{variant:"outline",children:"Outline"}),e.jsx(t,{variant:"ghost",children:"Ghost"}),e.jsx(t,{variant:"link",children:"Link"})]})},r={render:()=>e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsx(t,{size:"sm",children:"Small"}),e.jsx(t,{size:"md",children:"Medium"}),e.jsx(t,{size:"lg",children:"Large"}),e.jsx(t,{size:"icon",children:e.jsx(_,{className:"h-4 w-4"})})]})},s={render:()=>e.jsxs("div",{className:"flex flex-wrap items-center gap-4",children:[e.jsxs(t,{children:[e.jsx(_,{className:"mr-2 h-4 w-4"})," Send Email"]}),e.jsxs(t,{variant:"outline",children:["Next ",e.jsx(A,{className:"ml-2 h-4 w-4"})]}),e.jsxs(t,{variant:"destructive",children:[e.jsx(R,{className:"mr-2 h-4 w-4"})," Delete"]})]})},i={render:()=>e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsxs(t,{disabled:!0,children:[e.jsx(l,{className:"mr-2 h-4 w-4 animate-spin"}),"Loading..."]}),e.jsxs(t,{variant:"outline",disabled:!0,children:[e.jsx(l,{className:"mr-2 h-4 w-4 animate-spin"}),"Saving..."]})]})},o={render:()=>e.jsxs("div",{className:"flex flex-wrap items-center gap-4",children:[e.jsx(t,{disabled:!0,children:"Default"}),e.jsx(t,{variant:"secondary",disabled:!0,children:"Secondary"}),e.jsx(t,{variant:"destructive",disabled:!0,children:"Destructive"}),e.jsx(t,{variant:"outline",disabled:!0,children:"Outline"})]})},c={render:()=>e.jsx(t,{asChild:!0,children:e.jsx("a",{href:"#",children:"Link Button"})})};var m,u,p;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    children: "Click Me!"
  }
}`,...(p=(u=a.parameters)==null?void 0:u.docs)==null?void 0:p.source}}};var h,v,x;n.parameters={...n.parameters,docs:{...(h=n.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-4">
      <Button variant="default">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
}`,...(x=(v=n.parameters)==null?void 0:v.docs)==null?void 0:x.source}}};var B,g,j;r.parameters={...r.parameters,docs:{...(B=r.parameters)==null?void 0:B.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">
        <Mail className="h-4 w-4" />
      </Button>
    </div>
}`,...(j=(g=r.parameters)==null?void 0:g.docs)==null?void 0:j.source}}};var f,N,y;s.parameters={...s.parameters,docs:{...(f=s.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-4">
      <Button>
        <Mail className="mr-2 h-4 w-4" /> Send Email
      </Button>
      <Button variant="outline">
        Next <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
      <Button variant="destructive">
        <Trash2 className="mr-2 h-4 w-4" /> Delete
      </Button>
    </div>
}`,...(y=(N=s.parameters)==null?void 0:N.docs)==null?void 0:y.source}}};var w,S,k;i.parameters={...i.parameters,docs:{...(w=i.parameters)==null?void 0:w.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <Button disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Saving...
      </Button>
    </div>
}`,...(k=(S=i.parameters)==null?void 0:S.docs)==null?void 0:k.source}}};var L,b,z;o.parameters={...o.parameters,docs:{...(L=o.parameters)==null?void 0:L.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-4">
      <Button disabled>Default</Button>
      <Button variant="secondary" disabled>Secondary</Button>
      <Button variant="destructive" disabled>Destructive</Button>
      <Button variant="outline" disabled>Outline</Button>
    </div>
}`,...(z=(b=o.parameters)==null?void 0:b.docs)==null?void 0:z.source}}};var M,D,C;c.parameters={...c.parameters,docs:{...(M=c.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: () => <Button asChild>
      <a href="#">Link Button</a>
    </Button>
}`,...(C=(D=c.parameters)==null?void 0:D.docs)==null?void 0:C.source}}};const J=["Default","AllVariants","AllSizes","WithIcon","Loading","Disabled","AsChild"];export{r as AllSizes,n as AllVariants,c as AsChild,a as Default,o as Disabled,i as Loading,s as WithIcon,J as __namedExportsOrder,F as default};
