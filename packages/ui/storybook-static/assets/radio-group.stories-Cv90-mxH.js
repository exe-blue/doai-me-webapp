import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as n}from"./index-DwQS_Y10.js";import{u as ne,P as y,c as F,a as q}from"./index-BRR7KkZm.js";import{u as C}from"./index-DKCiyFsV.js";import{R as de,I as le,c as K}from"./index-BU1eSCxN.js";import{u as ce}from"./index-D5AAXRxa.js";import{u as me}from"./index-CpLX3slL.js";import{u as pe}from"./index-51PM6oTJ.js";import{P as ue}from"./index-CNOV0ziW.js";import{c as U}from"./index-C2vczdB5.js";import{c as H}from"./utils-CDN07tui.js";import{L as u}from"./label-YJEBS_My.js";import"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-C-KcwZw6.js";import"./index-Bgmmd5SI.js";import"./index-D63EQwXG.js";var _="Radio",[fe,W]=q(_),[xe,ve]=fe(_),$=n.forwardRef((r,t)=>{const{__scopeRadio:o,name:d,checked:a=!1,required:s,disabled:l,value:x="on",onCheck:m,form:v,...h}=r,[f,R]=n.useState(null),i=C(t,N=>R(N)),p=n.useRef(!1),j=f?v||!!f.closest("form"):!0;return e.jsxs(xe,{scope:o,checked:a,disabled:l,children:[e.jsx(y.button,{type:"button",role:"radio","aria-checked":a,"data-state":Q(a),"data-disabled":l?"":void 0,disabled:l,value:x,...h,ref:i,onClick:F(r.onClick,N=>{a||m==null||m(),j&&(p.current=N.isPropagationStopped(),p.current||N.stopPropagation())})}),j&&e.jsx(J,{control:f,bubbles:!p.current,name:d,value:x,checked:a,required:s,disabled:l,form:v,style:{transform:"translateX(-100%)"}})]})});$.displayName=_;var X="RadioIndicator",Y=n.forwardRef((r,t)=>{const{__scopeRadio:o,forceMount:d,...a}=r,s=ve(X,o);return e.jsx(ue,{present:d||s.checked,children:e.jsx(y.span,{"data-state":Q(s.checked),"data-disabled":s.disabled?"":void 0,...a,ref:t})})});Y.displayName=X;var he="RadioBubbleInput",J=n.forwardRef(({__scopeRadio:r,control:t,checked:o,bubbles:d=!0,...a},s)=>{const l=n.useRef(null),x=C(l,s),m=pe(o),v=me(t);return n.useEffect(()=>{const h=l.current;if(!h)return;const f=window.HTMLInputElement.prototype,i=Object.getOwnPropertyDescriptor(f,"checked").set;if(m!==o&&i){const p=new Event("click",{bubbles:d});i.call(h,o),h.dispatchEvent(p)}},[m,o,d]),e.jsx(y.input,{type:"radio","aria-hidden":!0,defaultChecked:o,...a,tabIndex:-1,ref:x,style:{...a.style,...v,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});J.displayName=he;function Q(r){return r?"checked":"unchecked"}var Re=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],L="RadioGroup",[be]=q(L,[K,W]),Z=K(),ee=W(),[je,Ne]=be(L),oe=n.forwardRef((r,t)=>{const{__scopeRadioGroup:o,name:d,defaultValue:a,value:s,required:l=!1,disabled:x=!1,orientation:m,dir:v,loop:h=!0,onValueChange:f,...R}=r,i=Z(o),p=ce(v),[j,N]=ne({prop:s,defaultProp:a??null,onChange:f,caller:L});return e.jsx(je,{scope:o,name:d,required:l,disabled:x,value:j,onValueChange:N,children:e.jsx(de,{asChild:!0,...i,orientation:m,dir:p,loop:h,children:e.jsx(y.div,{role:"radiogroup","aria-required":l,"aria-orientation":m,"data-disabled":x?"":void 0,dir:p,...R,ref:t})})})});oe.displayName=L;var ae="RadioGroupItem",re=n.forwardRef((r,t)=>{const{__scopeRadioGroup:o,disabled:d,...a}=r,s=Ne(ae,o),l=s.disabled||d,x=Z(o),m=ee(o),v=n.useRef(null),h=C(t,v),f=s.value===a.value,R=n.useRef(!1);return n.useEffect(()=>{const i=j=>{Re.includes(j.key)&&(R.current=!0)},p=()=>R.current=!1;return document.addEventListener("keydown",i),document.addEventListener("keyup",p),()=>{document.removeEventListener("keydown",i),document.removeEventListener("keyup",p)}},[]),e.jsx(le,{asChild:!0,...x,focusable:!l,active:f,children:e.jsx($,{disabled:l,required:s.required,checked:f,...m,...a,name:s.name,ref:h,onCheck:()=>s.onValueChange(a.value),onKeyDown:F(i=>{i.key==="Enter"&&i.preventDefault()}),onFocus:F(a.onFocus,()=>{var i;R.current&&((i=v.current)==null||i.click())})})})});re.displayName=ae;var ge="RadioGroupIndicator",te=n.forwardRef((r,t)=>{const{__scopeRadioGroup:o,...d}=r,a=ee(o);return e.jsx(Y,{...a,...d,ref:t})});te.displayName=ge;var se=oe,ie=re,we=te;const Ge=U("border-border border-2",{variants:{variant:{default:"",outline:"",solid:""},size:{sm:"h-4 w-4",md:"h-5 w-5",lg:"h-6 w-6"}},defaultVariants:{variant:"default",size:"md"}}),Ie=U("flex",{variants:{variant:{default:"bg-primary border-2 border-border",outline:"border-2 border-border",solid:"bg-border"},size:{sm:"h-2 w-2",md:"h-2.5 w-2.5",lg:"h-3.5 w-3.5"}},defaultVariants:{variant:"default",size:"md"}}),b=n.forwardRef(({className:r,...t},o)=>e.jsx(se,{className:H("grid gap-2",r),...t,ref:o}));b.displayName=se.displayName;const c=n.forwardRef(({className:r,variant:t,size:o,...d},a)=>e.jsx(ie,{ref:a,className:H(Ge({variant:t,size:o}),r),...d,children:e.jsx(we,{className:"flex justify-center items-center",children:e.jsx("span",{className:Ie({variant:t,size:o})})})}));c.displayName=ie.displayName;b.__docgenInfo={description:"",methods:[]};c.__docgenInfo={description:"",methods:[],composes:["VariantProps"]};const Ke={title:"Components/RadioGroup",component:b,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"NeoBrutalist 스타일 라디오 버튼 그룹."}}}},g={render:()=>e.jsxs(b,{defaultValue:"option-one",children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"option-one",id:"option-one"}),e.jsx(u,{htmlFor:"option-one",children:"Option One"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"option-two",id:"option-two"}),e.jsx(u,{htmlFor:"option-two",children:"Option Two"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"option-three",id:"option-three"}),e.jsx(u,{htmlFor:"option-three",children:"Option Three"})]})]})},w={render:()=>e.jsxs(b,{defaultValue:"comfortable",children:[e.jsxs("div",{className:"flex items-start space-x-2",children:[e.jsx(c,{value:"default",id:"r1",className:"mt-1"}),e.jsxs("div",{children:[e.jsx(u,{htmlFor:"r1",children:"Default"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"Standard spacing for all content."})]})]}),e.jsxs("div",{className:"flex items-start space-x-2",children:[e.jsx(c,{value:"comfortable",id:"r2",className:"mt-1"}),e.jsxs("div",{children:[e.jsx(u,{htmlFor:"r2",children:"Comfortable"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"More space between items."})]})]}),e.jsxs("div",{className:"flex items-start space-x-2",children:[e.jsx(c,{value:"compact",id:"r3",className:"mt-1"}),e.jsxs("div",{children:[e.jsx(u,{htmlFor:"r3",children:"Compact"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"Less space, more density."})]})]})]})},G={render:()=>e.jsxs(b,{defaultValue:"medium",className:"flex space-x-4",children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"small",id:"small"}),e.jsx(u,{htmlFor:"small",children:"Small"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"medium",id:"medium"}),e.jsx(u,{htmlFor:"medium",children:"Medium"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"large",id:"large"}),e.jsx(u,{htmlFor:"large",children:"Large"})]})]})},I={render:()=>e.jsxs(b,{defaultValue:"option-one",children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"option-one",id:"d1"}),e.jsx(u,{htmlFor:"d1",children:"Enabled"})]}),e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(c,{value:"option-two",id:"d2",disabled:!0}),e.jsx(u,{htmlFor:"d2",className:"opacity-50",children:"Disabled"})]})]})};var E,S,P;g.parameters={...g.parameters,docs:{...(E=g.parameters)==null?void 0:E.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="option-one" />
        <Label htmlFor="option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="option-two" />
        <Label htmlFor="option-two">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="option-three" />
        <Label htmlFor="option-three">Option Three</Label>
      </div>
    </RadioGroup>
}`,...(P=(S=g.parameters)==null?void 0:S.docs)==null?void 0:P.source}}};var D,V,k;w.parameters={...w.parameters,docs:{...(D=w.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue="comfortable">
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="default" id="r1" className="mt-1" />
        <div>
          <Label htmlFor="r1">Default</Label>
          <p className="text-sm text-muted-foreground">Standard spacing for all content.</p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="comfortable" id="r2" className="mt-1" />
        <div>
          <Label htmlFor="r2">Comfortable</Label>
          <p className="text-sm text-muted-foreground">More space between items.</p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="compact" id="r3" className="mt-1" />
        <div>
          <Label htmlFor="r3">Compact</Label>
          <p className="text-sm text-muted-foreground">Less space, more density.</p>
        </div>
      </div>
    </RadioGroup>
}`,...(k=(V=w.parameters)==null?void 0:V.docs)==null?void 0:k.source}}};var O,A,M;G.parameters={...G.parameters,docs:{...(O=G.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue="medium" className="flex space-x-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="small" id="small" />
        <Label htmlFor="small">Small</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="medium" id="medium" />
        <Label htmlFor="medium">Medium</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="large" id="large" />
        <Label htmlFor="large">Large</Label>
      </div>
    </RadioGroup>
}`,...(M=(A=G.parameters)==null?void 0:A.docs)==null?void 0:M.source}}};var T,z,B;I.parameters={...I.parameters,docs:{...(T=I.parameters)==null?void 0:T.docs,source:{originalSource:`{
  render: () => <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="d1" />
        <Label htmlFor="d1">Enabled</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="d2" disabled />
        <Label htmlFor="d2" className="opacity-50">Disabled</Label>
      </div>
    </RadioGroup>
}`,...(B=(z=I.parameters)==null?void 0:z.docs)==null?void 0:B.source}}};const Ue=["Default","WithDescription","Horizontal","Disabled"];export{g as Default,I as Disabled,G as Horizontal,w as WithDescription,Ue as __namedExportsOrder,Ke as default};
