import{j as r}from"./jsx-runtime-D_zvdyIk.js";import{r as d}from"./index-DwQS_Y10.js";import"./index-CRFEHIza.js";import{c as X}from"./index-D63EQwXG.js";import{c as F}from"./utils-CDN07tui.js";import"./index-Bls5tne7.js";import"./index-DKCiyFsV.js";function H(e,s=[]){let i=[];function n(c,l){const t=d.createContext(l);t.displayName=c+"Context";const a=i.length;i=[...i,l];const p=v=>{var y;const{scope:m,children:h,...x}=v,f=((y=m==null?void 0:m[e])==null?void 0:y[a])||t,W=d.useMemo(()=>x,Object.values(x));return r.jsx(f.Provider,{value:W,children:h})};p.displayName=c+"Provider";function S(v,m){var f;const h=((f=m==null?void 0:m[e])==null?void 0:f[a])||t,x=d.useContext(h);if(x)return x;if(l!==void 0)return l;throw new Error(`\`${v}\` must be used within \`${c}\``)}return[p,S]}const o=()=>{const c=i.map(l=>d.createContext(l));return function(t){const a=(t==null?void 0:t[e])||c;return d.useMemo(()=>({[`__scope${e}`]:{...t,[e]:a}}),[t,a])}};return o.scopeName=e,[n,q(o,...s)]}function q(...e){const s=e[0];if(e.length===1)return s;const i=()=>{const n=e.map(o=>({useScope:o(),scopeName:o.scopeName}));return function(c){const l=n.reduce((t,{useScope:a,scopeName:p})=>{const v=a(c)[`__scope${p}`];return{...t,...v}},{});return d.useMemo(()=>({[`__scope${s.scopeName}`]:l}),[l])}};return i.scopeName=s.scopeName,i}var z=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"],A=z.reduce((e,s)=>{const i=X(`Primitive.${s}`),n=d.forwardRef((o,c)=>{const{asChild:l,...t}=o,a=l?i:s;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),r.jsx(a,{...t,ref:c})});return n.displayName=`Primitive.${s}`,{...e,[s]:n}},{}),j="Progress",w=100,[J]=H(j),[K,Q]=J(j),B=d.forwardRef((e,s)=>{const{__scopeProgress:i,value:n=null,max:o,getValueLabel:c=Y,...l}=e;(o||o===0)&&!$(o)&&console.error(Z(`${o}`,"Progress"));const t=$(o)?o:w;n!==null&&!_(n,t)&&console.error(ee(`${n}`,"Progress"));const a=_(n,t)?n:null,p=P(a)?c(a,t):void 0;return r.jsx(K,{scope:i,value:a,max:t,children:r.jsx(A.div,{"aria-valuemax":t,"aria-valuemin":0,"aria-valuenow":P(a)?a:void 0,"aria-valuetext":p,role:"progressbar","data-state":k(a,t),"data-value":a??void 0,"data-max":t,...l,ref:s})})});B.displayName=j;var T="ProgressIndicator",U=d.forwardRef((e,s)=>{const{__scopeProgress:i,...n}=e,o=Q(T,i);return r.jsx(A.div,{"data-state":k(o.value,o.max),"data-value":o.value??void 0,"data-max":o.max,...n,ref:s})});U.displayName=T;function Y(e,s){return`${Math.round(e/s*100)}%`}function k(e,s){return e==null?"indeterminate":e===s?"complete":"loading"}function P(e){return typeof e=="number"}function $(e){return P(e)&&!isNaN(e)&&e>0}function _(e,s){return P(e)&&!isNaN(e)&&e<=s&&e>=0}function Z(e,s){return`Invalid prop \`max\` of value \`${e}\` supplied to \`${s}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${w}\`.`}function ee(e,s){return`Invalid prop \`value\` of value \`${e}\` supplied to \`${s}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${w} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`}var G=B,re=U;const u=d.forwardRef(({className:e,value:s,...i},n)=>r.jsx(G,{ref:n,className:F("relative h-4 w-full overflow-hidden bg-background border-2 border-border",e),...i,children:r.jsx(re,{className:"h-full w-full flex-1 bg-primary transition-all",style:{transform:`translateX(-${100-(s||0)}%)`}})}));u.displayName=G.displayName;u.__docgenInfo={description:`Progress - RetroUI NeoBrutalist 스타일 진행률 표시\r
@see https://www.retroui.dev/docs/components/progress`,methods:[]};const ce={title:"Components/Progress",component:u,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 진행률 표시 바."}}}},b={render:()=>r.jsx(u,{value:50,className:"w-[300px]"})},g={render:()=>r.jsxs("div",{className:"w-[300px] space-y-4",children:[r.jsxs("div",{children:[r.jsx("p",{className:"mb-1 text-sm font-bold",children:"0%"}),r.jsx(u,{value:0})]}),r.jsxs("div",{children:[r.jsx("p",{className:"mb-1 text-sm font-bold",children:"25%"}),r.jsx(u,{value:25})]}),r.jsxs("div",{children:[r.jsx("p",{className:"mb-1 text-sm font-bold",children:"50%"}),r.jsx(u,{value:50})]}),r.jsxs("div",{children:[r.jsx("p",{className:"mb-1 text-sm font-bold",children:"75%"}),r.jsx(u,{value:75})]}),r.jsxs("div",{children:[r.jsx("p",{className:"mb-1 text-sm font-bold",children:"100%"}),r.jsx(u,{value:100})]})]})},N={render:()=>r.jsxs("div",{className:"w-[300px]",children:[r.jsxs("div",{className:"mb-2 flex justify-between text-sm font-bold",children:[r.jsx("span",{children:"Progress"}),r.jsx("span",{children:"66%"})]}),r.jsx(u,{value:66})]})};var C,I,E;b.parameters={...b.parameters,docs:{...(C=b.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: () => <Progress value={50} className="w-[300px]" />
}`,...(E=(I=b.parameters)==null?void 0:I.docs)==null?void 0:E.source}}};var R,M,V;g.parameters={...g.parameters,docs:{...(R=g.parameters)==null?void 0:R.docs,source:{originalSource:`{
  render: () => <div className="w-[300px] space-y-4">
      <div>
        <p className="mb-1 text-sm font-bold">0%</p>
        <Progress value={0} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">25%</p>
        <Progress value={25} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">50%</p>
        <Progress value={50} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">75%</p>
        <Progress value={75} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">100%</p>
        <Progress value={100} />
      </div>
    </div>
}`,...(V=(M=g.parameters)==null?void 0:M.docs)==null?void 0:V.source}}};var D,L,O;N.parameters={...N.parameters,docs:{...(D=N.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: () => <div className="w-[300px]">
      <div className="mb-2 flex justify-between text-sm font-bold">
        <span>Progress</span>
        <span>66%</span>
      </div>
      <Progress value={66} />
    </div>
}`,...(O=(L=N.parameters)==null?void 0:L.docs)==null?void 0:O.source}}};const de=["Default","Values","WithLabel"];export{b as Default,g as Values,N as WithLabel,de as __namedExportsOrder,ce as default};
