import{i as O,C as J,A as j,O as q,a as M,b as k,c as At,d as u,E as H,R as B,e as U,f as Ut,g as Fn,h as ue,H as Vn,j as oe,r as Y,k as ye,T as je,S as Be,M as En,l as Rn,m as Sn,n as Hn,o as Tn,w as Ue,p as Kn,q as Gn,s as zt,t as _n,W as It}from"./core-DNrt4EUK.js";import{n as f,r as P,c as N,o as D,U as se,i as Qn,t as Jn,e as Yn,a as Xn}from"./index-mYP-c3GO.js";import{f as Zn}from"./index-GAgutWzb.js";import{r as ei}from"./dijkstra-COg3n3zL.js";import"./index-CN7-A-E-.js";var Te=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let fe=class extends O{constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=J.state.connectors,this.count=j.state.count,this.filteredCount=j.state.filteredWallets.length,this.isFetchingRecommendedWallets=j.state.isFetchingRecommendedWallets,this.unsubscribe.push(J.subscribeKey("connectors",e=>this.connectors=e),j.subscribeKey("count",e=>this.count=e),j.subscribeKey("filteredWallets",e=>this.filteredCount=e.length),j.subscribeKey("isFetchingRecommendedWallets",e=>this.isFetchingRecommendedWallets=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.connectors.find(c=>c.id==="walletConnect"),{allWallets:i}=q.state;if(!e||i==="HIDE"||i==="ONLY_MOBILE"&&!M.isMobile())return null;const r=j.state.featured.length,o=this.count+r,n=o<10?o:Math.floor(o/10)*10,s=this.filteredCount>0?this.filteredCount:n;let a=`${s}`;this.filteredCount>0?a=`${this.filteredCount}`:s<o&&(a=`${s}+`);const l=k.hasAnyConnection(At.CONNECTOR_ID.WALLET_CONNECT);return u`
      <wui-list-wallet
        name="Search Wallet"
        walletIcon="search"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${a}
        tagVariant="info"
        data-testid="all-wallets"
        tabIdx=${D(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        ?disabled=${l}
        size="sm"
      ></wui-list-wallet>
    `}onAllWallets(){var e;H.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),B.push("AllWallets",{redirectView:(e=B.state.data)==null?void 0:e.redirectView})}};Te([f()],fe.prototype,"tabIdx",void 0);Te([P()],fe.prototype,"connectors",void 0);Te([P()],fe.prototype,"count",void 0);Te([P()],fe.prototype,"filteredCount",void 0);Te([P()],fe.prototype,"isFetchingRecommendedWallets",void 0);fe=Te([N("w3m-all-wallets-widget")],fe);const ti=U`
  :host {
    margin-top: ${({spacing:t})=>t[1]};
  }
  wui-separator {
    margin: ${({spacing:t})=>t[3]} calc(${({spacing:t})=>t[3]} * -1)
      ${({spacing:t})=>t[2]} calc(${({spacing:t})=>t[3]} * -1);
    width: calc(100% + ${({spacing:t})=>t[3]} * 2);
  }
`;var _e=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let de=class extends O{constructor(){super(),this.unsubscribe=[],this.explorerWallets=j.state.explorerWallets,this.connections=k.state.connections,this.connectorImages=Ut.state.connectorImages,this.loadingTelegram=!1,this.unsubscribe.push(k.subscribeKey("connections",e=>this.connections=e),Ut.subscribeKey("connectorImages",e=>this.connectorImages=e),j.subscribeKey("explorerFilteredWallets",e=>{this.explorerWallets=e!=null&&e.length?e:j.state.explorerWallets}),j.subscribeKey("explorerWallets",e=>{var i;(i=this.explorerWallets)!=null&&i.length||(this.explorerWallets=e)})),M.isTelegram()&&M.isIos()&&(this.loadingTelegram=!k.state.wcUri,this.unsubscribe.push(k.subscribeKey("wcUri",e=>this.loadingTelegram=!e)))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return u`
      <wui-flex flexDirection="column" gap="2"> ${this.connectorListTemplate()} </wui-flex>
    `}connectorListTemplate(){return Fn.connectorList().map((e,i)=>e.kind==="connector"?this.renderConnector(e,i):this.renderWallet(e,i))}getConnectorNamespaces(e){var i;return e.subtype==="walletConnect"?[]:e.subtype==="multiChain"?((i=e.connector.connectors)==null?void 0:i.map(r=>r.chain))||[]:[e.connector.chain]}renderConnector(e,i){var $,v,p,A,b;const r=e.connector,o=ue.getConnectorImage(r)||this.connectorImages[($=r==null?void 0:r.imageId)!=null?$:""],s=((v=this.connections.get(r.chain))!=null?v:[]).some(_=>Vn.isLowerCaseMatch(_.connectorId,r.id));let a,l;e.subtype==="walletConnect"?(a="qr code",l="accent"):e.subtype==="injected"||e.subtype==="announced"?(a=s?"connected":"installed",l=s?"info":"success"):(a=void 0,l=void 0);const c=k.hasAnyConnection(At.CONNECTOR_ID.WALLET_CONNECT),d=e.subtype==="walletConnect"||e.subtype==="external"?c:!1;return u`
      <w3m-list-wallet
        displayIndex=${i}
        imageSrc=${D(o)}
        .installed=${!0}
        name=${(p=r.name)!=null?p:"Unknown"}
        .tagVariant=${l}
        tagLabel=${D(a)}
        data-testid=${`wallet-selector-${r.id.toLowerCase()}`}
        size="sm"
        @click=${()=>this.onClickConnector(e)}
        tabIdx=${D(this.tabIdx)}
        ?disabled=${d}
        rdnsId=${D(((A=r.explorerWallet)==null?void 0:A.rdns)||void 0)}
        walletRank=${D((b=r.explorerWallet)==null?void 0:b.order)}
        .namespaces=${this.getConnectorNamespaces(e)}
      >
      </w3m-list-wallet>
    `}onClickConnector(e){var r;const i=(r=B.state.data)==null?void 0:r.redirectView;if(e.subtype==="walletConnect"){J.setActiveConnector(e.connector),M.isMobile()?B.push("AllWallets"):B.push("ConnectingWalletConnect",{redirectView:i});return}if(e.subtype==="multiChain"){J.setActiveConnector(e.connector),B.push("ConnectingMultiChain",{redirectView:i});return}if(e.subtype==="injected"){J.setActiveConnector(e.connector),B.push("ConnectingExternal",{connector:e.connector,redirectView:i,wallet:e.connector.explorerWallet});return}if(e.subtype==="announced"){if(e.connector.id==="walletConnect"){M.isMobile()?B.push("AllWallets"):B.push("ConnectingWalletConnect",{redirectView:i});return}B.push("ConnectingExternal",{connector:e.connector,redirectView:i,wallet:e.connector.explorerWallet});return}B.push("ConnectingExternal",{connector:e.connector,redirectView:i})}renderWallet(e,i){var d;const r=e.wallet,o=ue.getWalletImage(r),s=k.hasAnyConnection(At.CONNECTOR_ID.WALLET_CONNECT),a=this.loadingTelegram,l=e.subtype==="recent"?"recent":void 0,c=e.subtype==="recent"?"info":void 0;return u`
      <w3m-list-wallet
        displayIndex=${i}
        imageSrc=${D(o)}
        name=${(d=r.name)!=null?d:"Unknown"}
        @click=${()=>this.onClickWallet(e)}
        size="sm"
        data-testid=${`wallet-selector-${r.id}`}
        tabIdx=${D(this.tabIdx)}
        ?loading=${a}
        ?disabled=${s}
        rdnsId=${D(r.rdns||void 0)}
        walletRank=${D(r.order)}
        tagLabel=${D(l)}
        .tagVariant=${c}
      >
      </w3m-list-wallet>
    `}onClickWallet(e){var n;const i=(n=B.state.data)==null?void 0:n.redirectView,r=oe.state.activeChain;if(e.subtype==="featured"){J.selectWalletConnector(e.wallet);return}if(e.subtype==="recent"){if(this.loadingTelegram)return;J.selectWalletConnector(e.wallet);return}if(e.subtype==="custom"){if(this.loadingTelegram)return;B.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:i});return}if(this.loadingTelegram)return;const o=r?J.getConnector({id:e.wallet.id,namespace:r}):void 0;o?B.push("ConnectingExternal",{connector:o,redirectView:i}):B.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:i})}};de.styles=ti;_e([f({type:Number})],de.prototype,"tabIdx",void 0);_e([P()],de.prototype,"explorerWallets",void 0);_e([P()],de.prototype,"connections",void 0);_e([P()],de.prototype,"connectorImages",void 0);_e([P()],de.prototype,"loadingTelegram",void 0);de=_e([N("w3m-connector-list")],de);const ni=U`
  :host {
    flex: 1;
    height: 100%;
  }

  button {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: ${({spacing:t})=>t[1]} ${({spacing:t})=>t[2]};
    column-gap: ${({spacing:t})=>t[1]};
    color: ${({tokens:t})=>t.theme.textSecondary};
    border-radius: ${({borderRadius:t})=>t[20]};
    background-color: transparent;
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  button[data-active='true'] {
    color: ${({tokens:t})=>t.theme.textPrimary};
    background-color: ${({tokens:t})=>t.theme.foregroundTertiary};
  }

  button:hover:enabled:not([data-active='true']),
  button:active:enabled:not([data-active='true']) {
    wui-text,
    wui-icon {
      color: ${({tokens:t})=>t.theme.textPrimary};
    }
  }
`;var ke=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};const ii={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},ri={lg:"md",md:"sm",sm:"sm"};let pe=class extends O{constructor(){super(...arguments),this.icon="mobile",this.size="md",this.label="",this.active=!1}render(){return u`
      <button data-active=${this.active}>
        ${this.icon?u`<wui-icon size=${ri[this.size]} name=${this.icon}></wui-icon>`:""}
        <wui-text variant=${ii[this.size]}> ${this.label} </wui-text>
      </button>
    `}};pe.styles=[Y,ye,ni];ke([f()],pe.prototype,"icon",void 0);ke([f()],pe.prototype,"size",void 0);ke([f()],pe.prototype,"label",void 0);ke([f({type:Boolean})],pe.prototype,"active",void 0);pe=ke([N("wui-tab-item")],pe);const oi=U`
  :host {
    display: inline-flex;
    align-items: center;
    background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    border-radius: ${({borderRadius:t})=>t[32]};
    padding: ${({spacing:t})=>t["01"]};
    box-sizing: border-box;
  }

  :host([data-size='sm']) {
    height: 26px;
  }

  :host([data-size='md']) {
    height: 36px;
  }
`;var Le=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let ge=class extends O{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.size="md",this.activeTab=0}render(){return this.dataset.size=this.size,this.tabs.map((e,i)=>{var o;const r=i===this.activeTab;return u`
        <wui-tab-item
          @click=${()=>this.onTabClick(i)}
          icon=${e.icon}
          size=${this.size}
          label=${e.label}
          ?active=${r}
          data-active=${r}
          data-testid="tab-${(o=e.label)==null?void 0:o.toLowerCase()}"
        ></wui-tab-item>
      `})}onTabClick(e){this.activeTab=e,this.onTabChange(e)}};ge.styles=[Y,ye,oi];Le([f({type:Array})],ge.prototype,"tabs",void 0);Le([f()],ge.prototype,"onTabChange",void 0);Le([f()],ge.prototype,"size",void 0);Le([P()],ge.prototype,"activeTab",void 0);ge=Le([N("wui-tabs")],ge);var Wt=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let ze=class extends O{constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.generateTabs();return u`
      <wui-flex justifyContent="center" .padding=${["0","0","4","0"]}>
        <wui-tabs .tabs=${e} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){const e=this.platforms.map(i=>i==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:i==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:i==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:i==="web"?{label:"Webapp",icon:"browser",platform:"web"}:i==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=e.map(({platform:i})=>i),e}onTabChange(e){var r;const i=this.platformTabs[e];i&&((r=this.onSelectPlatfrom)==null||r.call(this,i))}};Wt([f({type:Array})],ze.prototype,"platforms",void 0);Wt([f()],ze.prototype,"onSelectPlatfrom",void 0);ze=Wt([N("w3m-connecting-header")],ze);const si=U`
  :host {
    display: block;
    width: 100px;
    height: 100px;
  }

  svg {
    width: 100px;
    height: 100px;
  }

  rect {
    fill: none;
    stroke: ${t=>t.colors.accent100};
    stroke-width: 3px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var An=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let qe=class extends O{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){const e=this.radius>50?50:this.radius,r=36-e,o=116+r,n=245+r,s=360+r*1.75;return u`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${e}
          stroke-dasharray="${o} ${n}"
          stroke-dashoffset=${s}
        />
      </svg>
    `}};qe.styles=[Y,si];An([f({type:Number})],qe.prototype,"radius",void 0);qe=An([N("wui-loading-thumbnail")],qe);const ai=U`
  wui-flex {
    width: 100%;
    height: 52px;
    box-sizing: border-box;
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    padding-left: ${({spacing:t})=>t[3]};
    padding-right: ${({spacing:t})=>t[3]};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({spacing:t})=>t[6]};
  }

  wui-text {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  wui-icon {
    width: 12px;
    height: 12px;
  }
`;var Xe=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Re=class extends O{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return u`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="inherit">${this.label}</wui-text>
        <wui-button variant="accent-secondary" size="sm">
          ${this.buttonLabel}
          <wui-icon name="chevronRight" color="inherit" size="inherit" slot="iconRight"></wui-icon>
        </wui-button>
      </wui-flex>
    `}};Re.styles=[Y,ye,ai];Xe([f({type:Boolean})],Re.prototype,"disabled",void 0);Xe([f()],Re.prototype,"label",void 0);Xe([f()],Re.prototype,"buttonLabel",void 0);Re=Xe([N("wui-cta-button")],Re);const li=U`
  :host {
    display: block;
    padding: 0 ${({spacing:t})=>t[5]} ${({spacing:t})=>t[5]};
  }
`;var In=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Fe=class extends O{constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;const{name:e,app_store:i,play_store:r,chrome_store:o,homepage:n}=this.wallet,s=M.isMobile(),a=M.isIos(),l=M.isAndroid(),c=[i,r,n,o].filter(Boolean).length>1,d=se.getTruncateString({string:e,charsStart:12,charsEnd:0,truncate:"end"});return c&&!s?u`
        <wui-cta-button
          label=${`Don't have ${d}?`}
          buttonLabel="Get"
          @click=${()=>B.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!c&&n?u`
        <wui-cta-button
          label=${`Don't have ${d}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:i&&a?u`
        <wui-cta-button
          label=${`Don't have ${d}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:r&&l?u`
        <wui-cta-button
          label=${`Don't have ${d}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){var e;(e=this.wallet)!=null&&e.app_store&&M.openHref(this.wallet.app_store,"_blank")}onPlayStore(){var e;(e=this.wallet)!=null&&e.play_store&&M.openHref(this.wallet.play_store,"_blank")}onHomePage(){var e;(e=this.wallet)!=null&&e.homepage&&M.openHref(this.wallet.homepage,"_blank")}};Fe.styles=[li];In([f({type:Object})],Fe.prototype,"wallet",void 0);Fe=In([N("w3m-mobile-download-links")],Fe);const ci=U`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-wallet-image {
    width: 56px;
    height: 56px;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(${({spacing:t})=>t[1]} * -1);
    bottom: calc(${({spacing:t})=>t[1]} * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: ${({durations:t})=>t.lg};
    transition-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px ${({spacing:t})=>t[4]};
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms ${({easings:t})=>t["ease-out-power-2"]} both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }

  w3m-mobile-download-links {
    padding: 0px;
    width: 100%;
  }
`;var X=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};class z extends O{constructor(){var e,i,r,o,n,s,a,l;super(),this.wallet=(e=B.state.data)==null?void 0:e.wallet,this.connector=(i=B.state.data)==null?void 0:i.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=(r=ue.getConnectorImage(this.connector))!=null?r:ue.getWalletImage(this.wallet),this.name=(a=(s=(o=this.wallet)==null?void 0:o.name)!=null?s:(n=this.connector)==null?void 0:n.name)!=null?a:"Wallet",this.isRetrying=!1,this.uri=k.state.wcUri,this.error=k.state.wcError,this.ready=!1,this.showRetry=!1,this.label=void 0,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push(k.subscribeKey("wcUri",c=>{var d;this.uri=c,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,(d=this.onConnect)==null||d.call(this))}),k.subscribeKey("wcError",c=>this.error=c)),(M.isTelegram()||M.isSafari())&&M.isIos()&&k.state.wcUri&&((l=this.onConnect)==null||l.call(this))}firstUpdated(){var e;(e=this.onAutoConnect)==null||e.call(this),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),k.setWcError(!1),clearTimeout(this.timeout)}render(){var r;(r=this.onRender)==null||r.call(this),this.onShowRetry();const e=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel;let i="";return this.label?i=this.label:(i=`Continue in ${this.name}`,this.error&&(i="Connection declined")),u`
      <wui-flex
        data-error=${D(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="6"
      >
        <wui-flex gap="2" justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${D(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            color="error"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="6"> <wui-flex
          flexDirection="column"
          alignItems="center"
          gap="2"
          .padding=${["2","0","0","0"]}
        >
          <wui-text align="center" variant="lg-medium" color=${this.error?"error":"primary"}>
            ${i}
          </wui-text>
          <wui-text align="center" variant="lg-regular" color="secondary">${e}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?u`
                <wui-button
                  variant="neutral-secondary"
                  size="md"
                  ?disabled=${this.isRetrying||this.isLoading}
                  @click=${this.onTryAgain.bind(this)}
                  data-testid="w3m-connecting-widget-secondary-button"
                >
                  <wui-icon
                    color="inherit"
                    slot="iconLeft"
                    name=${this.secondaryBtnIcon}
                  ></wui-icon>
                  ${this.secondaryBtnLabel}
                </wui-button>
              `:null}
      </wui-flex>

      ${this.isWalletConnect?u`
              <wui-flex .padding=${["0","5","5","5"]} justifyContent="center">
                <wui-link
                  @click=${this.onCopyUri}
                  variant="secondary"
                  icon="copy"
                  data-testid="wui-link-copy"
                >
                  Copy link
                </wui-link>
              </wui-flex>
            `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links></wui-flex>
      </wui-flex>
    `}onShowRetry(){var e;if(this.error&&!this.showRetry){this.showRetry=!0;const i=(e=this.shadowRoot)==null?void 0:e.querySelector("wui-button");i==null||i.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"})}}onTryAgain(){var e,i;k.setWcError(!1),this.onRetry?(this.isRetrying=!0,(e=this.onRetry)==null||e.call(this)):(i=this.onConnect)==null||i.call(this)}loaderTemplate(){const e=je.state.themeVariables["--w3m-border-radius-master"],i=e?parseInt(e.replace("px",""),10):4;return u`<wui-loading-thumbnail radius=${i*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(M.copyToClopboard(this.uri),Be.showSuccess("Link copied"))}catch{Be.showError("Failed to copy")}}}z.styles=ci;X([P()],z.prototype,"isRetrying",void 0);X([P()],z.prototype,"uri",void 0);X([P()],z.prototype,"error",void 0);X([P()],z.prototype,"ready",void 0);X([P()],z.prototype,"showRetry",void 0);X([P()],z.prototype,"label",void 0);X([P()],z.prototype,"secondaryBtnLabel",void 0);X([P()],z.prototype,"secondaryLabel",void 0);X([P()],z.prototype,"isLoading",void 0);X([f({type:Boolean})],z.prototype,"isMobile",void 0);X([f()],z.prototype,"onRetry",void 0);var ui=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let qt=class extends z{constructor(){var e;if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:(e=this.wallet)==null?void 0:e.display_index,walletRank:this.wallet.order,view:B.state.view}})}async onConnectProxy(){var e;try{this.error=!1;const{connectors:i}=J.state,r=i.find(o=>{var n,s,a;return o.type==="ANNOUNCED"&&((n=o.info)==null?void 0:n.rdns)===((s=this.wallet)==null?void 0:s.rdns)||o.type==="INJECTED"||o.name===((a=this.wallet)==null?void 0:a.name)});if(r)await k.connectExternal(r,r.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");En.close()}catch(i){i instanceof Rn&&i.originalName===Sn.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?H.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:i.message}}):H.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:(e=i==null?void 0:i.message)!=null?e:"Unknown"}}),this.error=!0}}};qt=ui([N("w3m-connecting-wc-browser")],qt);var di=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Ft=class extends z{constructor(){var e;if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop",displayIndex:(e=this.wallet)==null?void 0:e.display_index,walletRank:this.wallet.order,view:B.state.view}})}onRenderProxy(){var e;!this.ready&&this.uri&&(this.ready=!0,(e=this.onConnect)==null||e.call(this))}onConnectProxy(){var e;if((e=this.wallet)!=null&&e.desktop_link&&this.uri)try{this.error=!1;const{desktop_link:i,name:r}=this.wallet,{redirect:o,href:n}=M.formatNativeUrl(i,this.uri);k.setWcLinking({name:r,href:n}),k.setRecentWallet(this.wallet),M.openHref(o,"_blank")}catch{this.error=!0}}};Ft=di([N("w3m-connecting-wc-desktop")],Ft);var Ae=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let we=class extends z{constructor(){var e;if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=q.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{Hn.onConnectMobile(this.wallet)},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=Tn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push(k.subscribeKey("wcUri",()=>{this.onHandleURI()})),H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile",displayIndex:(e=this.wallet)==null?void 0:e.display_index,walletRank:this.wallet.order,view:B.state.view}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){var e;this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,(e=this.onConnect)==null||e.call(this))}onTryAgain(){var e;k.setWcError(!1),(e=this.onConnect)==null||e.call(this)}};Ae([P()],we.prototype,"redirectDeeplink",void 0);Ae([P()],we.prototype,"redirectUniversalLink",void 0);Ae([P()],we.prototype,"target",void 0);Ae([P()],we.prototype,"preferUniversalLinks",void 0);Ae([P()],we.prototype,"isLoading",void 0);we=Ae([N("w3m-connecting-wc-mobile")],we);var Ee={},rt,Vt;function hi(){return Vt||(Vt=1,rt=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}),rt}var ot={},ce={},Ht;function ve(){if(Ht)return ce;Ht=1;let t;const e=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];return ce.getSymbolSize=function(r){if(!r)throw new Error('"version" cannot be null or undefined');if(r<1||r>40)throw new Error('"version" should be in range from 1 to 40');return r*4+17},ce.getSymbolTotalCodewords=function(r){return e[r]},ce.getBCHDigit=function(i){let r=0;for(;i!==0;)r++,i>>>=1;return r},ce.setToSJISFunction=function(r){if(typeof r!="function")throw new Error('"toSJISFunc" is not a valid function.');t=r},ce.isKanjiModeEnabled=function(){return typeof t<"u"},ce.toSJIS=function(r){return t(r)},ce}var st={},Kt;function Bt(){return Kt||(Kt=1,(function(t){t.L={bit:1},t.M={bit:0},t.Q={bit:3},t.H={bit:2};function e(i){if(typeof i!="string")throw new Error("Param is not a string");switch(i.toLowerCase()){case"l":case"low":return t.L;case"m":case"medium":return t.M;case"q":case"quartile":return t.Q;case"h":case"high":return t.H;default:throw new Error("Unknown EC Level: "+i)}}t.isValid=function(r){return r&&typeof r.bit<"u"&&r.bit>=0&&r.bit<4},t.from=function(r,o){if(t.isValid(r))return r;try{return e(r)}catch{return o}}})(st)),st}var at,Gt;function fi(){if(Gt)return at;Gt=1;function t(){this.buffer=[],this.length=0}return t.prototype={get:function(e){const i=Math.floor(e/8);return(this.buffer[i]>>>7-e%8&1)===1},put:function(e,i){for(let r=0;r<i;r++)this.putBit((e>>>i-r-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(e){const i=Math.floor(this.length/8);this.buffer.length<=i&&this.buffer.push(0),e&&(this.buffer[i]|=128>>>this.length%8),this.length++}},at=t,at}var lt,Qt;function pi(){if(Qt)return lt;Qt=1;function t(e){if(!e||e<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=e,this.data=new Uint8Array(e*e),this.reservedBit=new Uint8Array(e*e)}return t.prototype.set=function(e,i,r,o){const n=e*this.size+i;this.data[n]=r,o&&(this.reservedBit[n]=!0)},t.prototype.get=function(e,i){return this.data[e*this.size+i]},t.prototype.xor=function(e,i,r){this.data[e*this.size+i]^=r},t.prototype.isReserved=function(e,i){return this.reservedBit[e*this.size+i]},lt=t,lt}var ct={},Jt;function gi(){return Jt||(Jt=1,(function(t){const e=ve().getSymbolSize;t.getRowColCoords=function(r){if(r===1)return[];const o=Math.floor(r/7)+2,n=e(r),s=n===145?26:Math.ceil((n-13)/(2*o-2))*2,a=[n-7];for(let l=1;l<o-1;l++)a[l]=a[l-1]-s;return a.push(6),a.reverse()},t.getPositions=function(r){const o=[],n=t.getRowColCoords(r),s=n.length;for(let a=0;a<s;a++)for(let l=0;l<s;l++)a===0&&l===0||a===0&&l===s-1||a===s-1&&l===0||o.push([n[a],n[l]]);return o}})(ct)),ct}var ut={},Yt;function wi(){if(Yt)return ut;Yt=1;const t=ve().getSymbolSize,e=7;return ut.getPositions=function(r){const o=t(r);return[[0,0],[o-e,0],[0,o-e]]},ut}var dt={},Xt;function mi(){return Xt||(Xt=1,(function(t){t.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};const e={N1:3,N2:3,N3:40,N4:10};t.isValid=function(o){return o!=null&&o!==""&&!isNaN(o)&&o>=0&&o<=7},t.from=function(o){return t.isValid(o)?parseInt(o,10):void 0},t.getPenaltyN1=function(o){const n=o.size;let s=0,a=0,l=0,c=null,d=null;for(let $=0;$<n;$++){a=l=0,c=d=null;for(let v=0;v<n;v++){let p=o.get($,v);p===c?a++:(a>=5&&(s+=e.N1+(a-5)),c=p,a=1),p=o.get(v,$),p===d?l++:(l>=5&&(s+=e.N1+(l-5)),d=p,l=1)}a>=5&&(s+=e.N1+(a-5)),l>=5&&(s+=e.N1+(l-5))}return s},t.getPenaltyN2=function(o){const n=o.size;let s=0;for(let a=0;a<n-1;a++)for(let l=0;l<n-1;l++){const c=o.get(a,l)+o.get(a,l+1)+o.get(a+1,l)+o.get(a+1,l+1);(c===4||c===0)&&s++}return s*e.N2},t.getPenaltyN3=function(o){const n=o.size;let s=0,a=0,l=0;for(let c=0;c<n;c++){a=l=0;for(let d=0;d<n;d++)a=a<<1&2047|o.get(c,d),d>=10&&(a===1488||a===93)&&s++,l=l<<1&2047|o.get(d,c),d>=10&&(l===1488||l===93)&&s++}return s*e.N3},t.getPenaltyN4=function(o){let n=0;const s=o.data.length;for(let l=0;l<s;l++)n+=o.data[l];return Math.abs(Math.ceil(n*100/s/5)-10)*e.N4};function i(r,o,n){switch(r){case t.Patterns.PATTERN000:return(o+n)%2===0;case t.Patterns.PATTERN001:return o%2===0;case t.Patterns.PATTERN010:return n%3===0;case t.Patterns.PATTERN011:return(o+n)%3===0;case t.Patterns.PATTERN100:return(Math.floor(o/2)+Math.floor(n/3))%2===0;case t.Patterns.PATTERN101:return o*n%2+o*n%3===0;case t.Patterns.PATTERN110:return(o*n%2+o*n%3)%2===0;case t.Patterns.PATTERN111:return(o*n%3+(o+n)%2)%2===0;default:throw new Error("bad maskPattern:"+r)}}t.applyMask=function(o,n){const s=n.size;for(let a=0;a<s;a++)for(let l=0;l<s;l++)n.isReserved(l,a)||n.xor(l,a,i(o,l,a))},t.getBestMask=function(o,n){const s=Object.keys(t.Patterns).length;let a=0,l=1/0;for(let c=0;c<s;c++){n(c),t.applyMask(c,o);const d=t.getPenaltyN1(o)+t.getPenaltyN2(o)+t.getPenaltyN3(o)+t.getPenaltyN4(o);t.applyMask(c,o),d<l&&(l=d,a=c)}return a}})(dt)),dt}var De={},Zt;function Pn(){if(Zt)return De;Zt=1;const t=Bt(),e=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],i=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];return De.getBlocksCount=function(o,n){switch(n){case t.L:return e[(o-1)*4+0];case t.M:return e[(o-1)*4+1];case t.Q:return e[(o-1)*4+2];case t.H:return e[(o-1)*4+3];default:return}},De.getTotalCodewordsCount=function(o,n){switch(n){case t.L:return i[(o-1)*4+0];case t.M:return i[(o-1)*4+1];case t.Q:return i[(o-1)*4+2];case t.H:return i[(o-1)*4+3];default:return}},De}var ht={},Pe={},en;function bi(){if(en)return Pe;en=1;const t=new Uint8Array(512),e=new Uint8Array(256);return(function(){let r=1;for(let o=0;o<255;o++)t[o]=r,e[r]=o,r<<=1,r&256&&(r^=285);for(let o=255;o<512;o++)t[o]=t[o-255]})(),Pe.log=function(r){if(r<1)throw new Error("log("+r+")");return e[r]},Pe.exp=function(r){return t[r]},Pe.mul=function(r,o){return r===0||o===0?0:t[e[r]+e[o]]},Pe}var tn;function yi(){return tn||(tn=1,(function(t){const e=bi();t.mul=function(r,o){const n=new Uint8Array(r.length+o.length-1);for(let s=0;s<r.length;s++)for(let a=0;a<o.length;a++)n[s+a]^=e.mul(r[s],o[a]);return n},t.mod=function(r,o){let n=new Uint8Array(r);for(;n.length-o.length>=0;){const s=n[0];for(let l=0;l<o.length;l++)n[l]^=e.mul(o[l],s);let a=0;for(;a<n.length&&n[a]===0;)a++;n=n.slice(a)}return n},t.generateECPolynomial=function(r){let o=new Uint8Array([1]);for(let n=0;n<r;n++)o=t.mul(o,new Uint8Array([1,e.exp(n)]));return o}})(ht)),ht}var ft,nn;function vi(){if(nn)return ft;nn=1;const t=yi();function e(i){this.genPoly=void 0,this.degree=i,this.degree&&this.initialize(this.degree)}return e.prototype.initialize=function(r){this.degree=r,this.genPoly=t.generateECPolynomial(this.degree)},e.prototype.encode=function(r){if(!this.genPoly)throw new Error("Encoder not initialized");const o=new Uint8Array(r.length+this.degree);o.set(r);const n=t.mod(o,this.genPoly),s=this.degree-n.length;if(s>0){const a=new Uint8Array(this.degree);return a.set(n,s),a}return n},ft=e,ft}var pt={},gt={},wt={},rn;function Wn(){return rn||(rn=1,wt.isValid=function(e){return!isNaN(e)&&e>=1&&e<=40}),wt}var Z={},on;function Bn(){if(on)return Z;on=1;const t="[0-9]+",e="[A-Z $%*+\\-./:]+";let i="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";i=i.replace(/u/g,"\\u");const r="(?:(?![A-Z0-9 $%*+\\-./:]|"+i+`)(?:.|[\r
]))+`;Z.KANJI=new RegExp(i,"g"),Z.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g"),Z.BYTE=new RegExp(r,"g"),Z.NUMERIC=new RegExp(t,"g"),Z.ALPHANUMERIC=new RegExp(e,"g");const o=new RegExp("^"+i+"$"),n=new RegExp("^"+t+"$"),s=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");return Z.testKanji=function(l){return o.test(l)},Z.testNumeric=function(l){return n.test(l)},Z.testAlphanumeric=function(l){return s.test(l)},Z}var sn;function Ce(){return sn||(sn=1,(function(t){const e=Wn(),i=Bn();t.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},t.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},t.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},t.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},t.MIXED={bit:-1},t.getCharCountIndicator=function(n,s){if(!n.ccBits)throw new Error("Invalid mode: "+n);if(!e.isValid(s))throw new Error("Invalid version: "+s);return s>=1&&s<10?n.ccBits[0]:s<27?n.ccBits[1]:n.ccBits[2]},t.getBestModeForData=function(n){return i.testNumeric(n)?t.NUMERIC:i.testAlphanumeric(n)?t.ALPHANUMERIC:i.testKanji(n)?t.KANJI:t.BYTE},t.toString=function(n){if(n&&n.id)return n.id;throw new Error("Invalid mode")},t.isValid=function(n){return n&&n.bit&&n.ccBits};function r(o){if(typeof o!="string")throw new Error("Param is not a string");switch(o.toLowerCase()){case"numeric":return t.NUMERIC;case"alphanumeric":return t.ALPHANUMERIC;case"kanji":return t.KANJI;case"byte":return t.BYTE;default:throw new Error("Unknown mode: "+o)}}t.from=function(n,s){if(t.isValid(n))return n;try{return r(n)}catch{return s}}})(gt)),gt}var an;function Ci(){return an||(an=1,(function(t){const e=ve(),i=Pn(),r=Bt(),o=Ce(),n=Wn(),s=7973,a=e.getBCHDigit(s);function l(v,p,A){for(let b=1;b<=40;b++)if(p<=t.getCapacity(b,A,v))return b}function c(v,p){return o.getCharCountIndicator(v,p)+4}function d(v,p){let A=0;return v.forEach(function(b){const _=c(b.mode,p);A+=_+b.getBitsLength()}),A}function $(v,p){for(let A=1;A<=40;A++)if(d(v,A)<=t.getCapacity(A,p,o.MIXED))return A}t.from=function(p,A){return n.isValid(p)?parseInt(p,10):A},t.getCapacity=function(p,A,b){if(!n.isValid(p))throw new Error("Invalid QR Code version");typeof b>"u"&&(b=o.BYTE);const _=e.getSymbolTotalCodewords(p),w=i.getTotalCodewordsCount(p,A),g=(_-w)*8;if(b===o.MIXED)return g;const m=g-c(b,p);switch(b){case o.NUMERIC:return Math.floor(m/10*3);case o.ALPHANUMERIC:return Math.floor(m/11*2);case o.KANJI:return Math.floor(m/13);case o.BYTE:default:return Math.floor(m/8)}},t.getBestVersionForData=function(p,A){let b;const _=r.from(A,r.M);if(Array.isArray(p)){if(p.length>1)return $(p,_);if(p.length===0)return 1;b=p[0]}else b=p;return l(b.mode,b.getLength(),_)},t.getEncodedBits=function(p){if(!n.isValid(p)||p<7)throw new Error("Invalid QR Code version");let A=p<<12;for(;e.getBCHDigit(A)-a>=0;)A^=s<<e.getBCHDigit(A)-a;return p<<12|A}})(pt)),pt}var mt={},ln;function $i(){if(ln)return mt;ln=1;const t=ve(),e=1335,i=21522,r=t.getBCHDigit(e);return mt.getEncodedBits=function(n,s){const a=n.bit<<3|s;let l=a<<10;for(;t.getBCHDigit(l)-r>=0;)l^=e<<t.getBCHDigit(l)-r;return(a<<10|l)^i},mt}var bt={},yt,cn;function xi(){if(cn)return yt;cn=1;const t=Ce();function e(i){this.mode=t.NUMERIC,this.data=i.toString()}return e.getBitsLength=function(r){return 10*Math.floor(r/3)+(r%3?r%3*3+1:0)},e.prototype.getLength=function(){return this.data.length},e.prototype.getBitsLength=function(){return e.getBitsLength(this.data.length)},e.prototype.write=function(r){let o,n,s;for(o=0;o+3<=this.data.length;o+=3)n=this.data.substr(o,3),s=parseInt(n,10),r.put(s,10);const a=this.data.length-o;a>0&&(n=this.data.substr(o),s=parseInt(n,10),r.put(s,a*3+1))},yt=e,yt}var vt,un;function Ei(){if(un)return vt;un=1;const t=Ce(),e=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function i(r){this.mode=t.ALPHANUMERIC,this.data=r}return i.getBitsLength=function(o){return 11*Math.floor(o/2)+6*(o%2)},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(o){let n;for(n=0;n+2<=this.data.length;n+=2){let s=e.indexOf(this.data[n])*45;s+=e.indexOf(this.data[n+1]),o.put(s,11)}this.data.length%2&&o.put(e.indexOf(this.data[n]),6)},vt=i,vt}var Ct,dn;function Ri(){return dn||(dn=1,Ct=function(e){for(var i=[],r=e.length,o=0;o<r;o++){var n=e.charCodeAt(o);if(n>=55296&&n<=56319&&r>o+1){var s=e.charCodeAt(o+1);s>=56320&&s<=57343&&(n=(n-55296)*1024+s-56320+65536,o+=1)}if(n<128){i.push(n);continue}if(n<2048){i.push(n>>6|192),i.push(n&63|128);continue}if(n<55296||n>=57344&&n<65536){i.push(n>>12|224),i.push(n>>6&63|128),i.push(n&63|128);continue}if(n>=65536&&n<=1114111){i.push(n>>18|240),i.push(n>>12&63|128),i.push(n>>6&63|128),i.push(n&63|128);continue}i.push(239,191,189)}return new Uint8Array(i).buffer}),Ct}var $t,hn;function Si(){if(hn)return $t;hn=1;const t=Ri(),e=Ce();function i(r){this.mode=e.BYTE,typeof r=="string"&&(r=t(r)),this.data=new Uint8Array(r)}return i.getBitsLength=function(o){return o*8},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(r){for(let o=0,n=this.data.length;o<n;o++)r.put(this.data[o],8)},$t=i,$t}var xt,fn;function Ti(){if(fn)return xt;fn=1;const t=Ce(),e=ve();function i(r){this.mode=t.KANJI,this.data=r}return i.getBitsLength=function(o){return o*13},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(r){let o;for(o=0;o<this.data.length;o++){let n=e.toSJIS(this.data[o]);if(n>=33088&&n<=40956)n-=33088;else if(n>=57408&&n<=60351)n-=49472;else throw new Error("Invalid SJIS character: "+this.data[o]+`
Make sure your charset is UTF-8`);n=(n>>>8&255)*192+(n&255),r.put(n,13)}},xt=i,xt}var pn;function _i(){return pn||(pn=1,(function(t){const e=Ce(),i=xi(),r=Ei(),o=Si(),n=Ti(),s=Bn(),a=ve(),l=ei();function c(w){return unescape(encodeURIComponent(w)).length}function d(w,g,m){const h=[];let L;for(;(L=w.exec(m))!==null;)h.push({data:L[0],index:L.index,mode:g,length:L[0].length});return h}function $(w){const g=d(s.NUMERIC,e.NUMERIC,w),m=d(s.ALPHANUMERIC,e.ALPHANUMERIC,w);let h,L;return a.isKanjiModeEnabled()?(h=d(s.BYTE,e.BYTE,w),L=d(s.KANJI,e.KANJI,w)):(h=d(s.BYTE_KANJI,e.BYTE,w),L=[]),g.concat(m,h,L).sort(function(S,R){return S.index-R.index}).map(function(S){return{data:S.data,mode:S.mode,length:S.length}})}function v(w,g){switch(g){case e.NUMERIC:return i.getBitsLength(w);case e.ALPHANUMERIC:return r.getBitsLength(w);case e.KANJI:return n.getBitsLength(w);case e.BYTE:return o.getBitsLength(w)}}function p(w){return w.reduce(function(g,m){const h=g.length-1>=0?g[g.length-1]:null;return h&&h.mode===m.mode?(g[g.length-1].data+=m.data,g):(g.push(m),g)},[])}function A(w){const g=[];for(let m=0;m<w.length;m++){const h=w[m];switch(h.mode){case e.NUMERIC:g.push([h,{data:h.data,mode:e.ALPHANUMERIC,length:h.length},{data:h.data,mode:e.BYTE,length:h.length}]);break;case e.ALPHANUMERIC:g.push([h,{data:h.data,mode:e.BYTE,length:h.length}]);break;case e.KANJI:g.push([h,{data:h.data,mode:e.BYTE,length:c(h.data)}]);break;case e.BYTE:g.push([{data:h.data,mode:e.BYTE,length:c(h.data)}])}}return g}function b(w,g){const m={},h={start:{}};let L=["start"];for(let C=0;C<w.length;C++){const S=w[C],R=[];for(let y=0;y<S.length;y++){const I=S[y],x=""+C+y;R.push(x),m[x]={node:I,lastCount:0},h[x]={};for(let T=0;T<L.length;T++){const E=L[T];m[E]&&m[E].node.mode===I.mode?(h[E][x]=v(m[E].lastCount+I.length,I.mode)-v(m[E].lastCount,I.mode),m[E].lastCount+=I.length):(m[E]&&(m[E].lastCount=I.length),h[E][x]=v(I.length,I.mode)+4+e.getCharCountIndicator(I.mode,g))}}L=R}for(let C=0;C<L.length;C++)h[L[C]].end=0;return{map:h,table:m}}function _(w,g){let m;const h=e.getBestModeForData(w);if(m=e.from(g,h),m!==e.BYTE&&m.bit<h.bit)throw new Error('"'+w+'" cannot be encoded with mode '+e.toString(m)+`.
 Suggested mode is: `+e.toString(h));switch(m===e.KANJI&&!a.isKanjiModeEnabled()&&(m=e.BYTE),m){case e.NUMERIC:return new i(w);case e.ALPHANUMERIC:return new r(w);case e.KANJI:return new n(w);case e.BYTE:return new o(w)}}t.fromArray=function(g){return g.reduce(function(m,h){return typeof h=="string"?m.push(_(h,null)):h.data&&m.push(_(h.data,h.mode)),m},[])},t.fromString=function(g,m){const h=$(g,a.isKanjiModeEnabled()),L=A(h),C=b(L,m),S=l.find_path(C.map,"start","end"),R=[];for(let y=1;y<S.length-1;y++)R.push(C.table[S[y]].node);return t.fromArray(p(R))},t.rawSplit=function(g){return t.fromArray($(g,a.isKanjiModeEnabled()))}})(bt)),bt}var gn;function Ai(){if(gn)return ot;gn=1;const t=ve(),e=Bt(),i=fi(),r=pi(),o=gi(),n=wi(),s=mi(),a=Pn(),l=vi(),c=Ci(),d=$i(),$=Ce(),v=_i();function p(C,S){const R=C.size,y=n.getPositions(S);for(let I=0;I<y.length;I++){const x=y[I][0],T=y[I][1];for(let E=-1;E<=7;E++)if(!(x+E<=-1||R<=x+E))for(let W=-1;W<=7;W++)T+W<=-1||R<=T+W||(E>=0&&E<=6&&(W===0||W===6)||W>=0&&W<=6&&(E===0||E===6)||E>=2&&E<=4&&W>=2&&W<=4?C.set(x+E,T+W,!0,!0):C.set(x+E,T+W,!1,!0))}}function A(C){const S=C.size;for(let R=8;R<S-8;R++){const y=R%2===0;C.set(R,6,y,!0),C.set(6,R,y,!0)}}function b(C,S){const R=o.getPositions(S);for(let y=0;y<R.length;y++){const I=R[y][0],x=R[y][1];for(let T=-2;T<=2;T++)for(let E=-2;E<=2;E++)T===-2||T===2||E===-2||E===2||T===0&&E===0?C.set(I+T,x+E,!0,!0):C.set(I+T,x+E,!1,!0)}}function _(C,S){const R=C.size,y=c.getEncodedBits(S);let I,x,T;for(let E=0;E<18;E++)I=Math.floor(E/3),x=E%3+R-8-3,T=(y>>E&1)===1,C.set(I,x,T,!0),C.set(x,I,T,!0)}function w(C,S,R){const y=C.size,I=d.getEncodedBits(S,R);let x,T;for(x=0;x<15;x++)T=(I>>x&1)===1,x<6?C.set(x,8,T,!0):x<8?C.set(x+1,8,T,!0):C.set(y-15+x,8,T,!0),x<8?C.set(8,y-x-1,T,!0):x<9?C.set(8,15-x-1+1,T,!0):C.set(8,15-x-1,T,!0);C.set(y-8,8,1,!0)}function g(C,S){const R=C.size;let y=-1,I=R-1,x=7,T=0;for(let E=R-1;E>0;E-=2)for(E===6&&E--;;){for(let W=0;W<2;W++)if(!C.isReserved(I,E-W)){let le=!1;T<S.length&&(le=(S[T]>>>x&1)===1),C.set(I,E-W,le),x--,x===-1&&(T++,x=7)}if(I+=y,I<0||R<=I){I-=y,y=-y;break}}}function m(C,S,R){const y=new i;R.forEach(function(W){y.put(W.mode.bit,4),y.put(W.getLength(),$.getCharCountIndicator(W.mode,C)),W.write(y)});const I=t.getSymbolTotalCodewords(C),x=a.getTotalCodewordsCount(C,S),T=(I-x)*8;for(y.getLengthInBits()+4<=T&&y.put(0,4);y.getLengthInBits()%8!==0;)y.putBit(0);const E=(T-y.getLengthInBits())/8;for(let W=0;W<E;W++)y.put(W%2?17:236,8);return h(y,C,S)}function h(C,S,R){const y=t.getSymbolTotalCodewords(S),I=a.getTotalCodewordsCount(S,R),x=y-I,T=a.getBlocksCount(S,R),E=y%T,W=T-E,le=Math.floor(y/T),Ie=Math.floor(x/T),Un=Ie+1,Ot=le-Ie,zn=new l(Ot);let et=0;const Oe=new Array(T),Dt=new Array(T);let tt=0;const qn=new Uint8Array(C.buffer);for(let xe=0;xe<T;xe++){const it=xe<W?Ie:Un;Oe[xe]=qn.slice(et,et+it),Dt[xe]=zn.encode(Oe[xe]),et+=it,tt=Math.max(tt,it)}const nt=new Uint8Array(y);let jt=0,ne,ie;for(ne=0;ne<tt;ne++)for(ie=0;ie<T;ie++)ne<Oe[ie].length&&(nt[jt++]=Oe[ie][ne]);for(ne=0;ne<Ot;ne++)for(ie=0;ie<T;ie++)nt[jt++]=Dt[ie][ne];return nt}function L(C,S,R,y){let I;if(Array.isArray(C))I=v.fromArray(C);else if(typeof C=="string"){let le=S;if(!le){const Ie=v.rawSplit(C);le=c.getBestVersionForData(Ie,R)}I=v.fromString(C,le||40)}else throw new Error("Invalid data");const x=c.getBestVersionForData(I,R);if(!x)throw new Error("The amount of data is too big to be stored in a QR Code");if(!S)S=x;else if(S<x)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+x+`.
`);const T=m(S,R,I),E=t.getSymbolSize(S),W=new r(E);return p(W,S),A(W),b(W,S),w(W,R,0),S>=7&&_(W,S),g(W,T),isNaN(y)&&(y=s.getBestMask(W,w.bind(null,W,R))),s.applyMask(y,W),w(W,R,y),{modules:W,version:S,errorCorrectionLevel:R,maskPattern:y,segments:I}}return ot.create=function(S,R){if(typeof S>"u"||S==="")throw new Error("No input text");let y=e.M,I,x;return typeof R<"u"&&(y=e.from(R.errorCorrectionLevel,e.M),I=c.from(R.version),x=s.from(R.maskPattern),R.toSJISFunc&&t.setToSJISFunction(R.toSJISFunc)),L(S,I,y,x)},ot}var Et={},Rt={},wn;function kn(){return wn||(wn=1,(function(t){function e(i){if(typeof i=="number"&&(i=i.toString()),typeof i!="string")throw new Error("Color should be defined as hex string");let r=i.slice().replace("#","").split("");if(r.length<3||r.length===5||r.length>8)throw new Error("Invalid hex color: "+i);(r.length===3||r.length===4)&&(r=Array.prototype.concat.apply([],r.map(function(n){return[n,n]}))),r.length===6&&r.push("F","F");const o=parseInt(r.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+r.slice(0,6).join("")}}t.getOptions=function(r){r||(r={}),r.color||(r.color={});const o=typeof r.margin>"u"||r.margin===null||r.margin<0?4:r.margin,n=r.width&&r.width>=21?r.width:void 0,s=r.scale||4;return{width:n,scale:n?4:s,margin:o,color:{dark:e(r.color.dark||"#000000ff"),light:e(r.color.light||"#ffffffff")},type:r.type,rendererOpts:r.rendererOpts||{}}},t.getScale=function(r,o){return o.width&&o.width>=r+o.margin*2?o.width/(r+o.margin*2):o.scale},t.getImageWidth=function(r,o){const n=t.getScale(r,o);return Math.floor((r+o.margin*2)*n)},t.qrToImageData=function(r,o,n){const s=o.modules.size,a=o.modules.data,l=t.getScale(s,n),c=Math.floor((s+n.margin*2)*l),d=n.margin*l,$=[n.color.light,n.color.dark];for(let v=0;v<c;v++)for(let p=0;p<c;p++){let A=(v*c+p)*4,b=n.color.light;if(v>=d&&p>=d&&v<c-d&&p<c-d){const _=Math.floor((v-d)/l),w=Math.floor((p-d)/l);b=$[a[_*s+w]?1:0]}r[A++]=b.r,r[A++]=b.g,r[A++]=b.b,r[A]=b.a}}})(Rt)),Rt}var mn;function Ii(){return mn||(mn=1,(function(t){const e=kn();function i(o,n,s){o.clearRect(0,0,n.width,n.height),n.style||(n.style={}),n.height=s,n.width=s,n.style.height=s+"px",n.style.width=s+"px"}function r(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}t.render=function(n,s,a){let l=a,c=s;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),s||(c=r()),l=e.getOptions(l);const d=e.getImageWidth(n.modules.size,l),$=c.getContext("2d"),v=$.createImageData(d,d);return e.qrToImageData(v.data,n,l),i($,c,d),$.putImageData(v,0,0),c},t.renderToDataURL=function(n,s,a){let l=a;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),l||(l={});const c=t.render(n,s,l),d=l.type||"image/png",$=l.rendererOpts||{};return c.toDataURL(d,$.quality)}})(Et)),Et}var St={},bn;function Pi(){if(bn)return St;bn=1;const t=kn();function e(o,n){const s=o.a/255,a=n+'="'+o.hex+'"';return s<1?a+" "+n+'-opacity="'+s.toFixed(2).slice(1)+'"':a}function i(o,n,s){let a=o+n;return typeof s<"u"&&(a+=" "+s),a}function r(o,n,s){let a="",l=0,c=!1,d=0;for(let $=0;$<o.length;$++){const v=Math.floor($%n),p=Math.floor($/n);!v&&!c&&(c=!0),o[$]?(d++,$>0&&v>0&&o[$-1]||(a+=c?i("M",v+s,.5+p+s):i("m",l,0),l=0,c=!1),v+1<n&&o[$+1]||(a+=i("h",d),d=0)):l++}return a}return St.render=function(n,s,a){const l=t.getOptions(s),c=n.modules.size,d=n.modules.data,$=c+l.margin*2,v=l.color.light.a?"<path "+e(l.color.light,"fill")+' d="M0 0h'+$+"v"+$+'H0z"/>':"",p="<path "+e(l.color.dark,"stroke")+' d="'+r(d,c,l.margin)+'"/>',A='viewBox="0 0 '+$+" "+$+'"',_='<svg xmlns="http://www.w3.org/2000/svg" '+(l.width?'width="'+l.width+'" height="'+l.width+'" ':"")+A+' shape-rendering="crispEdges">'+v+p+`</svg>
`;return typeof a=="function"&&a(null,_),_},St}var yn;function Wi(){if(yn)return Ee;yn=1;const t=hi(),e=Ai(),i=Ii(),r=Pi();function o(n,s,a,l,c){const d=[].slice.call(arguments,1),$=d.length,v=typeof d[$-1]=="function";if(!v&&!t())throw new Error("Callback required as last argument");if(v){if($<2)throw new Error("Too few arguments provided");$===2?(c=a,a=s,s=l=void 0):$===3&&(s.getContext&&typeof c>"u"?(c=l,l=void 0):(c=l,l=a,a=s,s=void 0))}else{if($<1)throw new Error("Too few arguments provided");return $===1?(a=s,s=l=void 0):$===2&&!s.getContext&&(l=a,a=s,s=void 0),new Promise(function(p,A){try{const b=e.create(a,l);p(n(b,s,l))}catch(b){A(b)}})}try{const p=e.create(a,l);c(null,n(p,s,l))}catch(p){c(p)}}return Ee.create=e.create,Ee.toCanvas=o.bind(null,i.render),Ee.toDataURL=o.bind(null,i.renderToDataURL),Ee.toString=o.bind(null,function(n,s,a){return r.render(n,a)}),Ee}var Bi=Wi();const ki=Zn(Bi),Li=.1,vn=2.5,re=7;function Tt(t,e,i){return t===e?!1:(t-e<0?e-t:t-e)<=i+Li}function Ni(t,e){const i=Array.prototype.slice.call(ki.create(t,{errorCorrectionLevel:e}).modules.data,0),r=Math.sqrt(i.length);return i.reduce((o,n,s)=>(s%r===0?o.push([n]):o[o.length-1].push(n))&&o,[])}const Mi={generate({uri:t,size:e,logoSize:i,padding:r=8,dotColor:o="var(--apkt-colors-black)"}){const s=[],a=Ni(t,"Q"),l=(e-2*r)/a.length,c=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];c.forEach(({x:b,y:_})=>{const w=(a.length-re)*l*b+r,g=(a.length-re)*l*_+r,m=.45;for(let h=0;h<c.length;h+=1){const L=l*(re-h*2);s.push(Ue`
            <rect
              fill=${h===2?"var(--apkt-colors-black)":"var(--apkt-colors-white)"}
              width=${h===0?L-10:L}
              rx= ${h===0?(L-10)*m:L*m}
              ry= ${h===0?(L-10)*m:L*m}
              stroke=${o}
              stroke-width=${h===0?10:0}
              height=${h===0?L-10:L}
              x= ${h===0?g+l*h+10/2:g+l*h}
              y= ${h===0?w+l*h+10/2:w+l*h}
            />
          `)}});const d=Math.floor((i+25)/l),$=a.length/2-d/2,v=a.length/2+d/2-1,p=[];a.forEach((b,_)=>{b.forEach((w,g)=>{if(a[_][g]&&!(_<re&&g<re||_>a.length-(re+1)&&g<re||_<re&&g>a.length-(re+1))&&!(_>$&&_<v&&g>$&&g<v)){const m=_*l+l/2+r,h=g*l+l/2+r;p.push([m,h])}})});const A={};return p.forEach(([b,_])=>{var w;A[b]?(w=A[b])==null||w.push(_):A[b]=[_]}),Object.entries(A).map(([b,_])=>{const w=_.filter(g=>_.every(m=>!Tt(g,m,l)));return[Number(b),w]}).forEach(([b,_])=>{_.forEach(w=>{s.push(Ue`<circle cx=${b} cy=${w} fill=${o} r=${l/vn} />`)})}),Object.entries(A).filter(([b,_])=>_.length>1).map(([b,_])=>{const w=_.filter(g=>_.some(m=>Tt(g,m,l)));return[Number(b),w]}).map(([b,_])=>{_.sort((g,m)=>g<m?-1:1);const w=[];for(const g of _){const m=w.find(h=>h.some(L=>Tt(g,L,l)));m?m.push(g):w.push([g])}return[b,w.map(g=>[g[0],g[g.length-1]])]}).forEach(([b,_])=>{_.forEach(([w,g])=>{s.push(Ue`
              <line
                x1=${b}
                x2=${b}
                y1=${w}
                y2=${g}
                stroke=${o}
                stroke-width=${l/(vn/2)}
                stroke-linecap="round"
              />
            `)})}),s}},Oi=U`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    background-color: ${({colors:t})=>t.white};
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  :host {
    border-radius: ${({borderRadius:t})=>t[4]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    background-color: ${({tokens:t})=>t.theme.backgroundPrimary};
    box-shadow: inset 0 0 0 4px ${({tokens:t})=>t.theme.backgroundPrimary};
    border-radius: ${({borderRadius:t})=>t[6]};
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: ${({borderRadius:t})=>t[2]};
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: #3396ff !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }

  wui-icon > svg {
    width: inherit;
    height: inherit;
  }
`;var he=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let ee=class extends O{constructor(){super(...arguments),this.uri="",this.size=500,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),u`<wui-flex
      alignItems="center"
      justifyContent="center"
      class="wui-qr-code"
      direction="column"
      gap="4"
      width="100%"
      style="height: 100%"
    >
      ${this.templateVisual()} ${this.templateSvg()}
    </wui-flex>`}templateSvg(){return Ue`
      <svg viewBox="0 0 ${this.size} ${this.size}" width="100%" height="100%">
        ${Mi.generate({uri:this.uri,size:this.size,logoSize:this.arenaClear?0:this.size/4})}
      </svg>
    `}templateVisual(){var e;return this.imageSrc?u`<wui-image src=${this.imageSrc} alt=${(e=this.alt)!=null?e:"logo"}></wui-image>`:this.farcaster?u`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:u`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};ee.styles=[Y,Oi];he([f()],ee.prototype,"uri",void 0);he([f({type:Number})],ee.prototype,"size",void 0);he([f()],ee.prototype,"theme",void 0);he([f()],ee.prototype,"imageSrc",void 0);he([f()],ee.prototype,"alt",void 0);he([f({type:Boolean})],ee.prototype,"arenaClear",void 0);he([f({type:Boolean})],ee.prototype,"farcaster",void 0);ee=he([N("wui-qr-code")],ee);const Di=U`
  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: ${({borderRadius:t})=>t[4]};
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var Ln=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Ve=class extends z{constructor(){super(),this.basic=!1}firstUpdated(){var e,i,r,o;this.basic||H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:(i=(e=this.wallet)==null?void 0:e.name)!=null?i:"WalletConnect",platform:"qrcode",displayIndex:(r=this.wallet)==null?void 0:r.display_index,walletRank:(o=this.wallet)==null?void 0:o.order,view:B.state.view}})}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this.unsubscribe)==null||e.forEach(i=>i())}render(){return this.onRenderProxy(),u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","5","5","5"]}
        gap="5"
      >
        <wui-shimmer width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>
        <wui-text variant="lg-medium" color="primary"> Scan this QR Code with your phone </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0)}qrCodeTemplate(){var r;if(!this.uri||!this.ready)return null;const e=this.wallet?this.wallet.name:void 0;k.setWcLinking(void 0),k.setRecentWallet(this.wallet);const i=(r=je.state.themeVariables["--apkt-qr-color"])!=null?r:je.state.themeVariables["--w3m-qr-color"];return u` <wui-qr-code
      theme=${je.state.themeMode}
      uri=${this.uri}
      imageSrc=${D(ue.getWalletImage(this.wallet))}
      color=${D(i)}
      alt=${D(e)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){const e=!this.uri||!this.ready;return u`<wui-button
      .disabled=${e}
      @click=${this.onCopyUri}
      variant="neutral-secondary"
      size="sm"
      data-testid="copy-wc2-uri"
    >
      Copy link
      <wui-icon size="sm" color="inherit" name="copy" slot="iconRight"></wui-icon>
    </wui-button>`}};Ve.styles=Di;Ln([f({type:Boolean})],Ve.prototype,"basic",void 0);Ve=Ln([N("w3m-connecting-wc-qrcode")],Ve);var ji=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Cn=class extends O{constructor(){var e,i,r;if(super(),this.wallet=(e=B.state.data)==null?void 0:e.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:(i=this.wallet)==null?void 0:i.display_index,walletRank:(r=this.wallet)==null?void 0:r.order,view:B.state.view}})}render(){return u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="5"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${D(ue.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="md-regular" color="primary">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};Cn=ji([N("w3m-connecting-wc-unsupported")],Cn);var Nn=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Pt=class extends z{constructor(){var e,i;if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=Tn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push(k.subscribeKey("wcUri",()=>{this.updateLoadingState()})),H.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web",displayIndex:(e=this.wallet)==null?void 0:e.display_index,walletRank:(i=this.wallet)==null?void 0:i.order,view:B.state.view}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){var e;if((e=this.wallet)!=null&&e.webapp_link&&this.uri)try{this.error=!1;const{webapp_link:i,name:r}=this.wallet,{redirect:o,href:n}=M.formatUniversalUrl(i,this.uri);k.setWcLinking({name:r,href:n}),k.setRecentWallet(this.wallet),M.openHref(o,"_blank")}catch{this.error=!0}}};Nn([P()],Pt.prototype,"isLoading",void 0);Pt=Nn([N("w3m-connecting-wc-web")],Pt);const Ui=U`
  :host([data-mobile-fullscreen='true']) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :host([data-mobile-fullscreen='true']) wui-ux-by-reown {
    margin-top: auto;
  }
`;var $e=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let ae=class extends O{constructor(){var e;super(),this.wallet=(e=B.state.data)==null?void 0:e.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!q.state.siwx,this.remoteFeatures=q.state.remoteFeatures,this.displayBranding=!0,this.basic=!1,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(q.subscribeKey("remoteFeatures",i=>this.remoteFeatures=i))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return q.state.enableMobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      ${this.headerTemplate()}
      <div class="platform-container">${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){var e;return!((e=this.remoteFeatures)!=null&&e.reownBranding)||!this.displayBranding?null:u`<wui-ux-by-reown></wui-ux-by-reown>`}async initializeConnection(e=!1){var i,r,o,n,s;if(!(this.platform==="browser"||q.state.manualWCControl&&!e))try{const{wcPairingExpiry:a,status:l}=k.state,{redirectView:c}=(i=B.state.data)!=null?i:{};if(e||q.state.enableEmbedded||M.isPairingExpired(a)||l==="connecting"){const d=k.getConnections(oe.state.activeChain),$=(r=this.remoteFeatures)==null?void 0:r.multiWallet,v=d.length>0;await k.connectWalletConnect({cache:"never"}),this.isSiwxEnabled||(v&&$?(B.replace("ProfileWallets"),Be.showSuccess("New Wallet Added")):c?B.replace(c):En.close())}}catch(a){if(a instanceof Error&&a.message.includes("An error occurred when attempting to switch chain")&&!q.state.enableNetworkSwitch&&oe.state.activeChain){oe.setActiveCaipNetwork(Kn.getUnsupportedNetwork(`${oe.state.activeChain}:${(o=oe.state.activeCaipNetwork)==null?void 0:o.id}`)),oe.showUnsupportedChainUI();return}a instanceof Rn&&a.originalName===Sn.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?H.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:a.message}}):H.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:(n=a==null?void 0:a.message)!=null?n:"Unknown"}}),k.setWcError(!0),Be.showError((s=a.message)!=null?s:"Connection error"),k.resetWcConnection(),B.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;const{mobile_link:e,desktop_link:i,webapp_link:r,injected:o,rdns:n}=this.wallet,s=o==null?void 0:o.map(({injected_id:A})=>A).filter(Boolean),a=[...n?[n]:s!=null?s:[]],l=q.state.isUniversalProvider?!1:a.length,c=e,d=r,$=k.checkInstalled(a),v=l&&$,p=i&&!M.isMobile();v&&!oe.state.noAdapters&&this.platforms.push("browser"),c&&this.platforms.push(M.isMobile()?"mobile":"qrcode"),d&&this.platforms.push("web"),p&&this.platforms.push("desktop"),!v&&l&&!oe.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return u`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return u`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return u`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return u`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return u`<w3m-connecting-wc-qrcode ?basic=${this.basic}></w3m-connecting-wc-qrcode>`;default:return u`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?u`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(e){var r;const i=(r=this.shadowRoot)==null?void 0:r.querySelector("div");i&&(await i.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=e,i.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};ae.styles=Ui;$e([P()],ae.prototype,"platform",void 0);$e([P()],ae.prototype,"platforms",void 0);$e([P()],ae.prototype,"isSiwxEnabled",void 0);$e([P()],ae.prototype,"remoteFeatures",void 0);$e([f({type:Boolean})],ae.prototype,"displayBranding",void 0);$e([f({type:Boolean})],ae.prototype,"basic",void 0);ae=$e([N("w3m-connecting-wc-view")],ae);var kt=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let He=class extends O{constructor(){super(),this.unsubscribe=[],this.isMobile=M.isMobile(),this.remoteFeatures=q.state.remoteFeatures,this.unsubscribe.push(q.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){if(this.isMobile){const{featured:e,recommended:i}=j.state,{customWallets:r}=q.state,o=Gn.getRecentWallets(),n=e.length||i.length||(r==null?void 0:r.length)||o.length;return u`<wui-flex flexDirection="column" gap="2" .margin=${["1","3","3","3"]}>
        ${n?u`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return u`<wui-flex flexDirection="column" .padding=${["0","0","4","0"]}>
        <w3m-connecting-wc-view ?basic=${!0} .displayBranding=${!1}></w3m-connecting-wc-view>
        <wui-flex flexDirection="column" .padding=${["0","3","0","3"]}>
          <w3m-all-wallets-widget></w3m-all-wallets-widget>
        </wui-flex>
      </wui-flex>
      ${this.reownBrandingTemplate()} `}reownBrandingTemplate(){var e;return(e=this.remoteFeatures)!=null&&e.reownBranding?u` <wui-flex flexDirection="column" .padding=${["1","0","1","0"]}>
      <wui-ux-by-reown></wui-ux-by-reown>
    </wui-flex>`:null}};kt([P()],He.prototype,"isMobile",void 0);kt([P()],He.prototype,"remoteFeatures",void 0);He=kt([N("w3m-connecting-wc-basic-view")],He);const zi=t=>t.strings===void 0;const We=(t,e)=>{var r;const i=t._$AN;if(i===void 0)return!1;for(const o of i)(r=o._$AO)==null||r.call(o,e,!1),We(o,e);return!0},Ke=t=>{let e,i;do{if((e=t._$AM)===void 0)break;i=e._$AN,i.delete(t),t=e}while((i==null?void 0:i.size)===0)},Mn=t=>{for(let e;e=t._$AM;t=e){let i=e._$AN;if(i===void 0)e._$AN=i=new Set;else if(i.has(t))break;i.add(t),Vi(e)}};function qi(t){this._$AN!==void 0?(Ke(this),this._$AM=t,Mn(this)):this._$AM=t}function Fi(t,e=!1,i=0){const r=this._$AH,o=this._$AN;if(o!==void 0&&o.size!==0)if(e)if(Array.isArray(r))for(let n=i;n<r.length;n++)We(r[n],!1),Ke(r[n]);else r!=null&&(We(r,!1),Ke(r));else We(this,t)}const Vi=t=>{var e,i;t.type==Jn.CHILD&&((e=t._$AP)!=null||(t._$AP=Fi),(i=t._$AQ)!=null||(t._$AQ=qi))};class Hi extends Qn{constructor(){super(...arguments),this._$AN=void 0}_$AT(e,i,r){super._$AT(e,i,r),Mn(this),this.isConnected=e._$AU}_$AO(e,i=!0){var r,o;e!==this.isConnected&&(this.isConnected=e,e?(r=this.reconnected)==null||r.call(this):(o=this.disconnected)==null||o.call(this)),i&&(We(this,e),Ke(this))}setValue(e){if(zi(this._$Ct))this._$Ct._$AI(e,this);else{const i=[...this._$Ct._$AH];i[this._$Ci]=e,this._$Ct._$AI(i,this,0)}}disconnected(){}reconnected(){}}const Lt=()=>new Ki;class Ki{}const _t=new WeakMap,Nt=Yn(class extends Hi{render(t){return zt}update(t,[e]){var r;const i=e!==this.G;return i&&this.G!==void 0&&this.rt(void 0),(i||this.lt!==this.ct)&&(this.G=e,this.ht=(r=t.options)==null?void 0:r.host,this.rt(this.ct=t.element)),zt}rt(t){var e;if(this.isConnected||(t=void 0),typeof this.G=="function"){const i=(e=this.ht)!=null?e:globalThis;let r=_t.get(i);r===void 0&&(r=new WeakMap,_t.set(i,r)),r.get(this.G)!==void 0&&this.G.call(this.ht,void 0),r.set(this.G,t),t!==void 0&&this.G.call(this.ht,t)}else this.G.value=t}get lt(){var t,e,i;return typeof this.G=="function"?(e=_t.get((t=this.ht)!=null?t:globalThis))==null?void 0:e.get(this.G):(i=this.G)==null?void 0:i.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}}),Gi=U`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({colors:t})=>t.neutrals300};
    border-radius: ${({borderRadius:t})=>t.round};
    border: 1px solid transparent;
    will-change: border;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  span:before {
    content: '';
    position: absolute;
    background-color: ${({colors:t})=>t.white};
    border-radius: 50%;
  }

  /* -- Sizes --------------------------------------------------------- */
  label[data-size='lg'] {
    width: 48px;
    height: 32px;
  }

  label[data-size='md'] {
    width: 40px;
    height: 28px;
  }

  label[data-size='sm'] {
    width: 32px;
    height: 22px;
  }

  label[data-size='lg'] > span:before {
    height: 24px;
    width: 24px;
    left: 4px;
    top: 3px;
  }

  label[data-size='md'] > span:before {
    height: 20px;
    width: 20px;
    left: 4px;
    top: 3px;
  }

  label[data-size='sm'] > span:before {
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
  }

  /* -- Focus states --------------------------------------------------- */
  input:focus-visible:not(:checked) + span,
  input:focus:not(:checked) + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    background-color: ${({tokens:t})=>t.theme.textTertiary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  input:focus-visible:checked + span,
  input:focus:checked + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  /* -- Checked states --------------------------------------------------- */
  input:checked + span {
    background-color: ${({tokens:t})=>t.core.iconAccentPrimary};
  }

  label[data-size='lg'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='md'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='sm'] > input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }

  /* -- Hover states ------------------------------------------------------- */
  label:hover > input:not(:checked):not(:disabled) + span {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  label:hover > input:checked:not(:disabled) + span {
    background-color: ${({colors:t})=>t.accent080};
  }

  /* -- Disabled state --------------------------------------------------- */
  label:has(input:disabled) {
    pointer-events: none;
    user-select: none;
  }

  input:not(:checked):disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:checked:disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:not(:checked):disabled + span::before {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  input:checked:disabled + span::before {
    background-color: ${({tokens:t})=>t.theme.textTertiary};
  }
`;var Ze=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Se=class extends O{constructor(){super(...arguments),this.inputElementRef=Lt(),this.checked=!1,this.disabled=!1,this.size="md"}render(){return u`
      <label data-size=${this.size}>
        <input
          ${Nt(this.inputElementRef)}
          type="checkbox"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){var e;this.dispatchEvent(new CustomEvent("switchChange",{detail:(e=this.inputElementRef.value)==null?void 0:e.checked,bubbles:!0,composed:!0}))}};Se.styles=[Y,ye,Gi];Ze([f({type:Boolean})],Se.prototype,"checked",void 0);Ze([f({type:Boolean})],Se.prototype,"disabled",void 0);Ze([f()],Se.prototype,"size",void 0);Se=Ze([N("wui-toggle")],Se);const Qi=U`
  :host {
    height: auto;
  }

  :host > wui-flex {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[2]} ${({spacing:t})=>t[3]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:t})=>t.theme.foregroundPrimary};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var On=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Ge=class extends O{constructor(){super(...arguments),this.checked=!1}render(){return u`
      <wui-flex>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-toggle
          ?checked=${this.checked}
          size="sm"
          @switchChange=${this.handleToggleChange.bind(this)}
        ></wui-toggle>
      </wui-flex>
    `}handleToggleChange(e){e.stopPropagation(),this.checked=e.detail,this.dispatchSwitchEvent()}dispatchSwitchEvent(){this.dispatchEvent(new CustomEvent("certifiedSwitchChange",{detail:this.checked,bubbles:!0,composed:!0}))}};Ge.styles=[Y,ye,Qi];On([f({type:Boolean})],Ge.prototype,"checked",void 0);Ge=On([N("wui-certified-switch")],Ge);const Ji=U`
  :host {
    position: relative;
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.textPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  .wui-input-text-container {
    position: relative;
    display: flex;
  }

  input {
    width: 100%;
    border-radius: ${({borderRadius:t})=>t[4]};
    color: inherit;
    background: transparent;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[3]} ${({spacing:t})=>t[10]};
    font-size: ${({textSize:t})=>t.large};
    line-height: ${({typography:t})=>t["lg-regular"].lineHeight};
    letter-spacing: ${({typography:t})=>t["lg-regular"].letterSpacing};
    font-weight: ${({fontWeight:t})=>t.regular};
    font-family: ${({fontFamily:t})=>t.regular};
  }

  input[data-size='lg'] {
    padding: ${({spacing:t})=>t[4]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[4]} ${({spacing:t})=>t[10]};
  }

  @media (hover: hover) and (pointer: fine) {
    input:hover:enabled {
      border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    }
  }

  input:disabled {
    cursor: unset;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  input::placeholder {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  input:focus:enabled {
    border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
  }

  div.wui-input-text-container:has(input:disabled) {
    opacity: 0.5;
  }

  wui-icon.wui-input-text-left-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    left: ${({spacing:t})=>t[4]};
    color: ${({tokens:t})=>t.theme.iconDefault};
  }

  button.wui-input-text-submit-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: ${({borderRadius:t})=>t[2]};
    color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  button.wui-input-text-submit-button:disabled {
    opacity: 1;
  }

  button.wui-input-text-submit-button.loading wui-icon {
    animation: spin 1s linear infinite;
  }

  button.wui-input-text-submit-button:hover {
    background: ${({tokens:t})=>t.core.foregroundAccent010};
  }

  input:has(+ .wui-input-text-submit-button) {
    padding-right: ${({spacing:t})=>t[12]};
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input[type='search']::-webkit-search-decoration,
  input[type='search']::-webkit-search-cancel-button,
  input[type='search']::-webkit-search-results-button,
  input[type='search']::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /* -- Keyframes --------------------------------------------------- */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;var G=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let F=class extends O{constructor(){super(...arguments),this.inputElementRef=Lt(),this.disabled=!1,this.loading=!1,this.placeholder="",this.type="text",this.value="",this.size="md"}render(){return u` <div class="wui-input-text-container">
        ${this.templateLeftIcon()}
        <input
          data-size=${this.size}
          ${Nt(this.inputElementRef)}
          data-testid="wui-input-text"
          type=${this.type}
          enterkeyhint=${D(this.enterKeyHint)}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.dispatchInputChangeEvent.bind(this)}
          @keydown=${this.onKeyDown}
          .value=${this.value||""}
        />
        ${this.templateSubmitButton()}
        <slot class="wui-input-text-slot"></slot>
      </div>
      ${this.templateError()} ${this.templateWarning()}`}templateLeftIcon(){return this.icon?u`<wui-icon
        class="wui-input-text-left-icon"
        size="md"
        data-size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}templateSubmitButton(){var e;return this.onSubmit?u`<button
        class="wui-input-text-submit-button ${this.loading?"loading":""}"
        @click=${(e=this.onSubmit)==null?void 0:e.bind(this)}
        ?disabled=${this.disabled||this.loading}
      >
        ${this.loading?u`<wui-icon name="spinner" size="md"></wui-icon>`:u`<wui-icon name="chevronRight" size="md"></wui-icon>`}
      </button>`:null}templateError(){return this.errorText?u`<wui-text variant="sm-regular" color="error">${this.errorText}</wui-text>`:null}templateWarning(){return this.warningText?u`<wui-text variant="sm-regular" color="warning">${this.warningText}</wui-text>`:null}dispatchInputChangeEvent(){var e;this.dispatchEvent(new CustomEvent("inputChange",{detail:(e=this.inputElementRef.value)==null?void 0:e.value,bubbles:!0,composed:!0}))}};F.styles=[Y,ye,Ji];G([f()],F.prototype,"icon",void 0);G([f({type:Boolean})],F.prototype,"disabled",void 0);G([f({type:Boolean})],F.prototype,"loading",void 0);G([f()],F.prototype,"placeholder",void 0);G([f()],F.prototype,"type",void 0);G([f()],F.prototype,"value",void 0);G([f()],F.prototype,"errorText",void 0);G([f()],F.prototype,"warningText",void 0);G([f()],F.prototype,"onSubmit",void 0);G([f()],F.prototype,"size",void 0);G([f({attribute:!1})],F.prototype,"onKeyDown",void 0);F=G([N("wui-input-text")],F);const Yi=U`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.iconDefault};
    cursor: pointer;
    padding: ${({spacing:t})=>t[2]};
    background-color: transparent;
    border-radius: ${({borderRadius:t})=>t[4]};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
  }

  @media (hover: hover) {
    wui-icon:hover {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }
`;var Dn=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Qe=class extends O{constructor(){super(...arguments),this.inputComponentRef=Lt(),this.inputValue=""}render(){return u`
      <wui-input-text
        ${Nt(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
        @inputChange=${this.onInputChange}
      >
        ${this.inputValue?u`<wui-icon
              @click=${this.clearValue}
              color="inherit"
              size="sm"
              name="close"
            ></wui-icon>`:null}
      </wui-input-text>
    `}onInputChange(e){this.inputValue=e.detail||""}clearValue(){const e=this.inputComponentRef.value,i=e==null?void 0:e.inputElementRef.value;i&&(i.value="",this.inputValue="",i.focus(),i.dispatchEvent(new Event("input")))}};Qe.styles=[Y,Yi];Dn([f()],Qe.prototype,"inputValue",void 0);Qe=Dn([N("wui-search-bar")],Qe);const Xi=U`
  :host {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 104px;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--apkt-path-network);
    clip-path: var(--apkt-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: ${({tokens:t})=>t.theme.foregroundSecondary};
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var jn=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Je=class extends O{constructor(){super(...arguments),this.type="wallet"}render(){return u`
      ${this.shimmerTemplate()}
      <wui-shimmer width="80px" height="20px"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?u` <wui-shimmer data-type=${this.type} width="48px" height="54px"></wui-shimmer>
        ${Xn}`:u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}};Je.styles=[Y,ye,Xi];jn([f()],Je.prototype,"type",void 0);Je=jn([N("wui-card-select-loader")],Je);const Zi=_n`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var Q=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let V=class extends O{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--apkt-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--apkt-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--apkt-spacing-${this.gap})`};
      padding-top: ${this.padding&&se.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&se.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&se.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&se.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&se.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&se.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&se.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&se.getSpacingStyles(this.margin,3)};
    `,u`<slot></slot>`}};V.styles=[Y,Zi];Q([f()],V.prototype,"gridTemplateRows",void 0);Q([f()],V.prototype,"gridTemplateColumns",void 0);Q([f()],V.prototype,"justifyItems",void 0);Q([f()],V.prototype,"alignItems",void 0);Q([f()],V.prototype,"justifyContent",void 0);Q([f()],V.prototype,"alignContent",void 0);Q([f()],V.prototype,"columnGap",void 0);Q([f()],V.prototype,"rowGap",void 0);Q([f()],V.prototype,"gap",void 0);Q([f()],V.prototype,"padding",void 0);Q([f()],V.prototype,"margin",void 0);V=Q([N("wui-grid")],V);const er=U`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[0]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: clamp(0px, ${({borderRadius:t})=>t[4]}, 20px);
    transition:
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-1"]},
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]},
      border-radius ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]};
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: ${({tokens:t})=>t.theme.textPrimary};
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }

  button:disabled > wui-flex > wui-text {
    color: ${({tokens:t})=>t.core.glass010};
  }

  [data-selected='true'] {
    background-color: ${({colors:t})=>t.accent020};
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: ${({colors:t})=>t.accent010};
    }
  }

  [data-selected='true']:active:enabled {
    background-color: ${({colors:t})=>t.accent010};
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var te=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let K=class extends O{constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.isImpressed=!1,this.explorerId="",this.walletQuery="",this.certified=!1,this.displayIndex=0,this.wallet=void 0,this.observer=new IntersectionObserver(e=>{e.forEach(i=>{i.isIntersecting?(this.visible=!0,this.fetchImageSrc(),this.sendImpressionEvent()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){var i,r;const e=((i=this.wallet)==null?void 0:i.badge_type)==="certified";return u`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="1">
          <wui-text
            variant="md-regular"
            color="inherit"
            class=${D(e?"certified":void 0)}
            >${(r=this.wallet)==null?void 0:r.name}</wui-text
          >
          ${e?u`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){var e,i,r;return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():u`
      <wui-wallet-image
        size="lg"
        imageSrc=${D(this.imageSrc)}
        name=${D((e=this.wallet)==null?void 0:e.name)}
        .installed=${(r=(i=this.wallet)==null?void 0:i.installed)!=null?r:!1}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=ue.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await ue.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}sendImpressionEvent(){!this.wallet||this.isImpressed||(this.isImpressed=!0,H.sendWalletImpressionEvent({name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.explorerId,view:B.state.view,query:this.walletQuery,certified:this.certified,displayIndex:this.displayIndex}))}};K.styles=er;te([P()],K.prototype,"visible",void 0);te([P()],K.prototype,"imageSrc",void 0);te([P()],K.prototype,"imageLoading",void 0);te([P()],K.prototype,"isImpressed",void 0);te([f()],K.prototype,"explorerId",void 0);te([f()],K.prototype,"walletQuery",void 0);te([f()],K.prototype,"certified",void 0);te([f()],K.prototype,"displayIndex",void 0);te([f({type:Object})],K.prototype,"wallet",void 0);K=te([N("w3m-all-wallets-list-item")],K);const tr=U`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  w3m-all-wallets-list-item {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-inout-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-loading-spinner {
    padding-top: ${({spacing:t})=>t[4]};
    padding-bottom: ${({spacing:t})=>t[4]};
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var Ne=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};const $n="local-paginator";let me=class extends O{constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!j.state.wallets.length,this.wallets=j.state.wallets,this.mobileFullScreen=q.state.enableMobileFullScreen,this.unsubscribe.push(j.subscribeKey("wallets",e=>this.wallets=e))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){var e;this.unsubscribe.forEach(i=>i()),(e=this.paginationObserver)==null||e.disconnect()}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","3","3","3"]}
        gap="2"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){var i;this.loading=!0;const e=(i=this.shadowRoot)==null?void 0:i.querySelector("wui-grid");e&&(await j.fetchWalletsByPage({page:1}),await e.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,e.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(e,i){return[...Array(e)].map(()=>u`
        <wui-card-select-loader type="wallet" id=${D(i)}></wui-card-select-loader>
      `)}walletsTemplate(){return It.getWalletConnectWallets(this.wallets).map((e,i)=>u`
        <w3m-all-wallets-list-item
          data-testid="wallet-search-item-${e.id}"
          @click=${()=>this.onConnectWallet(e)}
          .wallet=${e}
          explorerId=${e.id}
          certified=${this.badge==="certified"}
          displayIndex=${i}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){const{wallets:e,recommended:i,featured:r,count:o,mobileFilteredOutWalletsLength:n}=j.state,s=window.innerWidth<352?3:4,a=e.length+i.length;let c=Math.ceil(a/s)*s-a+s;return c-=e.length?r.length%s:0,o===0&&r.length>0?null:o===0||[...r,...e,...i].length<o-(n!=null?n:0)?this.shimmerTemplate(c,$n):null}createPaginationObserver(){var i;const e=(i=this.shadowRoot)==null?void 0:i.querySelector(`#${$n}`);e&&(this.paginationObserver=new IntersectionObserver(([r])=>{if(r!=null&&r.isIntersecting&&!this.loading){const{page:o,count:n,wallets:s}=j.state;s.length<n&&j.fetchWalletsByPage({page:o+1})}}),this.paginationObserver.observe(e))}onConnectWallet(e){J.selectWalletConnector(e)}};me.styles=tr;Ne([P()],me.prototype,"loading",void 0);Ne([P()],me.prototype,"wallets",void 0);Ne([P()],me.prototype,"badge",void 0);Ne([P()],me.prototype,"mobileFullScreen",void 0);me=Ne([N("w3m-all-wallets-list")],me);const nr=_n`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
    height: auto;
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var Me=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let be=class extends O{constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.mobileFullScreen=q.state.enableMobileFullScreen,this.query=""}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.onSearch(),this.loading?u`<wui-loading-spinner color="accent-primary"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await j.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){const{search:e}=j.state,i=It.markWalletsAsInstalled(e),r=It.filterWalletsByWcSupport(i);return r.length?u`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","3","3","3"]}
        rowGap="4"
        columngap="2"
        justifyContent="space-between"
      >
        ${r.map((o,n)=>u`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(o)}
              .wallet=${o}
              data-testid="wallet-search-item-${o.id}"
              explorerId=${o.id}
              certified=${this.badge==="certified"}
              walletQuery=${this.query}
              displayIndex=${n}
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:u`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="3"
          flexDirection="column"
        >
          <wui-icon-box size="lg" color="default" icon="wallet"></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="secondary" variant="md-medium">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(e){J.selectWalletConnector(e)}};be.styles=nr;Me([P()],be.prototype,"loading",void 0);Me([P()],be.prototype,"mobileFullScreen",void 0);Me([f()],be.prototype,"query",void 0);Me([f()],be.prototype,"badge",void 0);be=Me([N("w3m-all-wallets-search")],be);var Mt=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let Ye=class extends O{constructor(){super(...arguments),this.search="",this.badge=void 0,this.onDebouncedSearch=M.debounce(e=>{this.search=e})}render(){const e=this.search.length>=2;return u`
      <wui-flex .padding=${["1","3","3","3"]} gap="2" alignItems="center">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge==="certified"}
          @certifiedSwitchChange=${this.onCertifiedSwitchChange.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${e||this.badge?u`<w3m-all-wallets-search
            query=${this.search}
            .badge=${this.badge}
          ></w3m-all-wallets-search>`:u`<w3m-all-wallets-list .badge=${this.badge}></w3m-all-wallets-list>`}
    `}onInputChange(e){this.onDebouncedSearch(e.detail)}onCertifiedSwitchChange(e){e.detail?(this.badge="certified",Be.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})):this.badge=void 0}qrButtonTemplate(){return M.isMobile()?u`
        <wui-icon-box
          size="xl"
          iconSize="xl"
          color="accent-primary"
          icon="qrCode"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){B.push("ConnectingWalletConnect")}};Mt([P()],Ye.prototype,"search",void 0);Mt([P()],Ye.prototype,"badge",void 0);Ye=Mt([N("w3m-all-wallets-view")],Ye);var ir=function(t,e,i,r){var o=arguments.length,n=o<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(t,e,i,r);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(n=(o<3?s(n):o>3?s(e,i,n):s(e,i))||n);return o>3&&n&&Object.defineProperty(e,i,n),n};let xn=class extends O{constructor(){var e;super(...arguments),this.wallet=(e=B.state.data)==null?void 0:e.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return u`
      <wui-flex gap="2" flexDirection="column" .padding=${["3","3","4","3"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){var e;return(e=this.wallet)!=null&&e.chrome_store?u`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){var e;return(e=this.wallet)!=null&&e.app_store?u`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){var e;return(e=this.wallet)!=null&&e.play_store?u`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){var e;return(e=this.wallet)!=null&&e.homepage?u`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="md-medium" color="primary">Website</wui-text>
      </wui-list-item>
    `:null}openStore(e){e.href&&this.wallet&&(H.sendEvent({type:"track",event:"GET_WALLET",properties:{name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.wallet.id,type:e.type}}),M.openHref(e.href,"_blank"))}onChromeStore(){var e;(e=this.wallet)!=null&&e.chrome_store&&this.openStore({href:this.wallet.chrome_store,type:"chrome_store"})}onAppStore(){var e;(e=this.wallet)!=null&&e.app_store&&this.openStore({href:this.wallet.app_store,type:"app_store"})}onPlayStore(){var e;(e=this.wallet)!=null&&e.play_store&&this.openStore({href:this.wallet.play_store,type:"play_store"})}onHomePage(){var e;(e=this.wallet)!=null&&e.homepage&&this.openStore({href:this.wallet.homepage,type:"homepage"})}};xn=ir([N("w3m-downloads-view")],xn);export{Ye as W3mAllWalletsView,He as W3mConnectingWcBasicView,xn as W3mDownloadsView};
