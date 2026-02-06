import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as m}from"./index-DwQS_Y10.js";import{c as S}from"./index-C2vczdB5.js";import{c as h}from"./utils-CDN07tui.js";import{c as p}from"./createLucideIcon-DjN-KrIq.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],k=p("circle-alert",I);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],P=p("circle-check-big",C);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],E=p("info",R);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],V=p("triangle-alert",M),U=S("relative w-full p-4 border-2 border-border shadow-md rounded",{variants:{variant:{default:"bg-background text-foreground",solid:"bg-foreground text-background"},status:{info:"bg-blue-100 text-blue-800 border-blue-800",success:"bg-green-100 text-green-800 border-green-800",warning:"bg-yellow-100 text-yellow-800 border-yellow-800",error:"bg-red-100 text-red-800 border-red-800"}},defaultVariants:{variant:"default"}}),r=m.forwardRef(({className:n,variant:i,status:a,...D},_)=>e.jsx("div",{ref:_,role:"alert",className:h(U({variant:i,status:a}),n),...D}));r.displayName="Alert";const t=m.forwardRef(({className:n,...i},a)=>e.jsx("h5",{ref:a,className:h("mb-1 font-head font-bold leading-none tracking-tight",n),...i}));t.displayName="AlertTitle";const s=m.forwardRef(({className:n,...i},a)=>e.jsx("div",{ref:a,className:h("text-sm [&_p]:leading-relaxed",n),...i}));s.displayName="AlertDescription";r.__docgenInfo={description:"Alert - RetroUI NeoBrutalist 스타일 알림",methods:[],displayName:"Alert",composes:["VariantProps"]};t.__docgenInfo={description:"",methods:[],displayName:"AlertTitle"};s.__docgenInfo={description:"",methods:[],displayName:"AlertDescription"};const z={title:"Components/Alert",component:r,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 알림. 두꺼운 테두리와 상태별 색상."}}}},l={render:()=>e.jsxs(r,{className:"w-[400px]",children:[e.jsx(t,{children:"Heads up!"}),e.jsx(s,{children:"You can add components to your app using the cli."})]})},o={render:()=>e.jsxs("div",{className:"w-[400px] space-y-4",children:[e.jsxs(r,{status:"info",children:[e.jsx(E,{className:"h-4 w-4 mr-2 inline"}),e.jsx(t,{children:"Info"}),e.jsx(s,{children:"This is an informational message."})]}),e.jsxs(r,{status:"success",children:[e.jsx(P,{className:"h-4 w-4 mr-2 inline"}),e.jsx(t,{children:"Success"}),e.jsx(s,{children:"Operation completed successfully!"})]}),e.jsxs(r,{status:"warning",children:[e.jsx(V,{className:"h-4 w-4 mr-2 inline"}),e.jsx(t,{children:"Warning"}),e.jsx(s,{children:"Please review your settings."})]}),e.jsxs(r,{status:"error",children:[e.jsx(k,{className:"h-4 w-4 mr-2 inline"}),e.jsx(t,{children:"Error"}),e.jsx(s,{children:"Something went wrong. Please try again."})]})]})},c={render:()=>e.jsxs(r,{variant:"solid",className:"w-[400px]",children:[e.jsx(t,{children:"Solid Variant"}),e.jsx(s,{children:"This is the solid variant with inverted colors."})]})},d={render:()=>e.jsx(r,{status:"error",className:"w-[400px]",children:e.jsxs("div",{className:"flex gap-2",children:[e.jsx(k,{className:"h-5 w-5"}),e.jsxs("div",{children:[e.jsx(t,{children:"Connection Failed"}),e.jsx(s,{children:"Unable to connect to the server. Please check your internet connection and try again."})]})]})})};var u,A,x;l.parameters={...l.parameters,docs:{...(u=l.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <Alert className="w-[400px]">
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
}`,...(x=(A=l.parameters)==null?void 0:A.docs)==null?void 0:x.source}}};var g,y,f;o.parameters={...o.parameters,docs:{...(g=o.parameters)==null?void 0:g.docs,source:{originalSource:`{
  render: () => <div className="w-[400px] space-y-4">
      <Alert status="info">
        <Info className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is an informational message.</AlertDescription>
      </Alert>
      
      <Alert status="success">
        <CheckCircle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Operation completed successfully!</AlertDescription>
      </Alert>
      
      <Alert status="warning">
        <AlertTriangle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>Please review your settings.</AlertDescription>
      </Alert>
      
      <Alert status="error">
        <AlertCircle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong. Please try again.</AlertDescription>
      </Alert>
    </div>
}`,...(f=(y=o.parameters)==null?void 0:y.docs)==null?void 0:f.source}}};var w,j,N;c.parameters={...c.parameters,docs:{...(w=c.parameters)==null?void 0:w.docs,source:{originalSource:`{
  render: () => <Alert variant="solid" className="w-[400px]">
      <AlertTitle>Solid Variant</AlertTitle>
      <AlertDescription>
        This is the solid variant with inverted colors.
      </AlertDescription>
    </Alert>
}`,...(N=(j=c.parameters)==null?void 0:j.docs)==null?void 0:N.source}}};var v,b,T;d.parameters={...d.parameters,docs:{...(v=d.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => <Alert status="error" className="w-[400px]">
      <div className="flex gap-2">
        <AlertCircle className="h-5 w-5" />
        <div>
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription>
            Unable to connect to the server. Please check your internet connection and try again.
          </AlertDescription>
        </div>
      </div>
    </Alert>
}`,...(T=(b=d.parameters)==null?void 0:b.docs)==null?void 0:T.source}}};const F=["Default","AllStatus","Solid","WithIcon"];export{o as AllStatus,l as Default,c as Solid,d as WithIcon,F as __namedExportsOrder,z as default};
