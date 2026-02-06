import{j as o}from"./jsx-runtime-D_zvdyIk.js";import{r as i}from"./index-DwQS_Y10.js";import{u as xe,P as x,c as h,a as ve,b as Ce}from"./index-BRR7KkZm.js";import{c as je,u as w}from"./index-DKCiyFsV.js";import{u as O}from"./index-C-KcwZw6.js";import{P as ye,D as Ne}from"./index-ChTz41eB.js";import{h as _e,R as Re,u as be,F as Ee}from"./index-BP6NHBfx.js";import{P as S}from"./index-CNOV0ziW.js";import{c as m}from"./utils-CDN07tui.js";import{c as Te}from"./createLucideIcon-DjN-KrIq.js";import{B as p}from"./button-gDusbB4c.js";import{I as L}from"./input-BOlX0cV-.js";import{L as $}from"./label-YJEBS_My.js";import"./index-D8uAi14N.js";import"./index-CRFEHIza.js";import"./index-Bls5tne7.js";import"./index-Bgmmd5SI.js";import"./index-D63EQwXG.js";import"./index-C2vczdB5.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],Pe=Te("x",Ie);function Oe(e){const t=we(e),n=i.forwardRef((a,r)=>{const{children:s,...l}=a,c=i.Children.toArray(s),d=c.find(Ae);if(d){const u=d.props.children,D=c.map(_=>_===d?i.Children.count(u)>1?i.Children.only(null):i.isValidElement(u)?u.props.children:null:_);return o.jsx(t,{...l,ref:r,children:i.isValidElement(u)?i.cloneElement(u,void 0,D):null})}return o.jsx(t,{...l,ref:r,children:s})});return n.displayName=`${e}.Slot`,n}function we(e){const t=i.forwardRef((n,a)=>{const{children:r,...s}=n;if(i.isValidElement(r)){const l=Me(r),c=Fe(s,r.props);return r.type!==i.Fragment&&(c.ref=a?je(a,l):l),i.cloneElement(r,c)}return i.Children.count(r)>1?i.Children.only(null):null});return t.displayName=`${e}.SlotClone`,t}var Se=Symbol("radix.slottable");function Ae(e){return i.isValidElement(e)&&typeof e.type=="function"&&"__radixId"in e.type&&e.type.__radixId===Se}function Fe(e,t){const n={...t};for(const a in t){const r=e[a],s=t[a];/^on[A-Z]/.test(a)?r&&s?n[a]=(...c)=>{const d=s(...c);return r(...c),d}:r&&(n[a]=r):a==="style"?n[a]={...r,...s}:a==="className"&&(n[a]=[r,s].filter(Boolean).join(" "))}return{...e,...n}}function Me(e){var a,r;let t=(a=Object.getOwnPropertyDescriptor(e.props,"ref"))==null?void 0:a.get,n=t&&"isReactWarning"in t&&t.isReactWarning;return n?e.ref:(t=(r=Object.getOwnPropertyDescriptor(e,"ref"))==null?void 0:r.get,n=t&&"isReactWarning"in t&&t.isReactWarning,n?e.props.ref:e.props.ref||e.ref)}var I="Dialog",[X]=ve(I),[Be,g]=X(I),Y=e=>{const{__scopeDialog:t,children:n,open:a,defaultOpen:r,onOpenChange:s,modal:l=!0}=e,c=i.useRef(null),d=i.useRef(null),[u,D]=xe({prop:a,defaultProp:r??!1,onChange:s,caller:I});return o.jsx(Be,{scope:t,triggerRef:c,contentRef:d,contentId:O(),titleId:O(),descriptionId:O(),open:u,onOpenChange:D,onOpenToggle:i.useCallback(()=>D(_=>!_),[D]),modal:l,children:n})};Y.displayName=I;var Q="DialogTrigger",ee=i.forwardRef((e,t)=>{const{__scopeDialog:n,...a}=e,r=g(Q,n),s=w(t,r.triggerRef);return o.jsx(x.button,{type:"button","aria-haspopup":"dialog","aria-expanded":r.open,"aria-controls":r.contentId,"data-state":M(r.open),...a,ref:s,onClick:h(e.onClick,r.onOpenToggle)})});ee.displayName=Q;var A="DialogPortal",[ke,oe]=X(A,{forceMount:void 0}),te=e=>{const{__scopeDialog:t,forceMount:n,children:a,container:r}=e,s=g(A,t);return o.jsx(ke,{scope:t,forceMount:n,children:i.Children.map(a,l=>o.jsx(S,{present:n||s.open,children:o.jsx(ye,{asChild:!0,container:r,children:l})}))})};te.displayName=A;var T="DialogOverlay",ne=i.forwardRef((e,t)=>{const n=oe(T,e.__scopeDialog),{forceMount:a=n.forceMount,...r}=e,s=g(T,e.__scopeDialog);return s.modal?o.jsx(S,{present:a||s.open,children:o.jsx(Le,{...r,ref:t})}):null});ne.displayName=T;var We=Oe("DialogOverlay.RemoveScroll"),Le=i.forwardRef((e,t)=>{const{__scopeDialog:n,...a}=e,r=g(T,n);return o.jsx(Re,{as:We,allowPinchZoom:!0,shards:[r.contentRef],children:o.jsx(x.div,{"data-state":M(r.open),...a,ref:t,style:{pointerEvents:"auto",...a.style}})})}),f="DialogContent",re=i.forwardRef((e,t)=>{const n=oe(f,e.__scopeDialog),{forceMount:a=n.forceMount,...r}=e,s=g(f,e.__scopeDialog);return o.jsx(S,{present:a||s.open,children:s.modal?o.jsx($e,{...r,ref:t}):o.jsx(He,{...r,ref:t})})});re.displayName=f;var $e=i.forwardRef((e,t)=>{const n=g(f,e.__scopeDialog),a=i.useRef(null),r=w(t,n.contentRef,a);return i.useEffect(()=>{const s=a.current;if(s)return _e(s)},[]),o.jsx(ae,{...e,ref:r,trapFocus:n.open,disableOutsidePointerEvents:!0,onCloseAutoFocus:h(e.onCloseAutoFocus,s=>{var l;s.preventDefault(),(l=n.triggerRef.current)==null||l.focus()}),onPointerDownOutside:h(e.onPointerDownOutside,s=>{const l=s.detail.originalEvent,c=l.button===0&&l.ctrlKey===!0;(l.button===2||c)&&s.preventDefault()}),onFocusOutside:h(e.onFocusOutside,s=>s.preventDefault())})}),He=i.forwardRef((e,t)=>{const n=g(f,e.__scopeDialog),a=i.useRef(!1),r=i.useRef(!1);return o.jsx(ae,{...e,ref:t,trapFocus:!1,disableOutsidePointerEvents:!1,onCloseAutoFocus:s=>{var l,c;(l=e.onCloseAutoFocus)==null||l.call(e,s),s.defaultPrevented||(a.current||(c=n.triggerRef.current)==null||c.focus(),s.preventDefault()),a.current=!1,r.current=!1},onInteractOutside:s=>{var d,u;(d=e.onInteractOutside)==null||d.call(e,s),s.defaultPrevented||(a.current=!0,s.detail.originalEvent.type==="pointerdown"&&(r.current=!0));const l=s.target;((u=n.triggerRef.current)==null?void 0:u.contains(l))&&s.preventDefault(),s.detail.originalEvent.type==="focusin"&&r.current&&s.preventDefault()}})}),ae=i.forwardRef((e,t)=>{const{__scopeDialog:n,trapFocus:a,onOpenAutoFocus:r,onCloseAutoFocus:s,...l}=e,c=g(f,n),d=i.useRef(null),u=w(t,d);return be(),o.jsxs(o.Fragment,{children:[o.jsx(Ee,{asChild:!0,loop:!0,trapped:a,onMountAutoFocus:r,onUnmountAutoFocus:s,children:o.jsx(Ne,{role:"dialog",id:c.contentId,"aria-describedby":c.descriptionId,"aria-labelledby":c.titleId,"data-state":M(c.open),...l,ref:u,onDismiss:()=>c.onOpenChange(!1)})}),o.jsxs(o.Fragment,{children:[o.jsx(Ve,{titleId:c.titleId}),o.jsx(ze,{contentRef:d,descriptionId:c.descriptionId})]})]})}),F="DialogTitle",se=i.forwardRef((e,t)=>{const{__scopeDialog:n,...a}=e,r=g(F,n);return o.jsx(x.h2,{id:r.titleId,...a,ref:t})});se.displayName=F;var ie="DialogDescription",le=i.forwardRef((e,t)=>{const{__scopeDialog:n,...a}=e,r=g(ie,n);return o.jsx(x.p,{id:r.descriptionId,...a,ref:t})});le.displayName=ie;var ce="DialogClose",de=i.forwardRef((e,t)=>{const{__scopeDialog:n,...a}=e,r=g(ce,n);return o.jsx(x.button,{type:"button",...a,ref:t,onClick:h(e.onClick,()=>r.onOpenChange(!1))})});de.displayName=ce;function M(e){return e?"open":"closed"}var ue="DialogTitleWarning",[Do,ge]=Ce(ue,{contentName:f,titleName:F,docsSlug:"dialog"}),Ve=({titleId:e})=>{const t=ge(ue),n=`\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;return i.useEffect(()=>{e&&(document.getElementById(e)||console.error(n))},[n,e]),null},Ge="DialogDescriptionWarning",ze=({contentRef:e,descriptionId:t})=>{const a=`Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${ge(Ge).contentName}}.`;return i.useEffect(()=>{var s;const r=(s=e.current)==null?void 0:s.getAttribute("aria-describedby");t&&r&&(document.getElementById(t)||console.warn(a))},[a,e,t]),null},Ue=Y,Je=ee,Ze=te,pe=ne,fe=re,me=se,De=le,he=de;const P=Ue,B=Je,qe=Ze,k=he,W=i.forwardRef(({className:e,...t},n)=>o.jsx(pe,{ref:n,className:m("fixed inset-0 z-50 bg-black/50 backdrop-blur-sm","data-[state=open]:animate-in data-[state=closed]:animate-out","data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",e),...t}));W.displayName=pe.displayName;const v=i.forwardRef(({className:e,children:t,...n},a)=>o.jsxs(qe,{children:[o.jsx(W,{}),o.jsxs(fe,{ref:a,className:m("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-6 rounded","bg-background border-2 border-border shadow-lg","data-[state=open]:animate-in data-[state=closed]:animate-out","data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0","data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",e),...n,children:[t,o.jsxs(he,{className:"absolute right-4 top-4 p-1 rounded border-2 border-border bg-background hover:bg-muted transition-colors",children:[o.jsx(Pe,{className:"h-4 w-4"}),o.jsx("span",{className:"sr-only",children:"Close"})]})]})]}));v.displayName=fe.displayName;const C=({className:e,...t})=>o.jsx("div",{className:m("flex flex-col space-y-1.5 text-left",e),...t});C.displayName="DialogHeader";const j=({className:e,...t})=>o.jsx("div",{className:m("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",e),...t});j.displayName="DialogFooter";const y=i.forwardRef(({className:e,...t},n)=>o.jsx(me,{ref:n,className:m("text-lg font-head font-bold leading-none tracking-tight",e),...t}));y.displayName=me.displayName;const N=i.forwardRef(({className:e,...t},n)=>o.jsx(De,{ref:n,className:m("text-sm text-muted-foreground",e),...t}));N.displayName=De.displayName;W.__docgenInfo={description:"",methods:[]};v.__docgenInfo={description:"",methods:[]};C.__docgenInfo={description:"",methods:[],displayName:"DialogHeader"};j.__docgenInfo={description:"",methods:[],displayName:"DialogFooter"};y.__docgenInfo={description:"",methods:[]};N.__docgenInfo={description:"",methods:[]};const ho={title:"Components/Dialog",component:P,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"NeoBrutalist 스타일 다이얼로그/모달."}}}},R={render:()=>o.jsxs(P,{children:[o.jsx(B,{asChild:!0,children:o.jsx(p,{children:"Open Dialog"})}),o.jsxs(v,{children:[o.jsxs(C,{children:[o.jsx(y,{children:"Edit Profile"}),o.jsx(N,{children:"Make changes to your profile here. Click save when you're done."})]}),o.jsxs("div",{className:"grid gap-4 py-4",children:[o.jsxs("div",{className:"grid gap-2",children:[o.jsx($,{htmlFor:"name",children:"Name"}),o.jsx(L,{id:"name",defaultValue:"John Doe"})]}),o.jsxs("div",{className:"grid gap-2",children:[o.jsx($,{htmlFor:"username",children:"Username"}),o.jsx(L,{id:"username",defaultValue:"@johndoe"})]})]}),o.jsxs(j,{children:[o.jsx(k,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Cancel"})}),o.jsx(p,{children:"Save changes"})]})]})]})},b={render:()=>o.jsxs(P,{children:[o.jsx(B,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Show Message"})}),o.jsxs(v,{className:"sm:max-w-[425px]",children:[o.jsxs(C,{children:[o.jsx(y,{children:"Welcome!"}),o.jsx(N,{children:"This is a simple dialog with just a message."})]}),o.jsx(j,{children:o.jsx(k,{asChild:!0,children:o.jsx(p,{children:"Got it"})})})]})]})},E={render:()=>o.jsxs(P,{children:[o.jsx(B,{asChild:!0,children:o.jsx(p,{variant:"destructive",children:"Delete Account"})}),o.jsxs(v,{children:[o.jsxs(C,{children:[o.jsx(y,{children:"Are you sure?"}),o.jsx(N,{children:"This action cannot be undone. This will permanently delete your account and remove your data from our servers."})]}),o.jsxs(j,{children:[o.jsx(k,{asChild:!0,children:o.jsx(p,{variant:"outline",children:"Cancel"})}),o.jsx(p,{variant:"destructive",children:"Delete"})]})]})]})};var H,V,G;R.parameters={...R.parameters,docs:{...(H=R.parameters)==null?void 0:H.docs,source:{originalSource:`{
  render: () => <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue="John Doe" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" defaultValue="@johndoe" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
}`,...(G=(V=R.parameters)==null?void 0:V.docs)==null?void 0:G.source}}};var z,U,J;b.parameters={...b.parameters,docs:{...(z=b.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Show Message</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome!</DialogTitle>
          <DialogDescription>
            This is a simple dialog with just a message.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Got it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
}`,...(J=(U=b.parameters)==null?void 0:U.docs)==null?void 0:J.source}}};var Z,q,K;E.parameters={...E.parameters,docs:{...(Z=E.parameters)==null?void 0:Z.docs,source:{originalSource:`{
  render: () => <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete Account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your account and remove your data from our servers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
}`,...(K=(q=E.parameters)==null?void 0:q.docs)==null?void 0:K.source}}};const xo=["Default","Simple","Confirmation"];export{E as Confirmation,R as Default,b as Simple,xo as __namedExportsOrder,ho as default};
