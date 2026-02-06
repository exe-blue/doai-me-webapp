import{j as a}from"./jsx-runtime-D_zvdyIk.js";import{r as m,b as ee}from"./index-DwQS_Y10.js";import{u as ae}from"./index-Bgmmd5SI.js";import{u as F}from"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import{c as re}from"./index-D63EQwXG.js";import{c as _}from"./utils-CDN07tui.js";import"./index-Bls5tne7.js";import"./index-DKCiyFsV.js";function te(e,r=[]){let n=[];function d(t,u){const s=m.createContext(u);s.displayName=t+"Context";const c=n.length;n=[...n,u];const p=o=>{var I;const{scope:l,children:b,...g}=o,v=((I=l==null?void 0:l[e])==null?void 0:I[c])||s,A=m.useMemo(()=>g,Object.values(g));return a.jsx(v.Provider,{value:A,children:b})};p.displayName=t+"Provider";function h(o,l){var v;const b=((v=l==null?void 0:l[e])==null?void 0:v[c])||s,g=m.useContext(b);if(g)return g;if(u!==void 0)return u;throw new Error(`\`${o}\` must be used within \`${t}\``)}return[p,h]}const i=()=>{const t=n.map(u=>m.createContext(u));return function(s){const c=(s==null?void 0:s[e])||t;return m.useMemo(()=>({[`__scope${e}`]:{...s,[e]:c}}),[s,c])}};return i.scopeName=e,[d,ne(i,...r)]}function ne(...e){const r=e[0];if(e.length===1)return r;const n=()=>{const d=e.map(i=>({useScope:i(),scopeName:i.scopeName}));return function(t){const u=d.reduce((s,{useScope:c,scopeName:p})=>{const o=c(t)[`__scope${p}`];return{...s,...o}},{});return m.useMemo(()=>({[`__scope${r.scopeName}`]:u}),[u])}};return n.scopeName=r.scopeName,n}var se=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"],C=se.reduce((e,r)=>{const n=re(`Primitive.${r}`),d=m.forwardRef((i,t)=>{const{asChild:u,...s}=i,c=u?n:r;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),a.jsx(c,{...s,ref:t})});return d.displayName=`Primitive.${r}`,{...e,[r]:d}},{}),k={exports:{}},E={};/**
 * @license React
 * use-sync-external-store-shim.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var R;function oe(){if(R)return E;R=1;var e=ee();function r(o,l){return o===l&&(o!==0||1/o===1/l)||o!==o&&l!==l}var n=typeof Object.is=="function"?Object.is:r,d=e.useState,i=e.useEffect,t=e.useLayoutEffect,u=e.useDebugValue;function s(o,l){var b=l(),g=d({inst:{value:b,getSnapshot:l}}),v=g[0].inst,A=g[1];return t(function(){v.value=b,v.getSnapshot=l,c(v)&&A({inst:v})},[o,b,l]),i(function(){return c(v)&&A({inst:v}),o(function(){c(v)&&A({inst:v})})},[o]),u(b),b}function c(o){var l=o.getSnapshot;o=o.value;try{var b=l();return!n(o,b)}catch{return!0}}function p(o,l){return l()}var h=typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"?p:s;return E.useSyncExternalStore=e.useSyncExternalStore!==void 0?e.useSyncExternalStore:h,E}var $;function ce(){return $||($=1,k.exports=oe()),k.exports}var le=ce();function de(){return le.useSyncExternalStore(ie,()=>!0,()=>!1)}function ie(){return()=>{}}var L="Avatar",[ue]=te(L),[me,X]=ue(L),K=m.forwardRef((e,r)=>{const{__scopeAvatar:n,...d}=e,[i,t]=m.useState("idle");return a.jsx(me,{scope:n,imageLoadingStatus:i,onImageLoadingStatusChange:t,children:a.jsx(C.span,{...d,ref:r})})});K.displayName=L;var W="AvatarImage",Q=m.forwardRef((e,r)=>{const{__scopeAvatar:n,src:d,onLoadingStatusChange:i=()=>{},...t}=e,u=X(W,n),s=ve(d,t),c=ae(p=>{i(p),u.onImageLoadingStatusChange(p)});return F(()=>{s!=="idle"&&c(s)},[s,c]),s==="loaded"?a.jsx(C.img,{...t,ref:r,src:d}):null});Q.displayName=W;var Y="AvatarFallback",Z=m.forwardRef((e,r)=>{const{__scopeAvatar:n,delayMs:d,...i}=e,t=X(Y,n),[u,s]=m.useState(d===void 0);return m.useEffect(()=>{if(d!==void 0){const c=window.setTimeout(()=>s(!0),d);return()=>window.clearTimeout(c)}},[d]),u&&t.imageLoadingStatus!=="loaded"?a.jsx(C.span,{...i,ref:r}):null});Z.displayName=Y;function P(e,r){return e?r?(e.src!==r&&(e.src=r),e.complete&&e.naturalWidth>0?"loaded":"loading"):"error":"idle"}function ve(e,{referrerPolicy:r,crossOrigin:n}){const d=de(),i=m.useRef(null),t=d?(i.current||(i.current=new window.Image),i.current):null,[u,s]=m.useState(()=>P(t,e));return F(()=>{s(P(t,e))},[t,e]),F(()=>{const c=o=>()=>{s(o)};if(!t)return;const p=c("loaded"),h=c("error");return t.addEventListener("load",p),t.addEventListener("error",h),r&&(t.referrerPolicy=r),typeof n=="string"&&(t.crossOrigin=n),()=>{t.removeEventListener("load",p),t.removeEventListener("error",h)}},[t,n,r]),u}var fe=K,pe=Q,xe=Z;const f=m.forwardRef(({className:e,...r},n)=>a.jsx(fe,{ref:n,className:_("relative flex h-14 w-14 border-2 border-border rounded-full overflow-hidden",e),...r}));f.displayName="Avatar";const j=m.forwardRef(({className:e,...r},n)=>a.jsx(pe,{ref:n,className:_("aspect-square h-full w-full",e),...r}));j.displayName="AvatarImage";const x=m.forwardRef(({className:e,...r},n)=>a.jsx(xe,{ref:n,className:_("flex h-full w-full items-center justify-center rounded-full bg-primary text-primary-foreground font-bold",e),...r}));x.displayName="AvatarFallback";f.__docgenInfo={description:`Avatar - RetroUI NeoBrutalist 스타일 아바타\r
@see https://www.retroui.dev/docs/components/avatar`,methods:[],displayName:"Avatar"};j.__docgenInfo={description:"",methods:[],displayName:"AvatarImage"};x.__docgenInfo={description:"",methods:[],displayName:"AvatarFallback"};const ke={title:"Components/Avatar",component:f,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 아바타. 두꺼운 테두리."}}}},S={render:()=>a.jsxs(f,{children:[a.jsx(j,{src:"https://github.com/shadcn.png",alt:"User"}),a.jsx(x,{children:"CN"})]})},N={render:()=>a.jsxs(f,{children:[a.jsx(j,{src:"",alt:"User"}),a.jsx(x,{children:"JD"})]})},y={render:()=>a.jsxs("div",{className:"flex items-center gap-4",children:[a.jsx(f,{className:"h-6 w-6",children:a.jsx(x,{className:"text-xs",children:"S"})}),a.jsx(f,{className:"h-10 w-10",children:a.jsx(x,{children:"M"})}),a.jsx(f,{className:"h-16 w-16",children:a.jsx(x,{className:"text-lg",children:"L"})}),a.jsx(f,{className:"h-24 w-24",children:a.jsx(x,{className:"text-2xl",children:"XL"})})]})},w={render:()=>a.jsxs("div",{className:"flex -space-x-2",children:[a.jsx(f,{className:"border-4 border-background",children:a.jsx(x,{className:"bg-primary text-primary-foreground",children:"A"})}),a.jsx(f,{className:"border-4 border-background",children:a.jsx(x,{className:"bg-secondary text-secondary-foreground",children:"B"})}),a.jsx(f,{className:"border-4 border-background",children:a.jsx(x,{className:"bg-accent text-accent-foreground",children:"C"})}),a.jsx(f,{className:"border-4 border-background",children:a.jsx(x,{children:"+5"})})]})};var M,U,D;S.parameters={...S.parameters,docs:{...(M=S.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: () => <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="User" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
}`,...(D=(U=S.parameters)==null?void 0:U.docs)==null?void 0:D.source}}};var q,B,G;N.parameters={...N.parameters,docs:{...(q=N.parameters)==null?void 0:q.docs,source:{originalSource:`{
  render: () => <Avatar>
      <AvatarImage src="" alt="User" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
}`,...(G=(B=N.parameters)==null?void 0:B.docs)==null?void 0:G.source}}};var O,H,T;y.parameters={...y.parameters,docs:{...(O=y.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">S</AvatarFallback>
      </Avatar>
      <Avatar className="h-10 w-10">
        <AvatarFallback>M</AvatarFallback>
      </Avatar>
      <Avatar className="h-16 w-16">
        <AvatarFallback className="text-lg">L</AvatarFallback>
      </Avatar>
      <Avatar className="h-24 w-24">
        <AvatarFallback className="text-2xl">XL</AvatarFallback>
      </Avatar>
    </div>
}`,...(T=(H=y.parameters)==null?void 0:H.docs)==null?void 0:T.source}}};var V,z,J;w.parameters={...w.parameters,docs:{...(V=w.parameters)==null?void 0:V.docs,source:{originalSource:`{
  render: () => <div className="flex -space-x-2">
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-primary text-primary-foreground">A</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-secondary text-secondary-foreground">B</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-accent text-accent-foreground">C</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback>+5</AvatarFallback>
      </Avatar>
    </div>
}`,...(J=(z=w.parameters)==null?void 0:z.docs)==null?void 0:J.source}}};const Ee=["Default","Fallback","Sizes","Group"];export{S as Default,N as Fallback,w as Group,y as Sizes,Ee as __namedExportsOrder,ke as default};
