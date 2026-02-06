import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as b}from"./index-DwQS_Y10.js";import{u as J,P as j,c as C,a as Q}from"./index-BRR7KkZm.js";import{R as X,I as Z,c as L}from"./index-BU1eSCxN.js";import{P as ee}from"./index-CNOV0ziW.js";import{u as ae}from"./index-D5AAXRxa.js";import{u as te}from"./index-C-KcwZw6.js";import{c as N}from"./utils-CDN07tui.js";import"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-DKCiyFsV.js";import"./index-Bgmmd5SI.js";var w="Tabs",[se]=Q(w,[L]),F=L(),[re,A]=se(w),G=b.forwardRef((a,t)=>{const{__scopeTabs:s,value:r,onValueChange:i,defaultValue:u,orientation:n="horizontal",dir:v,activationMode:g="automatic",...m}=a,c=ae(v),[o,p]=J({prop:r,onChange:i,defaultProp:u??"",caller:w});return e.jsx(re,{scope:s,baseId:te(),value:o,onValueChange:p,orientation:n,dir:c,activationMode:g,children:e.jsx(j.div,{dir:c,"data-orientation":n,...m,ref:t})})});G.displayName=w;var $="TabsList",k=b.forwardRef((a,t)=>{const{__scopeTabs:s,loop:r=!0,...i}=a,u=A($,s),n=F(s);return e.jsx(X,{asChild:!0,...n,orientation:u.orientation,dir:u.dir,loop:r,children:e.jsx(j.div,{role:"tablist","aria-orientation":u.orientation,...i,ref:t})})});k.displayName=$;var O="TabsTrigger",B=b.forwardRef((a,t)=>{const{__scopeTabs:s,value:r,disabled:i=!1,...u}=a,n=A(O,s),v=F(s),g=W(n.baseId,r),m=Y(n.baseId,r),c=r===n.value;return e.jsx(Z,{asChild:!0,...v,focusable:!i,active:c,children:e.jsx(j.button,{type:"button",role:"tab","aria-selected":c,"aria-controls":m,"data-state":c?"active":"inactive","data-disabled":i?"":void 0,disabled:i,id:g,...u,ref:t,onMouseDown:C(a.onMouseDown,o=>{!i&&o.button===0&&o.ctrlKey===!1?n.onValueChange(r):o.preventDefault()}),onKeyDown:C(a.onKeyDown,o=>{[" ","Enter"].includes(o.key)&&n.onValueChange(r)}),onFocus:C(a.onFocus,()=>{const o=n.activationMode!=="manual";!c&&!i&&o&&n.onValueChange(r)})})})});B.displayName=O;var K="TabsContent",U=b.forwardRef((a,t)=>{const{__scopeTabs:s,value:r,forceMount:i,children:u,...n}=a,v=A(K,s),g=W(v.baseId,r),m=Y(v.baseId,r),c=r===v.value,o=b.useRef(c);return b.useEffect(()=>{const p=requestAnimationFrame(()=>o.current=!1);return()=>cancelAnimationFrame(p)},[]),e.jsx(ee,{present:i||c,children:({present:p})=>e.jsx(j.div,{"data-state":c?"active":"inactive","data-orientation":v.orientation,role:"tabpanel","aria-labelledby":g,hidden:!p,id:m,tabIndex:0,...n,ref:t,style:{...a.style,animationDuration:o.current?"0s":void 0},children:p&&u})})});U.displayName=K;function W(a,t){return`${a}-trigger-${t}`}function Y(a,t){return`${a}-content-${t}`}var ne=G,q=k,z=B,H=U;const y=ne,T=b.forwardRef(({className:a,...t},s)=>e.jsx(q,{ref:s,className:N("inline-flex h-10 items-center justify-center bg-muted p-1 text-muted-foreground","border-2 border-border",a),...t}));T.displayName=q.displayName;const l=b.forwardRef(({className:a,...t},s)=>e.jsx(z,{ref:s,className:N("inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-head font-bold transition-all","focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2","disabled:pointer-events-none disabled:opacity-50","data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[2px_2px_0px_0px] data-[state=active]:shadow-border",a),...t}));l.displayName=z.displayName;const d=b.forwardRef(({className:a,...t},s)=>e.jsx(H,{ref:s,className:N("mt-2 p-4 border-2 border-foreground bg-background","focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",a),...t}));d.displayName=H.displayName;T.__docgenInfo={description:"TabsList - 탭 버튼 목록",methods:[]};l.__docgenInfo={description:"TabsTrigger - RetroUI/NeoBrutalist 스타일 탭 버튼",methods:[]};d.__docgenInfo={description:"TabsContent - 탭 콘텐츠",methods:[]};const he={title:"Components/Tabs",component:y,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 탭 네비게이션."}}}},f={render:()=>e.jsxs(y,{defaultValue:"tab1",className:"w-[400px]",children:[e.jsxs(T,{children:[e.jsx(l,{value:"tab1",children:"Account"}),e.jsx(l,{value:"tab2",children:"Password"})]}),e.jsx(d,{value:"tab1",children:e.jsx("p",{children:"Make changes to your account here."})}),e.jsx(d,{value:"tab2",children:e.jsx("p",{children:"Change your password here."})})]})},h={render:()=>e.jsxs(y,{defaultValue:"overview",className:"w-[500px]",children:[e.jsxs(T,{className:"grid w-full grid-cols-4",children:[e.jsx(l,{value:"overview",children:"Overview"}),e.jsx(l,{value:"analytics",children:"Analytics"}),e.jsx(l,{value:"reports",children:"Reports"}),e.jsx(l,{value:"settings",children:"Settings"})]}),e.jsxs(d,{value:"overview",children:[e.jsx("h3",{className:"font-bold mb-2",children:"Overview"}),e.jsx("p",{children:"Your dashboard overview."})]}),e.jsxs(d,{value:"analytics",children:[e.jsx("h3",{className:"font-bold mb-2",children:"Analytics"}),e.jsx("p",{children:"View analytics data."})]}),e.jsxs(d,{value:"reports",children:[e.jsx("h3",{className:"font-bold mb-2",children:"Reports"}),e.jsx("p",{children:"Generate reports."})]}),e.jsxs(d,{value:"settings",children:[e.jsx("h3",{className:"font-bold mb-2",children:"Settings"}),e.jsx("p",{children:"Configure preferences."})]})]})},x={render:()=>e.jsxs(y,{defaultValue:"active",className:"w-[400px]",children:[e.jsxs(T,{children:[e.jsx(l,{value:"active",children:"Active"}),e.jsx(l,{value:"disabled",disabled:!0,children:"Disabled"}),e.jsx(l,{value:"another",children:"Another"})]}),e.jsx(d,{value:"active",children:"Active tab content."}),e.jsx(d,{value:"another",children:"Another tab content."})]})};var _,R,I;f.parameters={...f.parameters,docs:{...(_=f.parameters)==null?void 0:_.docs,source:{originalSource:`{
  render: () => <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Account</TabsTrigger>
        <TabsTrigger value="tab2">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p>Make changes to your account here.</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p>Change your password here.</p>
      </TabsContent>
    </Tabs>
}`,...(I=(R=f.parameters)==null?void 0:R.docs)==null?void 0:I.source}}};var S,V,M;h.parameters={...h.parameters,docs:{...(S=h.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: () => <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <h3 className="font-bold mb-2">Overview</h3>
        <p>Your dashboard overview.</p>
      </TabsContent>
      <TabsContent value="analytics">
        <h3 className="font-bold mb-2">Analytics</h3>
        <p>View analytics data.</p>
      </TabsContent>
      <TabsContent value="reports">
        <h3 className="font-bold mb-2">Reports</h3>
        <p>Generate reports.</p>
      </TabsContent>
      <TabsContent value="settings">
        <h3 className="font-bold mb-2">Settings</h3>
        <p>Configure preferences.</p>
      </TabsContent>
    </Tabs>
}`,...(M=(V=h.parameters)==null?void 0:V.docs)==null?void 0:M.source}}};var P,D,E;x.parameters={...x.parameters,docs:{...(P=x.parameters)==null?void 0:P.docs,source:{originalSource:`{
  render: () => <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
        <TabsTrigger value="another">Another</TabsTrigger>
      </TabsList>
      <TabsContent value="active">Active tab content.</TabsContent>
      <TabsContent value="another">Another tab content.</TabsContent>
    </Tabs>
}`,...(E=(D=x.parameters)==null?void 0:D.docs)==null?void 0:E.source}}};const xe=["Default","MultipleTabs","WithDisabled"];export{f as Default,h as MultipleTabs,x as WithDisabled,xe as __namedExportsOrder,he as default};
