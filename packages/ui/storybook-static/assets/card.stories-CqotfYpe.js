import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as d}from"./index-DwQS_Y10.js";import{c as l}from"./utils-CDN07tui.js";import{c as z}from"./index-C2vczdB5.js";import{B as f}from"./button-gDusbB4c.js";import{B as G}from"./badge-BsHBd_Vu.js";import"./index-D63EQwXG.js";import"./index-DKCiyFsV.js";const L=z("rounded bg-card text-card-foreground transition-all duration-200",{variants:{variant:{default:"border-2 border-border shadow-md",elevated:"border-2 border-border shadow-lg",outline:"border-2 border-border",ghost:"border-transparent shadow-none"},interactive:{true:"cursor-pointer hover:shadow-none hover:translate-x-1 hover:translate-y-1",false:""}},defaultVariants:{variant:"default",interactive:!1}}),a=d.forwardRef(({className:r,variant:t,interactive:n,...V},A)=>e.jsx("div",{ref:A,className:l(L({variant:t,interactive:n}),r),...V}));a.displayName="Card";const C=d.forwardRef(({className:r,...t},n)=>e.jsx("div",{ref:n,className:l("flex flex-col justify-start p-4",r),...t}));C.displayName="CardHeader";const s=d.forwardRef(({className:r,...t},n)=>e.jsx("h3",{ref:n,className:l("text-xl font-head font-bold leading-none tracking-tight mb-2",r),...t}));s.displayName="CardTitle";const N=d.forwardRef(({className:r,...t},n)=>e.jsx("p",{ref:n,className:l("text-sm text-muted-foreground",r),...t}));N.displayName="CardDescription";const h=d.forwardRef(({className:r,...t},n)=>e.jsx("div",{ref:n,className:l("p-4",r),...t}));h.displayName="CardContent";const u=d.forwardRef(({className:r,...t},n)=>e.jsx("div",{ref:n,className:l("flex items-center p-4",r),...t}));u.displayName="CardFooter";a.__docgenInfo={description:"Card - RetroUI NeoBrutalist 스타일 카드",methods:[],displayName:"Card",composes:["VariantProps"]};C.__docgenInfo={description:"",methods:[],displayName:"CardHeader"};u.__docgenInfo={description:"",methods:[],displayName:"CardFooter"};s.__docgenInfo={description:"",methods:[],displayName:"CardTitle"};N.__docgenInfo={description:"",methods:[],displayName:"CardDescription"};h.__docgenInfo={description:"",methods:[],displayName:"CardContent"};const Q={title:"Components/Card",component:a,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"RetroUI NeoBrutalist 스타일 카드. 두꺼운 테두리와 그림자."}}}},i={render:()=>e.jsxs(a,{className:"w-[350px]",children:[e.jsxs(C,{children:[e.jsx(s,{children:"Card Title"}),e.jsx(N,{children:"Card description goes here."})]}),e.jsx(h,{children:e.jsx("p",{children:"This is the card content area. You can put any content here."})}),e.jsx(u,{children:e.jsx(f,{children:"Action"})})]})},c={render:()=>e.jsx(a,{className:"w-[350px] p-4",children:e.jsx("p",{children:"A simple card with just content."})})},o={render:()=>e.jsxs(a,{className:"w-[350px]",children:[e.jsxs(C,{children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx(s,{children:"Device Status"}),e.jsx(G,{variant:"success",children:"Online"})]}),e.jsx(N,{children:"Samsung Galaxy S24"})]}),e.jsx(h,{children:e.jsxs("div",{className:"space-y-2",children:[e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{children:"Battery"}),e.jsx("span",{className:"font-bold",children:"85%"})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{children:"Status"}),e.jsx("span",{className:"font-bold",children:"Idle"})]})]})}),e.jsxs(u,{className:"gap-2",children:[e.jsx(f,{size:"sm",children:"Connect"}),e.jsx(f,{size:"sm",variant:"outline",children:"View Logs"})]})]})},m={render:()=>e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs(a,{className:"p-4",children:[e.jsx(s,{className:"mb-2",children:"Total Devices"}),e.jsx("p",{className:"text-3xl font-bold",children:"12"})]}),e.jsxs(a,{className:"p-4",children:[e.jsx(s,{className:"mb-2",children:"Active"}),e.jsx("p",{className:"text-3xl font-bold text-green-600",children:"8"})]}),e.jsxs(a,{className:"p-4",children:[e.jsx(s,{className:"mb-2",children:"Offline"}),e.jsx("p",{className:"text-3xl font-bold text-muted-foreground",children:"3"})]}),e.jsxs(a,{className:"p-4",children:[e.jsx(s,{className:"mb-2",children:"Errors"}),e.jsx("p",{className:"text-3xl font-bold text-red-600",children:"1"})]})]})},p={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs(a,{variant:"default",className:"p-4 w-[300px]",children:[e.jsx(s,{className:"mb-2",children:"Default"}),e.jsx("p",{children:"기본 스타일 카드"})]}),e.jsxs(a,{variant:"elevated",className:"p-4 w-[300px]",children:[e.jsx(s,{className:"mb-2",children:"Elevated"}),e.jsx("p",{children:"더 큰 그림자 카드"})]}),e.jsxs(a,{variant:"outline",className:"p-4 w-[300px]",children:[e.jsx(s,{className:"mb-2",children:"Outline"}),e.jsx("p",{children:"테두리만 있는 카드"})]}),e.jsxs(a,{variant:"ghost",className:"p-4 w-[300px]",children:[e.jsx(s,{className:"mb-2",children:"Ghost"}),e.jsx("p",{children:"테두리와 그림자 없는 카드"})]})]})},x={render:()=>e.jsxs("div",{className:"flex gap-4",children:[e.jsxs(a,{variant:"default",interactive:!0,className:"p-4 w-[200px]",onClick:()=>alert("Card clicked!"),children:[e.jsx(s,{className:"mb-2",children:"Clickable"}),e.jsx("p",{children:"클릭해보세요"})]}),e.jsxs(a,{variant:"elevated",interactive:!0,className:"p-4 w-[200px]",onClick:()=>alert("Card clicked!"),children:[e.jsx(s,{className:"mb-2",children:"Elevated"}),e.jsx("p",{children:"클릭 가능"})]})]})};var j,v,b;i.parameters={...i.parameters,docs:{...(j=i.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: () => <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>This is the card content area. You can put any content here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
}`,...(b=(v=i.parameters)==null?void 0:v.docs)==null?void 0:b.source}}};var g,w,T;c.parameters={...c.parameters,docs:{...(g=c.parameters)==null?void 0:g.docs,source:{originalSource:`{
  render: () => <Card className="w-[350px] p-4">
      <p>A simple card with just content.</p>
    </Card>
}`,...(T=(w=c.parameters)==null?void 0:w.docs)==null?void 0:T.source}}};var y,B,S;o.parameters={...o.parameters,docs:{...(y=o.parameters)==null?void 0:y.docs,source:{originalSource:`{
  render: () => <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Device Status</CardTitle>
          <Badge variant="success">Online</Badge>
        </div>
        <CardDescription>Samsung Galaxy S24</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Battery</span>
            <span className="font-bold">85%</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span className="font-bold">Idle</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Connect</Button>
        <Button size="sm" variant="outline">View Logs</Button>
      </CardFooter>
    </Card>
}`,...(S=(B=o.parameters)==null?void 0:B.docs)==null?void 0:S.source}}};var D,_,I;m.parameters={...m.parameters,docs:{...(D=m.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: () => <div className="grid grid-cols-2 gap-4">
      <Card className="p-4">
        <CardTitle className="mb-2">Total Devices</CardTitle>
        <p className="text-3xl font-bold">12</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Active</CardTitle>
        <p className="text-3xl font-bold text-green-600">8</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Offline</CardTitle>
        <p className="text-3xl font-bold text-muted-foreground">3</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Errors</CardTitle>
        <p className="text-3xl font-bold text-red-600">1</p>
      </Card>
    </div>
}`,...(I=(_=m.parameters)==null?void 0:_.docs)==null?void 0:I.source}}};var k,E,R;p.parameters={...p.parameters,docs:{...(k=p.parameters)==null?void 0:k.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <Card variant="default" className="p-4 w-[300px]">
        <CardTitle className="mb-2">Default</CardTitle>
        <p>기본 스타일 카드</p>
      </Card>
      <Card variant="elevated" className="p-4 w-[300px]">
        <CardTitle className="mb-2">Elevated</CardTitle>
        <p>더 큰 그림자 카드</p>
      </Card>
      <Card variant="outline" className="p-4 w-[300px]">
        <CardTitle className="mb-2">Outline</CardTitle>
        <p>테두리만 있는 카드</p>
      </Card>
      <Card variant="ghost" className="p-4 w-[300px]">
        <CardTitle className="mb-2">Ghost</CardTitle>
        <p>테두리와 그림자 없는 카드</p>
      </Card>
    </div>
}`,...(R=(E=p.parameters)==null?void 0:E.docs)==null?void 0:R.source}}};var F,H,O;x.parameters={...x.parameters,docs:{...(F=x.parameters)==null?void 0:F.docs,source:{originalSource:`{
  render: () => <div className="flex gap-4">
      <Card variant="default" interactive className="p-4 w-[200px]" onClick={() => alert('Card clicked!')}>
        <CardTitle className="mb-2">Clickable</CardTitle>
        <p>클릭해보세요</p>
      </Card>
      <Card variant="elevated" interactive className="p-4 w-[200px]" onClick={() => alert('Card clicked!')}>
        <CardTitle className="mb-2">Elevated</CardTitle>
        <p>클릭 가능</p>
      </Card>
    </div>
}`,...(O=(H=x.parameters)==null?void 0:H.docs)==null?void 0:O.source}}};const X=["Default","SimpleCard","WithBadge","MultipleCards","CardVariants","InteractiveCard"];export{p as CardVariants,i as Default,x as InteractiveCard,m as MultipleCards,c as SimpleCard,o as WithBadge,X as __namedExportsOrder,Q as default};
