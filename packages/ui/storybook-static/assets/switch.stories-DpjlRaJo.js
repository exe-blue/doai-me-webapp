import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as a}from"./index-DwQS_Y10.js";import{u as te,P as X,c as re,a as se}from"./index-BRR7KkZm.js";import{u as $}from"./index-DKCiyFsV.js";import{u as ae}from"./index-51PM6oTJ.js";import{u as oe}from"./index-CpLX3slL.js";import{c as P}from"./utils-CDN07tui.js";import{L as p}from"./label-YJEBS_My.js";import"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-D63EQwXG.js";import"./index-C2vczdB5.js";var j="Switch",[ie]=se(j),[ce,ne]=ie(j),G=a.forwardRef((s,o)=>{const{__scopeSwitch:t,name:c,checked:i,defaultChecked:N,required:l,disabled:n,value:m="on",onCheckedChange:y,form:d,...C}=s,[u,h]=a.useState(null),g=$(o,b=>h(b)),L=a.useRef(!1),E=u?d||!!u.closest("form"):!0,[f,Z]=te({prop:i,defaultProp:N??!1,onChange:y,caller:j});return e.jsxs(ce,{scope:t,checked:f,disabled:n,children:[e.jsx(X.button,{type:"button",role:"switch","aria-checked":f,"aria-required":l,"data-state":V(f),"data-disabled":n?"":void 0,disabled:n,value:m,...C,ref:g,onClick:re(s.onClick,b=>{Z(ee=>!ee),E&&(L.current=b.isPropagationStopped(),L.current||b.stopPropagation())})}),E&&e.jsx(Q,{control:u,bubbles:!L.current,name:c,value:m,checked:f,required:l,disabled:n,form:d,style:{transform:"translateX(-100%)"}})]})});G.displayName=j;var J="SwitchThumb",K=a.forwardRef((s,o)=>{const{__scopeSwitch:t,...c}=s,i=ne(J,t);return e.jsx(X.span,{"data-state":V(i.checked),"data-disabled":i.disabled?"":void 0,...c,ref:o})});K.displayName=J;var de="SwitchBubbleInput",Q=a.forwardRef(({__scopeSwitch:s,control:o,checked:t,bubbles:c=!0,...i},N)=>{const l=a.useRef(null),n=$(l,N),m=ae(t),y=oe(o);return a.useEffect(()=>{const d=l.current;if(!d)return;const C=window.HTMLInputElement.prototype,h=Object.getOwnPropertyDescriptor(C,"checked").set;if(m!==t&&h){const g=new Event("click",{bubbles:c});h.call(d,t),d.dispatchEvent(g)}},[m,t,c]),e.jsx("input",{type:"checkbox","aria-hidden":!0,defaultChecked:t,...i,tabIndex:-1,ref:n,style:{...i.style,...y,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});Q.displayName=de;function V(s){return s?"checked":"unchecked"}var Y=G,le=K;const r=a.forwardRef(({className:s,...o},t)=>e.jsx(Y,{className:P("peer inline-flex h-6 w-11 shrink-0 cursor-pointer border-2 border-border items-center disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",s),...o,ref:t,children:e.jsx(le,{className:P("pointer-events-none block h-4 w-4 bg-primary border-2 mx-0.5 border-border ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-background")})}));r.displayName=Y.displayName;r.__docgenInfo={description:`Switch - RetroUI NeoBrutalist 스타일 토글 스위치\r
@see https://www.retroui.dev/docs/components/switch`,methods:[]};const ye={title:"Components/Switch",component:r,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 토글 스위치."}}}},x={render:()=>e.jsx(r,{})},w={render:()=>e.jsx(r,{defaultChecked:!0})},v={render:()=>e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(r,{id:"airplane-mode"}),e.jsx(p,{htmlFor:"airplane-mode",children:"Airplane Mode"})]})},S={render:()=>e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(r,{id:"disabled",disabled:!0}),e.jsx(p,{htmlFor:"disabled",className:"opacity-50",children:"Disabled"})]})},k={render:()=>e.jsxs("div",{className:"w-[300px] space-y-4",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx(p,{htmlFor:"notifications",children:"Notifications"}),e.jsx(r,{id:"notifications",defaultChecked:!0})]}),e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx(p,{htmlFor:"dark-mode",children:"Dark Mode"}),e.jsx(r,{id:"dark-mode"})]}),e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx(p,{htmlFor:"auto-update",children:"Auto Update"}),e.jsx(r,{id:"auto-update",defaultChecked:!0})]})]})};var R,_,F;x.parameters={...x.parameters,docs:{...(R=x.parameters)==null?void 0:R.docs,source:{originalSource:`{
  render: () => <Switch />
}`,...(F=(_=x.parameters)==null?void 0:_.docs)==null?void 0:F.source}}};var B,D,I;w.parameters={...w.parameters,docs:{...(B=w.parameters)==null?void 0:B.docs,source:{originalSource:`{
  render: () => <Switch defaultChecked />
}`,...(I=(D=w.parameters)==null?void 0:D.docs)==null?void 0:I.source}}};var M,A,T;v.parameters={...v.parameters,docs:{...(M=v.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
}`,...(T=(A=v.parameters)==null?void 0:A.docs)==null?void 0:T.source}}};var U,H,O;S.parameters={...S.parameters,docs:{...(U=S.parameters)==null?void 0:U.docs,source:{originalSource:`{
  render: () => <div className="flex items-center space-x-2">
      <Switch id="disabled" disabled />
      <Label htmlFor="disabled" className="opacity-50">Disabled</Label>
    </div>
}`,...(O=(H=S.parameters)==null?void 0:H.docs)==null?void 0:O.source}}};var W,q,z;k.parameters={...k.parameters,docs:{...(W=k.parameters)==null?void 0:W.docs,source:{originalSource:`{
  render: () => <div className="w-[300px] space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="notifications">Notifications</Label>
        <Switch id="notifications" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="dark-mode">Dark Mode</Label>
        <Switch id="dark-mode" />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-update">Auto Update</Label>
        <Switch id="auto-update" defaultChecked />
      </div>
    </div>
}`,...(z=(q=k.parameters)==null?void 0:q.docs)==null?void 0:z.source}}};const Ce=["Default","Checked","WithLabel","Disabled","SettingsExample"];export{w as Checked,x as Default,S as Disabled,k as SettingsExample,v as WithLabel,Ce as __namedExportsOrder,ye as default};
