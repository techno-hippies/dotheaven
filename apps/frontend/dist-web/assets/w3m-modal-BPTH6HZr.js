import{N as x,u as Bt,R as f,S as E,b as j,c as $,E as V,v as je,x as Me,j as y,B as Ee,a as Q,y as Ce,z as Pe,D as Ft,o as rt,F as Kt,C as B,G as ht,I as mt,J as wt,M as L,K as zt,e as I,r as re,i as S,d as c,k as Xe,w as jt,P as Xt,L as Zt,Q as _,U as Jt,H as J,O as P,V as It,h as H,X as Ne,t as Ze,f as en,A as Fe,T as tn,Y as nn,Z as on}from"./core-DNrt4EUK.js";import{c as k,n as p,o as A,r as m,a as rn,U as Je,b as Mt}from"./index-mYP-c3GO.js";import"./index-GAgutWzb.js";import"./index-CN7-A-E-.js";const ue={getGasPriceInEther(e,t){const n=t*e;return Number(n)/1e18},getGasPriceInUSD(e,t,n){const o=ue.getGasPriceInEther(t,n);return x.bigNumber(e).times(o).toNumber()},getPriceImpact({sourceTokenAmount:e,sourceTokenPriceInUSD:t,toTokenPriceInUSD:n,toTokenAmount:o}){const r=x.bigNumber(e).times(t),i=x.bigNumber(o).times(n);return r.minus(i).div(r).times(100).toNumber()},getMaxSlippage(e,t){const n=x.bigNumber(e).div(100);return x.multiply(t,n).toNumber()},getProviderFee(e,t=.0085){return x.bigNumber(e).times(t).toString()},isInsufficientNetworkTokenForGas(e,t){const n=t||"0";return x.bigNumber(e).eq(0)?!0:x.bigNumber(x.bigNumber(n)).gt(e)},isInsufficientSourceTokenForSwap(e,t,n){var i,s;const o=(s=(i=n==null?void 0:n.find(a=>a.address===t))==null?void 0:i.quantity)==null?void 0:s.numeric;return x.bigNumber(o||"0").lt(e)}},Et=15e4,sn=6,D={initializing:!1,initialized:!1,loadingPrices:!1,loadingQuote:!1,loadingApprovalTransaction:!1,loadingBuildTransaction:!1,loadingTransaction:!1,switchingTokens:!1,fetchError:!1,approvalTransaction:void 0,swapTransaction:void 0,transactionError:void 0,sourceToken:void 0,sourceTokenAmount:"",sourceTokenPriceInUSD:0,toToken:void 0,toTokenAmount:"",toTokenPriceInUSD:0,networkPrice:"0",networkBalanceInUSD:"0",networkTokenSymbol:"",inputError:void 0,slippage:rt.CONVERT_SLIPPAGE_TOLERANCE,tokens:void 0,popularTokens:void 0,suggestedTokens:void 0,foundTokens:void 0,myTokensWithBalance:void 0,tokensPriceMap:{},gasFee:"0",gasPriceInUSD:0,priceImpact:void 0,maxSlippage:void 0,providerFee:void 0},l=wt({...D}),qe={state:l,subscribe(e){return mt(l,()=>e(l))},subscribeKey(e,t){return ht(l,e,t)},getParams(){var d,w,T,C,U,M,F,q,Se,Ie;const e=y.state.activeChain,t=(w=(d=y.getAccountData(e))==null?void 0:d.caipAddress)!=null?w:y.state.activeCaipAddress,n=Q.getPlainAddress(t),o=Kt(),r=B.getConnectorId(y.state.activeChain);if(!n)throw new Error("No address found to swap the tokens from.");const i=!((T=l.toToken)!=null&&T.address)||!((C=l.toToken)!=null&&C.decimals),s=!((U=l.sourceToken)!=null&&U.address)||!((M=l.sourceToken)!=null&&M.decimals)||!x.bigNumber(l.sourceTokenAmount).gt(0),a=!l.sourceTokenAmount;return{networkAddress:o,fromAddress:n,fromCaipAddress:t,sourceTokenAddress:(F=l.sourceToken)==null?void 0:F.address,toTokenAddress:(q=l.toToken)==null?void 0:q.address,toTokenAmount:l.toTokenAmount,toTokenDecimals:(Se=l.toToken)==null?void 0:Se.decimals,sourceTokenAmount:l.sourceTokenAmount,sourceTokenDecimals:(Ie=l.sourceToken)==null?void 0:Ie.decimals,invalidToToken:i,invalidSourceToken:s,invalidSourceTokenAmount:a,availableToSwap:t&&!i&&!s&&!a,isAuthConnector:r===$.CONNECTOR_ID.AUTH}},async setSourceToken(e){if(!e){l.sourceToken=e,l.sourceTokenAmount="",l.sourceTokenPriceInUSD=0;return}l.sourceToken=e,await g.setTokenPrice(e.address,"sourceToken")},setSourceTokenAmount(e){l.sourceTokenAmount=e},async setToToken(e){if(!e){l.toToken=e,l.toTokenAmount="",l.toTokenPriceInUSD=0;return}l.toToken=e,await g.setTokenPrice(e.address,"toToken")},setToTokenAmount(e){l.toTokenAmount=e?x.toFixed(e,sn):""},async setTokenPrice(e,t){let n=l.tokensPriceMap[e]||0;n||(l.loadingPrices=!0,n=await g.getAddressPrice(e)),t==="sourceToken"?l.sourceTokenPriceInUSD=n:t==="toToken"&&(l.toTokenPriceInUSD=n),l.loadingPrices&&(l.loadingPrices=!1),g.getParams().availableToSwap&&!l.switchingTokens&&g.swapTokens()},async switchTokens(){if(!(l.initializing||!l.initialized||l.switchingTokens)){l.switchingTokens=!0;try{const e=l.toToken?{...l.toToken}:void 0,t=l.sourceToken?{...l.sourceToken}:void 0,n=e&&l.toTokenAmount===""?"1":l.toTokenAmount;g.setSourceTokenAmount(n),g.setToTokenAmount(""),await g.setSourceToken(e),await g.setToToken(t),l.switchingTokens=!1,g.swapTokens()}catch(e){throw l.switchingTokens=!1,e}}},resetState(){l.myTokensWithBalance=D.myTokensWithBalance,l.tokensPriceMap=D.tokensPriceMap,l.initialized=D.initialized,l.initializing=D.initializing,l.switchingTokens=D.switchingTokens,l.sourceToken=D.sourceToken,l.sourceTokenAmount=D.sourceTokenAmount,l.sourceTokenPriceInUSD=D.sourceTokenPriceInUSD,l.toToken=D.toToken,l.toTokenAmount=D.toTokenAmount,l.toTokenPriceInUSD=D.toTokenPriceInUSD,l.networkPrice=D.networkPrice,l.networkTokenSymbol=D.networkTokenSymbol,l.networkBalanceInUSD=D.networkBalanceInUSD,l.inputError=D.inputError},resetValues(){var n;const{networkAddress:e}=g.getParams(),t=(n=l.tokens)==null?void 0:n.find(o=>o.address===e);g.setSourceToken(t),g.setToToken(void 0)},getApprovalLoadingState(){return l.loadingApprovalTransaction},clearError(){l.transactionError=void 0},async initializeState(){if(!l.initializing){if(l.initializing=!0,!l.initialized)try{await g.fetchTokens(),l.initialized=!0}catch{l.initialized=!1,E.showError("Failed to initialize swap"),f.goBack()}l.initializing=!1}},async fetchTokens(){var n;const{networkAddress:e}=g.getParams();await g.getNetworkTokenPrice(),await g.getMyTokensWithBalance();const t=(n=l.myTokensWithBalance)==null?void 0:n.find(o=>o.address===e);t&&(l.networkTokenSymbol=t.symbol,g.setSourceToken(t),g.setSourceTokenAmount("0"))},async getTokenList(){var t,n;const e=(t=y.state.activeCaipNetwork)==null?void 0:t.caipNetworkId;if(!(l.caipNetworkId===e&&l.tokens))try{l.tokensLoading=!0;const o=await Ce.getTokenList(e);l.tokens=o,l.caipNetworkId=e,l.popularTokens=o.sort((d,w)=>d.symbol<w.symbol?-1:d.symbol>w.symbol?1:0);const i=(e&&((n=rt.SUGGESTED_TOKENS_BY_CHAIN)==null?void 0:n[e])||[]).map(d=>o.find(w=>w.symbol===d)).filter(d=>!!d),a=(rt.SWAP_SUGGESTED_TOKENS||[]).map(d=>o.find(w=>w.symbol===d)).filter(d=>!!d).filter(d=>!i.some(w=>w.address===d.address));l.suggestedTokens=[...i,...a]}catch{l.tokens=[],l.popularTokens=[],l.suggestedTokens=[]}finally{l.tokensLoading=!1}},async getAddressPrice(e){var d,w;const t=l.tokensPriceMap[e];if(t)return t;const n=await Ee.fetchTokenPrice({addresses:[e]}),o=(n==null?void 0:n.fungibles)||[],r=[...l.tokens||[],...l.myTokensWithBalance||[]],i=(d=r==null?void 0:r.find(T=>T.address===e))==null?void 0:d.symbol,s=((w=o.find(T=>T.symbol.toLowerCase()===(i==null?void 0:i.toLowerCase())))==null?void 0:w.price)||0,a=parseFloat(s.toString());return l.tokensPriceMap[e]=a,a},async getNetworkTokenPrice(){var r;const{networkAddress:e}=g.getParams(),n=(r=(await Ee.fetchTokenPrice({addresses:[e]}).catch(()=>(E.showError("Failed to fetch network token price"),{fungibles:[]}))).fungibles)==null?void 0:r[0],o=(n==null?void 0:n.price.toString())||"0";l.tokensPriceMap[e]=parseFloat(o),l.networkTokenSymbol=(n==null?void 0:n.symbol)||"",l.networkPrice=o},async getMyTokensWithBalance(e){var o;const t=await Ft.getMyTokensWithBalance({forceUpdate:e,caipNetwork:y.state.activeCaipNetwork,address:(o=y.getAccountData())==null?void 0:o.address}),n=Ce.mapBalancesToSwapTokens(t);n&&(await g.getInitialGasPrice(),g.setBalances(n))},setBalances(e){const{networkAddress:t}=g.getParams(),n=y.state.activeCaipNetwork;if(!n)return;const o=e.find(r=>r.address===t);e.forEach(r=>{l.tokensPriceMap[r.address]=r.price||0}),l.myTokensWithBalance=e.filter(r=>r.address.startsWith(n.caipNetworkId)),l.networkBalanceInUSD=o?x.multiply(o.quantity.numeric,o.price).toString():"0"},async getInitialGasPrice(){var t,n,o,r;const e=await Ce.fetchGasPrice();if(!e)return{gasPrice:null,gasPriceInUSD:null};switch((n=(t=y.state)==null?void 0:t.activeCaipNetwork)==null?void 0:n.chainNamespace){case $.CHAIN.SOLANA:return l.gasFee=(o=e.standard)!=null?o:"0",l.gasPriceInUSD=x.multiply(e.standard,l.networkPrice).div(1e9).toNumber(),{gasPrice:BigInt(l.gasFee),gasPriceInUSD:Number(l.gasPriceInUSD)};case $.CHAIN.EVM:default:const i=(r=e.standard)!=null?r:"0",s=BigInt(i),a=BigInt(Et),d=ue.getGasPriceInUSD(l.networkPrice,a,s);return l.gasFee=i,l.gasPriceInUSD=d,{gasPrice:s,gasPriceInUSD:d}}},async swapTokens(){var i,s,a;const e=(i=y.getAccountData())==null?void 0:i.address,t=l.sourceToken,n=l.toToken,o=x.bigNumber(l.sourceTokenAmount).gt(0);if(o||g.setToTokenAmount(""),!n||!t||l.loadingPrices||!o||!e)return;l.loadingQuote=!0;const r=x.bigNumber(l.sourceTokenAmount).times(10**t.decimals).round(0).toFixed(0);try{const d=await Ee.fetchSwapQuote({userAddress:e,from:t.address,to:n.address,gasPrice:l.gasFee,amount:r.toString()});l.loadingQuote=!1;const w=(a=(s=d==null?void 0:d.quotes)==null?void 0:s[0])==null?void 0:a.toAmount;if(!w){Pe.open({displayMessage:"Incorrect amount",debugMessage:"Please enter a valid amount"},"error");return}const T=x.bigNumber(w).div(10**n.decimals).toString();g.setToTokenAmount(T),g.hasInsufficientToken(l.sourceTokenAmount,t.address)?l.inputError="Insufficient balance":(l.inputError=void 0,g.setTransactionDetails())}catch(d){const w=await Ce.handleSwapError(d);l.loadingQuote=!1,l.inputError=w||"Insufficient balance"}},async getTransaction(){const{fromCaipAddress:e,availableToSwap:t}=g.getParams(),n=l.sourceToken,o=l.toToken;if(!(!e||!t||!n||!o||l.loadingQuote))try{l.loadingBuildTransaction=!0;const r=await Ce.fetchSwapAllowance({userAddress:e,tokenAddress:n.address,sourceTokenAmount:l.sourceTokenAmount,sourceTokenDecimals:n.decimals});let i;return r?i=await g.createSwapTransaction():i=await g.createAllowanceTransaction(),l.loadingBuildTransaction=!1,l.fetchError=!1,i}catch{f.goBack(),E.showError("Failed to check allowance"),l.loadingBuildTransaction=!1,l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}},async createAllowanceTransaction(){const{fromCaipAddress:e,sourceTokenAddress:t,toTokenAddress:n}=g.getParams();if(!(!e||!n)){if(!t)throw new Error("createAllowanceTransaction - No source token address found.");try{const o=await Ee.generateApproveCalldata({from:t,to:n,userAddress:e}),r=Q.getPlainAddress(o.tx.from);if(!r)throw new Error("SwapController:createAllowanceTransaction - address is required");const i={data:o.tx.data,to:r,gasPrice:BigInt(o.tx.eip155.gasPrice),value:BigInt(o.tx.value),toAmount:l.toTokenAmount};return l.swapTransaction=void 0,l.approvalTransaction={data:i.data,to:i.to,gasPrice:i.gasPrice,value:i.value,toAmount:i.toAmount},{data:i.data,to:i.to,gasPrice:i.gasPrice,value:i.value,toAmount:i.toAmount}}catch{f.goBack(),E.showError("Failed to create approval transaction"),l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}}},async createSwapTransaction(){var s;const{networkAddress:e,fromCaipAddress:t,sourceTokenAmount:n}=g.getParams(),o=l.sourceToken,r=l.toToken;if(!t||!n||!o||!r)return;const i=(s=j.parseUnits(n,o.decimals))==null?void 0:s.toString();try{const a=await Ee.generateSwapCalldata({userAddress:t,from:o.address,to:r.address,amount:i,disableEstimate:!0}),d=o.address===e,w=BigInt(a.tx.eip155.gas),T=BigInt(a.tx.eip155.gasPrice),C=Q.getPlainAddress(a.tx.to);if(!C)throw new Error("SwapController:createSwapTransaction - address is required");const U={data:a.tx.data,to:C,gas:w,gasPrice:T,value:BigInt(d&&i!=null?i:"0"),toAmount:l.toTokenAmount};return l.gasPriceInUSD=ue.getGasPriceInUSD(l.networkPrice,w,T),l.approvalTransaction=void 0,l.swapTransaction=U,U}catch{f.goBack(),E.showError("Failed to create transaction"),l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}},onEmbeddedWalletApprovalSuccess(){E.showLoading("Approve limit increase in your wallet"),f.replace("SwapPreview")},async sendTransactionForApproval(e){var r,i,s;const{fromAddress:t,isAuthConnector:n}=g.getParams();l.loadingApprovalTransaction=!0,n?f.pushTransactionStack({onSuccess:g.onEmbeddedWalletApprovalSuccess}):E.showLoading("Approve limit increase in your wallet");try{await j.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:$.CHAIN.EVM}),await g.swapTokens(),await g.getTransaction(),l.approvalTransaction=void 0,l.loadingApprovalTransaction=!1}catch(a){const d=a;l.transactionError=d==null?void 0:d.displayMessage,l.loadingApprovalTransaction=!1,E.showError((d==null?void 0:d.displayMessage)||"Transaction error"),V.sendEvent({type:"track",event:"SWAP_APPROVAL_ERROR",properties:{message:(d==null?void 0:d.displayMessage)||(d==null?void 0:d.message)||"Unknown",network:((r=y.state.activeCaipNetwork)==null?void 0:r.caipNetworkId)||"",swapFromToken:((i=g.state.sourceToken)==null?void 0:i.symbol)||"",swapToToken:((s=g.state.toToken)==null?void 0:s.symbol)||"",swapFromAmount:g.state.sourceTokenAmount||"",swapToAmount:g.state.toTokenAmount||"",isSmartAccount:je($.CHAIN.EVM)===Me.ACCOUNT_TYPES.SMART_ACCOUNT}})}},async sendTransactionForSwap(e){var s,a,d,w,T,C,U,M,F,q,Se,Ie;if(!e)return;const{fromAddress:t,toTokenAmount:n,isAuthConnector:o}=g.getParams();l.loadingTransaction=!0;const r=`Swapping ${(s=l.sourceToken)==null?void 0:s.symbol} to ${x.formatNumberToLocalString(n,3)} ${(a=l.toToken)==null?void 0:a.symbol}`,i=`Swapped ${(d=l.sourceToken)==null?void 0:d.symbol} to ${x.formatNumberToLocalString(n,3)} ${(w=l.toToken)==null?void 0:w.symbol}`;o?f.pushTransactionStack({onSuccess(){f.replace("Account"),E.showLoading(r),qe.resetState()}}):E.showLoading("Confirm transaction in your wallet");try{const tt=[(T=l.sourceToken)==null?void 0:T.address,(C=l.toToken)==null?void 0:C.address].join(","),z=await j.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:$.CHAIN.EVM});return l.loadingTransaction=!1,E.showSuccess(i),V.sendEvent({type:"track",event:"SWAP_SUCCESS",properties:{network:((U=y.state.activeCaipNetwork)==null?void 0:U.caipNetworkId)||"",swapFromToken:((M=g.state.sourceToken)==null?void 0:M.symbol)||"",swapToToken:((F=g.state.toToken)==null?void 0:F.symbol)||"",swapFromAmount:g.state.sourceTokenAmount||"",swapToAmount:g.state.toTokenAmount||"",isSmartAccount:je($.CHAIN.EVM)===Me.ACCOUNT_TYPES.SMART_ACCOUNT}}),qe.resetState(),o||f.replace("Account"),qe.getMyTokensWithBalance(tt),z}catch(tt){const z=tt;l.transactionError=z==null?void 0:z.displayMessage,l.loadingTransaction=!1,E.showError((z==null?void 0:z.displayMessage)||"Transaction error"),V.sendEvent({type:"track",event:"SWAP_ERROR",properties:{message:(z==null?void 0:z.displayMessage)||(z==null?void 0:z.message)||"Unknown",network:((q=y.state.activeCaipNetwork)==null?void 0:q.caipNetworkId)||"",swapFromToken:((Se=g.state.sourceToken)==null?void 0:Se.symbol)||"",swapToToken:((Ie=g.state.toToken)==null?void 0:Ie.symbol)||"",swapFromAmount:g.state.sourceTokenAmount||"",swapToAmount:g.state.toTokenAmount||"",isSmartAccount:je($.CHAIN.EVM)===Me.ACCOUNT_TYPES.SMART_ACCOUNT}});return}},hasInsufficientToken(e,t){return ue.isInsufficientSourceTokenForSwap(e,t,l.myTokensWithBalance)},setTransactionDetails(){const{toTokenAddress:e,toTokenDecimals:t}=g.getParams();!e||!t||(l.gasPriceInUSD=ue.getGasPriceInUSD(l.networkPrice,BigInt(l.gasFee),BigInt(Et)),l.priceImpact=ue.getPriceImpact({sourceTokenAmount:l.sourceTokenAmount,sourceTokenPriceInUSD:l.sourceTokenPriceInUSD,toTokenPriceInUSD:l.toTokenPriceInUSD,toTokenAmount:l.toTokenAmount}),l.maxSlippage=ue.getMaxSlippage(l.slippage,l.toTokenAmount),l.providerFee=ue.getProviderFee(l.sourceTokenAmount))}},g=Bt(qe),Z=wt({message:"",open:!1,triggerRect:{width:0,height:0,top:0,left:0},variant:"shade"}),an={state:Z,subscribe(e){return mt(Z,()=>e(Z))},subscribeKey(e,t){return ht(Z,e,t)},showTooltip({message:e,triggerRect:t,variant:n}){Z.open=!0,Z.message=e,Z.triggerRect=t,Z.variant=n},hide(){Z.open=!1,Z.message="",Z.triggerRect={width:0,height:0,top:0,left:0}}},Y=Bt(an),qt={isUnsupportedChainView(){return f.state.view==="UnsupportedChain"||f.state.view==="SwitchNetwork"&&f.state.history.includes("UnsupportedChain")},async safeClose(){if(this.isUnsupportedChainView()){L.shake();return}if(await zt.isSIWXCloseDisabled()){L.shake();return}(f.state.view==="DataCapture"||f.state.view==="DataCaptureOtpConfirm")&&j.disconnect(),L.close()}},Ct={interpolate(e,t,n){if(e.length!==2||t.length!==2)throw new Error("inputRange and outputRange must be an array of length 2");const o=e[0]||0,r=e[1]||0,i=t[0]||0,s=t[1]||0;return n<o?i:n>r?s:(s-i)/(r-o)*(n-o)+i}},cn=I`
  :host {
    display: block;
    border-radius: clamp(0px, ${({borderRadius:e})=>e[8]}, 44px);
    box-shadow: 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    overflow: hidden;
  }
`;var ln=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let st=class extends S{render(){return c`<slot></slot>`}};st.styles=[re,cn];st=ln([k("wui-card")],st);const un=I`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[6]};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: 0px 0px 16px 0px rgba(0, 0, 0, 0.25);
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  :host > wui-flex[data-type='info'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};

      wui-icon {
        color: ${({tokens:e})=>e.theme.iconDefault};
      }
    }
  }
  :host > wui-flex[data-type='success'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderSuccess};
      }
    }
  }
  :host > wui-flex[data-type='warning'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundWarning};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderWarning};
      }
    }
  }
  :host > wui-flex[data-type='error'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundError};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderError};
      }
    }
  }

  wui-flex {
    width: 100%;
  }

  wui-text {
    word-break: break-word;
    flex: 1;
  }

  .close {
    cursor: pointer;
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  .icon-box {
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e[2]};
    background-color: var(--local-icon-bg-value);
  }
`;var ft=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const dn={info:"info",success:"checkmark",warning:"warningCircle",error:"warning"};let _e=class extends S{constructor(){super(...arguments),this.message="",this.type="info"}render(){return c`
      <wui-flex
        data-type=${A(this.type)}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="2"
      >
        <wui-flex columnGap="2" flexDirection="row" alignItems="center">
          <wui-flex
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            class="icon-box"
          >
            <wui-icon color="inherit" size="md" name=${dn[this.type]}></wui-icon>
          </wui-flex>
          <wui-text variant="md-medium" color="inherit" data-testid="wui-alertbar-text"
            >${this.message}</wui-text
          >
        </wui-flex>
        <wui-icon
          class="close"
          color="inherit"
          size="sm"
          name="close"
          @click=${this.onClose}
        ></wui-icon>
      </wui-flex>
    `}onClose(){Pe.close()}};_e.styles=[re,un];ft([p()],_e.prototype,"message",void 0);ft([p()],_e.prototype,"type",void 0);_e=ft([k("wui-alertbar")],_e);const pn=I`
  :host {
    display: block;
    position: absolute;
    top: ${({spacing:e})=>e[3]};
    left: ${({spacing:e})=>e[4]};
    right: ${({spacing:e})=>e[4]};
    opacity: 0;
    pointer-events: none;
  }
`;var Vt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const hn={info:{backgroundColor:"fg-350",iconColor:"fg-325",icon:"info"},success:{backgroundColor:"success-glass-reown-020",iconColor:"success-125",icon:"checkmark"},warning:{backgroundColor:"warning-glass-reown-020",iconColor:"warning-100",icon:"warningCircle"},error:{backgroundColor:"error-glass-reown-020",iconColor:"error-125",icon:"warning"}};let Ve=class extends S{constructor(){super(),this.unsubscribe=[],this.open=Pe.state.open,this.onOpen(!0),this.unsubscribe.push(Pe.subscribeKey("open",t=>{this.open=t,this.onOpen(!1)}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const{message:t,variant:n}=Pe.state,o=hn[n];return c`
      <wui-alertbar
        message=${t}
        backgroundColor=${o==null?void 0:o.backgroundColor}
        iconColor=${o==null?void 0:o.iconColor}
        icon=${o==null?void 0:o.icon}
        type=${n}
      ></wui-alertbar>
    `}onOpen(t){this.open?(this.animate([{opacity:0,transform:"scale(0.85)"},{opacity:1,transform:"scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: auto"):t||(this.animate([{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: none")}};Ve.styles=pn;Vt([m()],Ve.prototype,"open",void 0);Ve=Vt([k("w3m-alertbar")],Ve);const mn=I`
  :host {
    position: relative;
  }

  button {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  /* -- Colors --------------------------------------------------- */
  button[data-type='accent'] wui-icon {
    color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  button[data-type='neutral'][data-variant='primary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconInverse};
  }

  button[data-type='neutral'][data-variant='secondary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button[data-type='success'] wui-icon {
    color: ${({tokens:e})=>e.core.iconSuccess};
  }

  button[data-type='error'] wui-icon {
    color: ${({tokens:e})=>e.core.iconError};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='xs'] {
    width: 16px;
    height: 16px;

    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='sm'] {
    width: 20px;
    height: 20px;
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'] {
    width: 24px;
    height: 24px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='lg'] {
    width: 28px;
    height: 28px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='xs'] wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='md'] wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] wui-icon {
    width: 20px;
    height: 20px;
  }

  /* -- Hover --------------------------------------------------- */
  @media (hover: hover) {
    button[data-type='accent']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    }

    button[data-variant='primary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-variant='secondary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-type='success']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};
    }

    button[data-type='error']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundError};
    }
  }

  /* -- Focus --------------------------------------------------- */
  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  /* -- Properties --------------------------------------------------- */
  button[data-full-width='true'] {
    width: 100%;
  }

  :host([fullWidth]) {
    width: 100%;
  }

  button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var we=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let ne=class extends S{constructor(){super(...arguments),this.icon="card",this.variant="primary",this.type="accent",this.size="md",this.iconSize=void 0,this.fullWidth=!1,this.disabled=!1}render(){return c`<button
      data-variant=${this.variant}
      data-type=${this.type}
      data-size=${this.size}
      data-full-width=${this.fullWidth}
      ?disabled=${this.disabled}
    >
      <wui-icon color="inherit" name=${this.icon} size=${A(this.iconSize)}></wui-icon>
    </button>`}};ne.styles=[re,Xe,mn];we([p()],ne.prototype,"icon",void 0);we([p()],ne.prototype,"variant",void 0);we([p()],ne.prototype,"type",void 0);we([p()],ne.prototype,"size",void 0);we([p()],ne.prototype,"iconSize",void 0);we([p({type:Boolean})],ne.prototype,"fullWidth",void 0);we([p({type:Boolean})],ne.prototype,"disabled",void 0);ne=we([k("wui-icon-button")],ne);const wn=I`
  button {
    display: block;
    display: flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
    border-radius: ${({borderRadius:e})=>e[32]};
  }

  wui-image {
    border-radius: 100%;
  }

  wui-text {
    padding-left: ${({spacing:e})=>e[1]};
  }

  .left-icon-container,
  .right-icon-container {
    width: 24px;
    height: 24px;
    justify-content: center;
    align-items: center;
  }

  wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='lg'] {
    height: 32px;
  }

  button[data-size='md'] {
    height: 28px;
  }

  button[data-size='sm'] {
    height: 24px;
  }

  button[data-size='lg'] wui-image {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] wui-image {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] wui-image {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] .left-icon-container {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] .left-icon-container {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] .left-icon-container {
    width: 16px;
    height: 16px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-type='filled-dropdown'] {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  button[data-type='text-dropdown'] {
    background-color: transparent;
  }

  /* -- Focus states --------------------------------------------------- */
  button:focus-visible:enabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  /* -- Disabled states --------------------------------------------------- */
  button:disabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    opacity: 0.5;
  }
`;var ke=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const fn={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},gn={lg:"lg",md:"md",sm:"sm"};let pe=class extends S{constructor(){super(...arguments),this.imageSrc="",this.text="",this.size="lg",this.type="text-dropdown",this.disabled=!1}render(){return c`<button ?disabled=${this.disabled} data-size=${this.size} data-type=${this.type}>
      ${this.imageTemplate()} ${this.textTemplate()}
      <wui-flex class="right-icon-container">
        <wui-icon name="chevronBottom"></wui-icon>
      </wui-flex>
    </button>`}textTemplate(){const t=fn[this.size];return this.text?c`<wui-text color="primary" variant=${t}>${this.text}</wui-text>`:null}imageTemplate(){if(this.imageSrc)return c`<wui-image src=${this.imageSrc} alt="select visual"></wui-image>`;const t=gn[this.size];return c` <wui-flex class="left-icon-container">
      <wui-icon size=${t} name="networkPlaceholder"></wui-icon>
    </wui-flex>`}};pe.styles=[re,Xe,wn];ke([p()],pe.prototype,"imageSrc",void 0);ke([p()],pe.prototype,"text",void 0);ke([p()],pe.prototype,"size",void 0);ke([p()],pe.prototype,"type",void 0);ke([p({type:Boolean})],pe.prototype,"disabled",void 0);pe=ke([k("wui-select")],pe);const ye={ACCOUNT_TABS:[{label:"Tokens"},{label:"Activity"}],VIEW_DIRECTION:{Next:"next",Prev:"prev"},ANIMATION_DURATIONS:{HeaderText:120},VIEWS_WITH_LEGAL_FOOTER:["Connect","ConnectWallets","OnRampTokenSelect","OnRampFiatSelect","OnRampProviders"],VIEWS_WITH_DEFAULT_FOOTER:["Networks"]},yn=I`
  button {
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  button[data-variant='accent']:hover:enabled,
  button[data-variant='accent']:focus-visible {
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
  }

  button[data-variant='primary']:hover:enabled,
  button[data-variant='primary']:focus-visible,
  button[data-variant='secondary']:hover:enabled,
  button[data-variant='secondary']:focus-visible {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  button[data-size='xs'] > wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] > wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='xs'],
  button[data-size='sm'] {
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'],
  button[data-size='lg'] {
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='md'] > wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] > wui-icon {
    width: 20px;
    height: 20px;
  }

  button:disabled {
    background-color: transparent;
    cursor: not-allowed;
    opacity: 0.5;
  }

  button:hover:not(:disabled) {
    background-color: var(--wui-color-accent-glass-015);
  }

  button:focus-visible:not(:disabled) {
    background-color: var(--wui-color-accent-glass-015);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0 0 0 4px var(--wui-color-accent-glass-020);
  }
`;var Te=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let he=class extends S{constructor(){super(...arguments),this.size="md",this.disabled=!1,this.icon="copy",this.iconColor="default",this.variant="accent"}render(){const t={accent:"accent-primary",primary:"inverse",secondary:"default"};return c`
      <button data-variant=${this.variant} ?disabled=${this.disabled} data-size=${this.size}>
        <wui-icon
          color=${t[this.variant]||this.iconColor}
          size=${this.size}
          name=${this.icon}
        ></wui-icon>
      </button>
    `}};he.styles=[re,Xe,yn];Te([p()],he.prototype,"size",void 0);Te([p({type:Boolean})],he.prototype,"disabled",void 0);Te([p()],he.prototype,"icon",void 0);Te([p()],he.prototype,"iconColor",void 0);Te([p()],he.prototype,"variant",void 0);he=Te([k("wui-icon-link")],he);const bn=jt`<svg width="86" height="96" fill="none">
  <path
    d="M78.3244 18.926L50.1808 2.45078C45.7376 -0.150261 40.2624 -0.150262 35.8192 2.45078L7.6756 18.926C3.23322 21.5266 0.5 26.3301 0.5 31.5248V64.4752C0.5 69.6699 3.23322 74.4734 7.6756 77.074L35.8192 93.5492C40.2624 96.1503 45.7376 96.1503 50.1808 93.5492L78.3244 77.074C82.7668 74.4734 85.5 69.6699 85.5 64.4752V31.5248C85.5 26.3301 82.7668 21.5266 78.3244 18.926Z"
  />
</svg>`,vn=jt`
  <svg fill="none" viewBox="0 0 36 40">
    <path
      d="M15.4 2.1a5.21 5.21 0 0 1 5.2 0l11.61 6.7a5.21 5.21 0 0 1 2.61 4.52v13.4c0 1.87-1 3.59-2.6 4.52l-11.61 6.7c-1.62.93-3.6.93-5.22 0l-11.6-6.7a5.21 5.21 0 0 1-2.61-4.51v-13.4c0-1.87 1-3.6 2.6-4.52L15.4 2.1Z"
    />
  </svg>
`,xn=I`
  :host {
    position: relative;
    border-radius: inherit;
    display: flex;
    justify-content: center;
    align-items: center;
    width: var(--local-width);
    height: var(--local-height);
  }

  :host([data-round='true']) {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: 100%;
    outline: 1px solid ${({tokens:e})=>e.core.glass010};
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  svg > path {
    stroke: var(--local-stroke);
  }

  wui-image {
    width: 100%;
    height: 100%;
    -webkit-clip-path: var(--local-path);
    clip-path: var(--local-path);
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon {
    transform: translateY(-5%);
    width: var(--local-icon-size);
    height: var(--local-icon-size);
  }
`;var ve=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let le=class extends S{constructor(){super(...arguments),this.size="md",this.name="uknown",this.networkImagesBySize={sm:vn,md:rn,lg:bn},this.selected=!1,this.round=!1}render(){const t={sm:"4",md:"6",lg:"10"};return this.round?(this.dataset.round="true",this.style.cssText=`
      --local-width: var(--apkt-spacing-10);
      --local-height: var(--apkt-spacing-10);
      --local-icon-size: var(--apkt-spacing-4);
    `):this.style.cssText=`

      --local-path: var(--apkt-path-network-${this.size});
      --local-width:  var(--apkt-width-network-${this.size});
      --local-height:  var(--apkt-height-network-${this.size});
      --local-icon-size:  var(--apkt-spacing-${t[this.size]});
    `,c`${this.templateVisual()} ${this.svgTemplate()} `}svgTemplate(){return this.round?null:this.networkImagesBySize[this.size]}templateVisual(){return this.imageSrc?c`<wui-image src=${this.imageSrc} alt=${this.name}></wui-image>`:c`<wui-icon size="inherit" color="default" name="networkPlaceholder"></wui-icon>`}};le.styles=[re,xn];ve([p()],le.prototype,"size",void 0);ve([p()],le.prototype,"name",void 0);ve([p({type:Object})],le.prototype,"networkImagesBySize",void 0);ve([p()],le.prototype,"imageSrc",void 0);ve([p({type:Boolean})],le.prototype,"selected",void 0);ve([p({type:Boolean})],le.prototype,"round",void 0);le=ve([k("wui-network-image")],le);const kn=I`
  :host {
    position: relative;
    display: flex;
    width: 100%;
    height: 1px;
    background-color: ${({tokens:e})=>e.theme.borderPrimary};
    justify-content: center;
    align-items: center;
  }

  :host > wui-text {
    position: absolute;
    padding: 0px 8px;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  :host([data-bg-color='primary']) > wui-text {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  :host([data-bg-color='secondary']) > wui-text {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }
`;var gt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Oe=class extends S{constructor(){super(...arguments),this.text="",this.bgColor="primary"}render(){return this.dataset.bgColor=this.bgColor,c`${this.template()}`}template(){return this.text?c`<wui-text variant="md-regular" color="secondary">${this.text}</wui-text>`:null}};Oe.styles=[re,kn];gt([p()],Oe.prototype,"text",void 0);gt([p()],Oe.prototype,"bgColor",void 0);Oe=gt([k("wui-separator")],Oe);const b={INVALID_PAYMENT_CONFIG:"INVALID_PAYMENT_CONFIG",INVALID_RECIPIENT:"INVALID_RECIPIENT",INVALID_ASSET:"INVALID_ASSET",INVALID_AMOUNT:"INVALID_AMOUNT",UNKNOWN_ERROR:"UNKNOWN_ERROR",UNABLE_TO_INITIATE_PAYMENT:"UNABLE_TO_INITIATE_PAYMENT",INVALID_CHAIN_NAMESPACE:"INVALID_CHAIN_NAMESPACE",GENERIC_PAYMENT_ERROR:"GENERIC_PAYMENT_ERROR",UNABLE_TO_GET_EXCHANGES:"UNABLE_TO_GET_EXCHANGES",ASSET_NOT_SUPPORTED:"ASSET_NOT_SUPPORTED",UNABLE_TO_GET_PAY_URL:"UNABLE_TO_GET_PAY_URL",UNABLE_TO_GET_BUY_STATUS:"UNABLE_TO_GET_BUY_STATUS",UNABLE_TO_GET_TOKEN_BALANCES:"UNABLE_TO_GET_TOKEN_BALANCES",UNABLE_TO_GET_QUOTE:"UNABLE_TO_GET_QUOTE",UNABLE_TO_GET_QUOTE_STATUS:"UNABLE_TO_GET_QUOTE_STATUS",INVALID_RECIPIENT_ADDRESS_FOR_ASSET:"INVALID_RECIPIENT_ADDRESS_FOR_ASSET"},de={[b.INVALID_PAYMENT_CONFIG]:"Invalid payment configuration",[b.INVALID_RECIPIENT]:"Invalid recipient address",[b.INVALID_ASSET]:"Invalid asset specified",[b.INVALID_AMOUNT]:"Invalid payment amount",[b.INVALID_RECIPIENT_ADDRESS_FOR_ASSET]:"Invalid recipient address for the asset selected",[b.UNKNOWN_ERROR]:"Unknown payment error occurred",[b.UNABLE_TO_INITIATE_PAYMENT]:"Unable to initiate payment",[b.INVALID_CHAIN_NAMESPACE]:"Invalid chain namespace",[b.GENERIC_PAYMENT_ERROR]:"Unable to process payment",[b.UNABLE_TO_GET_EXCHANGES]:"Unable to get exchanges",[b.ASSET_NOT_SUPPORTED]:"Asset not supported by the selected exchange",[b.UNABLE_TO_GET_PAY_URL]:"Unable to get payment URL",[b.UNABLE_TO_GET_BUY_STATUS]:"Unable to get buy status",[b.UNABLE_TO_GET_TOKEN_BALANCES]:"Unable to get token balances",[b.UNABLE_TO_GET_QUOTE]:"Unable to get quote. Please choose a different token",[b.UNABLE_TO_GET_QUOTE_STATUS]:"Unable to get quote status"};class v extends Error{get message(){return de[this.code]}constructor(t,n){super(de[t]),this.name="AppKitPayError",this.code=t,this.details=n,Error.captureStackTrace&&Error.captureStackTrace(this,v)}}const Tn="https://rpc.walletconnect.org/v1/json-rpc",Pt="reown_test";function An(){const{chainNamespace:e}=_.parseCaipNetworkId(h.state.paymentAsset.network);if(!Q.isAddress(h.state.recipient,e))throw new v(b.INVALID_RECIPIENT_ADDRESS_FOR_ASSET,`Provide valid recipient address for namespace "${e}"`)}async function Sn(e,t,n){var a,d;if(t!==$.CHAIN.EVM)throw new v(b.INVALID_CHAIN_NAMESPACE);if(!n.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for native EVM payments.");const o=typeof n.amount=="string"?parseFloat(n.amount):n.amount;if(isNaN(o))throw new v(b.INVALID_PAYMENT_CONFIG);const r=(d=(a=e.metadata)==null?void 0:a.decimals)!=null?d:18,i=j.parseUnits(o.toString(),r);if(typeof i!="bigint")throw new v(b.GENERIC_PAYMENT_ERROR);const s=await j.sendTransaction({chainNamespace:t,to:n.recipient,address:n.fromAddress,value:i,data:"0x"});return s!=null?s:void 0}async function In(e,t){if(!t.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for ERC20 EVM payments.");const n=e.asset,o=t.recipient,r=Number(e.metadata.decimals),i=j.parseUnits(t.amount.toString(),r);if(i===void 0)throw new v(b.GENERIC_PAYMENT_ERROR);const s=await j.writeContract({fromAddress:t.fromAddress,tokenAddress:n,args:[o,i],method:"transfer",abi:Zt.getERC20Abi(n),chainNamespace:$.CHAIN.EVM});return s!=null?s:void 0}async function En(e,t){if(e!==$.CHAIN.SOLANA)throw new v(b.INVALID_CHAIN_NAMESPACE);if(!t.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for Solana payments.");const n=typeof t.amount=="string"?parseFloat(t.amount):t.amount;if(isNaN(n)||n<=0)throw new v(b.INVALID_PAYMENT_CONFIG,"Invalid payment amount.");try{if(!Xt.getProvider(e))throw new v(b.GENERIC_PAYMENT_ERROR,"No Solana provider available.");const r=await j.sendTransaction({chainNamespace:$.CHAIN.SOLANA,to:t.recipient,value:n,tokenMint:t.tokenMint});if(!r)throw new v(b.GENERIC_PAYMENT_ERROR,"Transaction failed.");return r}catch(o){throw o instanceof v?o:new v(b.GENERIC_PAYMENT_ERROR,`Solana payment failed: ${o}`)}}async function Cn({sourceToken:e,toToken:t,amount:n,recipient:o}){var s,a,d;const r=j.parseUnits(n,e.metadata.decimals),i=j.parseUnits(n,t.metadata.decimals);return Promise.resolve({type:ct,origin:{amount:(s=r==null?void 0:r.toString())!=null?s:"0",currency:e},destination:{amount:(a=i==null?void 0:i.toString())!=null?a:"0",currency:t},fees:[{id:"service",label:"Service Fee",amount:"0",currency:t}],steps:[{requestId:ct,type:"deposit",deposit:{amount:(d=r==null?void 0:r.toString())!=null?d:"0",currency:e.asset,receiver:o}}],timeInSeconds:6})}function at(e){if(!e)return null;const t=e.steps[0];return!t||t.type!==jn?null:t}function nt(e,t=0){if(!e)return[];const n=e.steps.filter(r=>r.type===Mn),o=n.filter((r,i)=>i+1>t);return n.length>0&&n.length<3?o:[]}const yt=new Jt({baseUrl:Q.getApiUrl(),clientId:null});class Pn extends Error{}function $n(){const e=P.getSnapshot().projectId;return`${Tn}?projectId=${e}`}function bt(){const{projectId:e,sdkType:t,sdkVersion:n}=P.state;return{projectId:e,st:t||"appkit",sv:n||"html-wagmi-4.2.2"}}async function vt(e,t){const n=$n(),{sdkType:o,sdkVersion:r,projectId:i}=P.getSnapshot(),s={jsonrpc:"2.0",id:1,method:e,params:{...t||{},st:o,sv:r,projectId:i}},d=await(await fetch(n,{method:"POST",body:JSON.stringify(s),headers:{"Content-Type":"application/json"}})).json();if(d.error)throw new Pn(d.error.message);return d}async function $t(e){return(await vt("reown_getExchanges",e)).result}async function Nt(e){return(await vt("reown_getExchangePayUrl",e)).result}async function Nn(e){return(await vt("reown_getExchangeBuyStatus",e)).result}async function _n(e){const t=x.bigNumber(e.amount).times(10**e.toToken.metadata.decimals).toString(),{chainId:n,chainNamespace:o}=_.parseCaipNetworkId(e.sourceToken.network),{chainId:r,chainNamespace:i}=_.parseCaipNetworkId(e.toToken.network),s=e.sourceToken.asset==="native"?It(o):e.sourceToken.asset,a=e.toToken.asset==="native"?It(i):e.toToken.asset;return await yt.post({path:"/appkit/v1/transfers/quote",body:{user:e.address,originChainId:n.toString(),originCurrency:s,destinationChainId:r.toString(),destinationCurrency:a,recipient:e.recipient,amount:t},params:bt()})}async function On(e){const t=J.isLowerCaseMatch(e.sourceToken.network,e.toToken.network),n=J.isLowerCaseMatch(e.sourceToken.asset,e.toToken.asset);return t&&n?Cn(e):_n(e)}async function Rn(e){return await yt.get({path:"/appkit/v1/transfers/status",params:{requestId:e.requestId,...bt()}})}async function Un(e){return await yt.get({path:`/appkit/v1/transfers/assets/exchanges/${e}`,params:bt()})}const Wn=["eip155","solana"],Dn={eip155:{native:{assetNamespace:"slip44",assetReference:"60"},defaultTokenNamespace:"erc20"},solana:{native:{assetNamespace:"slip44",assetReference:"501"},defaultTokenNamespace:"token"}};function it(e,t){const{chainNamespace:n,chainId:o}=_.parseCaipNetworkId(e),r=Dn[n];if(!r)throw new Error(`Unsupported chain namespace for CAIP-19 formatting: ${n}`);let i=r.native.assetNamespace,s=r.native.assetReference;return t!=="native"&&(i=r.defaultTokenNamespace,s=t),`${`${n}:${o}`}/${i}:${s}`}function Ln(e){const{chainNamespace:t}=_.parseCaipNetworkId(e);return Wn.includes(t)}function Bn(e){const n=y.getAllRequestedCaipNetworks().find(r=>r.caipNetworkId===e.chainId);let o=e.address;if(!n)throw new Error(`Target network not found for balance chainId "${e.chainId}"`);if(J.isLowerCaseMatch(e.symbol,n.nativeCurrency.symbol))o="native";else if(Q.isCaipAddress(o)){const{address:r}=_.parseCaipAddress(o);o=r}else if(!o)throw new Error(`Balance address not found for balance symbol "${e.symbol}"`);return{network:n.caipNetworkId,asset:o,metadata:{name:e.name,symbol:e.symbol,decimals:Number(e.quantity.decimals),logoURI:e.iconUrl},amount:e.quantity.numeric}}function Fn(e){return{chainId:e.network,address:`${e.network}:${e.asset}`,symbol:e.metadata.symbol,name:e.metadata.name,iconUrl:e.metadata.logoURI||"",price:0,quantity:{numeric:"0",decimals:e.metadata.decimals.toString()}}}function He(e){const t=x.bigNumber(e,{safe:!0});return t.lt(.001)?"<0.001":t.round(4).toString()}function zn(e){const n=y.getAllRequestedCaipNetworks().find(o=>o.caipNetworkId===e.network);return n?!!n.testnet:!1}const _t=0,ot="unknown",ct="direct-transfer",jn="deposit",Mn="transaction",u=wt({paymentAsset:{network:"eip155:1",asset:"0x0",metadata:{name:"0x0",symbol:"0x0",decimals:0}},recipient:"0x0",amount:0,isConfigured:!1,error:null,isPaymentInProgress:!1,exchanges:[],isLoading:!1,openInNewTab:!0,redirectUrl:void 0,payWithExchange:void 0,currentPayment:void 0,analyticsSet:!1,paymentId:void 0,choice:"pay",tokenBalances:{[$.CHAIN.EVM]:[],[$.CHAIN.SOLANA]:[]},isFetchingTokenBalances:!1,selectedPaymentAsset:null,quote:void 0,quoteStatus:"waiting",quoteError:null,isFetchingQuote:!1,selectedExchange:void 0,exchangeUrlForQuote:void 0,requestId:void 0}),h={state:u,subscribe(e){return mt(u,()=>e(u))},subscribeKey(e,t){return ht(u,e,t)},async handleOpenPay(e){this.resetState(),this.setPaymentConfig(e),this.initializeAnalytics(),An(),await this.prepareTokenLogo(),u.isConfigured=!0,V.sendEvent({type:"track",event:"PAY_MODAL_OPEN",properties:{exchanges:u.exchanges,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount}}}),await L.open({view:"Pay"})},resetState(){u.paymentAsset={network:"eip155:1",asset:"0x0",metadata:{name:"0x0",symbol:"0x0",decimals:0}},u.recipient="0x0",u.amount=0,u.isConfigured=!1,u.error=null,u.isPaymentInProgress=!1,u.isLoading=!1,u.currentPayment=void 0,u.selectedExchange=void 0,u.exchangeUrlForQuote=void 0,u.requestId=void 0},resetQuoteState(){u.quote=void 0,u.quoteStatus="waiting",u.quoteError=null,u.isFetchingQuote=!1,u.requestId=void 0},setPaymentConfig(e){var t,n;if(!e.paymentAsset)throw new v(b.INVALID_PAYMENT_CONFIG);try{u.choice=(t=e.choice)!=null?t:"pay",u.paymentAsset=e.paymentAsset,u.recipient=e.recipient,u.amount=e.amount,u.openInNewTab=(n=e.openInNewTab)!=null?n:!0,u.redirectUrl=e.redirectUrl,u.payWithExchange=e.payWithExchange,u.error=null}catch(o){throw new v(b.INVALID_PAYMENT_CONFIG,o.message)}},setSelectedPaymentAsset(e){u.selectedPaymentAsset=e},setSelectedExchange(e){u.selectedExchange=e},setRequestId(e){u.requestId=e},setPaymentInProgress(e){u.isPaymentInProgress=e},getPaymentAsset(){return u.paymentAsset},getExchanges(){return u.exchanges},async fetchExchanges(){try{u.isLoading=!0;const e=await $t({page:_t});u.exchanges=e.exchanges.slice(0,2)}catch{throw E.showError(de.UNABLE_TO_GET_EXCHANGES),new v(b.UNABLE_TO_GET_EXCHANGES)}finally{u.isLoading=!1}},async getAvailableExchanges(e){var t,n;try{const o=e!=null&&e.asset&&(e!=null&&e.network)?it(e.network,e.asset):void 0;return await $t({page:(t=e==null?void 0:e.page)!=null?t:_t,asset:o,amount:(n=e==null?void 0:e.amount)==null?void 0:n.toString()})}catch{throw new v(b.UNABLE_TO_GET_EXCHANGES)}},async getPayUrl(e,t,n=!1){try{const o=Number(t.amount),r=await Nt({exchangeId:e,asset:it(t.network,t.asset),amount:o.toString(),recipient:`${t.network}:${t.recipient}`});return V.sendEvent({type:"track",event:"PAY_EXCHANGE_SELECTED",properties:{source:"pay",exchange:{id:e},configuration:{network:t.network,asset:t.asset,recipient:t.recipient,amount:o},currentPayment:{type:"exchange",exchangeId:e},headless:n}}),n&&(this.initiatePayment(),V.sendEvent({type:"track",event:"PAY_INITIATED",properties:{source:"pay",paymentId:u.paymentId||ot,configuration:{network:t.network,asset:t.asset,recipient:t.recipient,amount:o},currentPayment:{type:"exchange",exchangeId:e}}})),r}catch(o){throw o instanceof Error&&o.message.includes("is not supported")?new v(b.ASSET_NOT_SUPPORTED):new Error(o.message)}},async generateExchangeUrlForQuote({exchangeId:e,paymentAsset:t,amount:n,recipient:o}){const r=await Nt({exchangeId:e,asset:it(t.network,t.asset),amount:n.toString(),recipient:o});u.exchangeSessionId=r.sessionId,u.exchangeUrlForQuote=r.url},async openPayUrl(e,t,n=!1){var o;try{const r=await this.getPayUrl(e.exchangeId,t,n);if(!r)throw new v(b.UNABLE_TO_GET_PAY_URL);const s=((o=e.openInNewTab)!=null?o:!0)?"_blank":"_self";return Q.openHref(r.url,s),r}catch(r){throw r instanceof v?u.error=r.message:u.error=de.GENERIC_PAYMENT_ERROR,new v(b.UNABLE_TO_GET_PAY_URL)}},async onTransfer({chainNamespace:e,fromAddress:t,toAddress:n,amount:o,paymentAsset:r}){if(u.currentPayment={type:"wallet",status:"IN_PROGRESS"},!u.isPaymentInProgress)try{this.initiatePayment();const s=y.getAllRequestedCaipNetworks().find(d=>d.caipNetworkId===r.network);if(!s)throw new Error("Target network not found");const a=y.state.activeCaipNetwork;switch(J.isLowerCaseMatch(a==null?void 0:a.caipNetworkId,s.caipNetworkId)||await y.switchActiveNetwork(s),e){case $.CHAIN.EVM:r.asset==="native"&&(u.currentPayment.result=await Sn(r,e,{recipient:n,amount:o,fromAddress:t})),r.asset.startsWith("0x")&&(u.currentPayment.result=await In(r,{recipient:n,amount:o,fromAddress:t})),u.currentPayment.status="SUCCESS";break;case $.CHAIN.SOLANA:u.currentPayment.result=await En(e,{recipient:n,amount:o,fromAddress:t,tokenMint:r.asset==="native"?void 0:r.asset}),u.currentPayment.status="SUCCESS";break;default:throw new v(b.INVALID_CHAIN_NAMESPACE)}}catch(i){throw i instanceof v?u.error=i.message:u.error=de.GENERIC_PAYMENT_ERROR,u.currentPayment.status="FAILED",E.showError(u.error),i}finally{u.isPaymentInProgress=!1}},async onSendTransaction(e){try{const{namespace:t,transactionStep:n}=e;h.initiatePayment();const r=y.getAllRequestedCaipNetworks().find(s=>{var a;return s.caipNetworkId===((a=u.paymentAsset)==null?void 0:a.network)});if(!r)throw new Error("Target network not found");const i=y.state.activeCaipNetwork;if(J.isLowerCaseMatch(i==null?void 0:i.caipNetworkId,r.caipNetworkId)||await y.switchActiveNetwork(r),t===$.CHAIN.EVM){const{from:s,to:a,data:d,value:w}=n.transaction;await j.sendTransaction({address:s,to:a,data:d,value:BigInt(w),chainNamespace:t})}else if(t===$.CHAIN.SOLANA){const{instructions:s}=n.transaction;await j.writeSolanaTransaction({instructions:s})}}catch(t){throw t instanceof v?u.error=t.message:u.error=de.GENERIC_PAYMENT_ERROR,E.showError(u.error),t}finally{u.isPaymentInProgress=!1}},getExchangeById(e){return u.exchanges.find(t=>t.id===e)},validatePayConfig(e){const{paymentAsset:t,recipient:n,amount:o}=e;if(!t)throw new v(b.INVALID_PAYMENT_CONFIG);if(!n)throw new v(b.INVALID_RECIPIENT);if(!t.asset)throw new v(b.INVALID_ASSET);if(o==null||o<=0)throw new v(b.INVALID_AMOUNT)},async handlePayWithExchange(e){try{u.currentPayment={type:"exchange",exchangeId:e};const{network:t,asset:n}=u.paymentAsset,o={network:t,asset:n,amount:u.amount,recipient:u.recipient},r=await this.getPayUrl(e,o);if(!r)throw new v(b.UNABLE_TO_INITIATE_PAYMENT);return u.currentPayment.sessionId=r.sessionId,u.currentPayment.status="IN_PROGRESS",u.currentPayment.exchangeId=e,this.initiatePayment(),{url:r.url,openInNewTab:u.openInNewTab}}catch(t){return t instanceof v?u.error=t.message:u.error=de.GENERIC_PAYMENT_ERROR,u.isPaymentInProgress=!1,E.showError(u.error),null}},async getBuyStatus(e,t){var n,o;try{const r=await Nn({sessionId:t,exchangeId:e});return(r.status==="SUCCESS"||r.status==="FAILED")&&V.sendEvent({type:"track",event:r.status==="SUCCESS"?"PAY_SUCCESS":"PAY_ERROR",properties:{message:r.status==="FAILED"?Q.parseError(u.error):void 0,source:"pay",paymentId:u.paymentId||ot,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount},currentPayment:{type:"exchange",exchangeId:(n=u.currentPayment)==null?void 0:n.exchangeId,sessionId:(o=u.currentPayment)==null?void 0:o.sessionId,result:r.txHash}}}),r}catch{throw new v(b.UNABLE_TO_GET_BUY_STATUS)}},async fetchTokensFromEOA({caipAddress:e,caipNetwork:t,namespace:n}){if(!e)return[];const{address:o}=_.parseCaipAddress(e);let r=t;return n===$.CHAIN.EVM&&(r=void 0),await Ft.getMyTokensWithBalance({address:o,caipNetwork:r})},async fetchTokensFromExchange(){if(!u.selectedExchange)return[];const e=await Un(u.selectedExchange.id),t=Object.values(e.assets).flat();return await Promise.all(t.map(async o=>{const r=Fn(o),{chainNamespace:i}=_.parseCaipNetworkId(r.chainId);let s=r.address;if(Q.isCaipAddress(s)){const{address:d}=_.parseCaipAddress(s);s=d}const a=await H.getImageByToken(s!=null?s:"",i).catch(()=>{});return r.iconUrl=a!=null?a:"",r}))},async fetchTokens({caipAddress:e,caipNetwork:t,namespace:n}){try{u.isFetchingTokenBalances=!0;const i=await(!!u.selectedExchange?this.fetchTokensFromExchange():this.fetchTokensFromEOA({caipAddress:e,caipNetwork:t,namespace:n}));u.tokenBalances={...u.tokenBalances,[n]:i}}catch(o){const r=o instanceof Error?o.message:"Unable to get token balances";E.showError(r)}finally{u.isFetchingTokenBalances=!1}},async fetchQuote({amount:e,address:t,sourceToken:n,toToken:o,recipient:r}){var i;try{h.resetQuoteState(),u.isFetchingQuote=!0;const s=await On({amount:e,address:u.selectedExchange?void 0:t,sourceToken:n,toToken:o,recipient:r});if(u.selectedExchange){const a=at(s);if(a){const d=`${n.network}:${a.deposit.receiver}`,w=x.formatNumber(a.deposit.amount,{decimals:(i=n.metadata.decimals)!=null?i:0,round:8});await h.generateExchangeUrlForQuote({exchangeId:u.selectedExchange.id,paymentAsset:n,amount:w.toString(),recipient:d})}}u.quote=s}catch(s){let a=de.UNABLE_TO_GET_QUOTE;if(s instanceof Error&&s.cause&&s.cause instanceof Response)try{const d=await s.cause.json();d.error&&typeof d.error=="string"&&(a=d.error)}catch{}throw u.quoteError=a,E.showError(a),new v(b.UNABLE_TO_GET_QUOTE)}finally{u.isFetchingQuote=!1}},async fetchQuoteStatus({requestId:e}){try{if(e===ct){const n=u.selectedExchange,o=u.exchangeSessionId;if(n&&o){switch((await this.getBuyStatus(n.id,o)).status){case"IN_PROGRESS":u.quoteStatus="waiting";break;case"SUCCESS":u.quoteStatus="success",u.isPaymentInProgress=!1;break;case"FAILED":u.quoteStatus="failure",u.isPaymentInProgress=!1;break;case"UNKNOWN":u.quoteStatus="waiting";break;default:u.quoteStatus="waiting";break}return}u.quoteStatus="success";return}const{status:t}=await Rn({requestId:e});u.quoteStatus=t}catch{throw u.quoteStatus="failure",new v(b.UNABLE_TO_GET_QUOTE_STATUS)}},initiatePayment(){u.isPaymentInProgress=!0,u.paymentId=crypto.randomUUID()},initializeAnalytics(){u.analyticsSet||(u.analyticsSet=!0,this.subscribeKey("isPaymentInProgress",e=>{var t;if((t=u.currentPayment)!=null&&t.status&&u.currentPayment.status!=="UNKNOWN"){const n={IN_PROGRESS:"PAY_INITIATED",SUCCESS:"PAY_SUCCESS",FAILED:"PAY_ERROR"}[u.currentPayment.status];V.sendEvent({type:"track",event:n,properties:{message:u.currentPayment.status==="FAILED"?Q.parseError(u.error):void 0,source:"pay",paymentId:u.paymentId||ot,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount},currentPayment:{type:u.currentPayment.type,exchangeId:u.currentPayment.exchangeId,sessionId:u.currentPayment.sessionId,result:u.currentPayment.result}}})}}))},async prepareTokenLogo(){if(!u.paymentAsset.metadata.logoURI)try{const{chainNamespace:e}=_.parseCaipNetworkId(u.paymentAsset.network),t=await H.getImageByToken(u.paymentAsset.asset,e);u.paymentAsset.metadata.logoURI=t}catch{}}},qn=I`
  wui-separator {
    margin: var(--apkt-spacing-3) calc(var(--apkt-spacing-3) * -1) var(--apkt-spacing-2)
      calc(var(--apkt-spacing-3) * -1);
    width: calc(100% + var(--apkt-spacing-3) * 2);
  }

  .token-display {
    padding: var(--apkt-spacing-3) var(--apkt-spacing-3);
    border-radius: var(--apkt-borderRadius-5);
    background-color: var(--apkt-tokens-theme-backgroundPrimary);
    margin-top: var(--apkt-spacing-3);
    margin-bottom: var(--apkt-spacing-3);
  }

  .token-display wui-text {
    text-transform: none;
  }

  wui-loading-spinner {
    padding: var(--apkt-spacing-2);
  }

  .left-image-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 40px;
    height: 40px;
  }

  .chain-image {
    position: absolute;
    width: 20px;
    height: 20px;
    bottom: -3px;
    right: -5px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .payment-methods-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[8]};
    border-top-left-radius: ${({borderRadius:e})=>e[8]};
  }
`;var fe=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let ie=class extends S{constructor(){super(),this.unsubscribe=[],this.amount=h.state.amount,this.namespace=void 0,this.paymentAsset=h.state.paymentAsset,this.activeConnectorIds=B.state.activeConnectorIds,this.caipAddress=void 0,this.exchanges=h.state.exchanges,this.isLoading=h.state.isLoading,this.initializeNamespace(),this.unsubscribe.push(h.subscribeKey("amount",t=>this.amount=t)),this.unsubscribe.push(B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t)),this.unsubscribe.push(h.subscribeKey("exchanges",t=>this.exchanges=t)),this.unsubscribe.push(h.subscribeKey("isLoading",t=>this.isLoading=t)),h.fetchExchanges(),h.setSelectedExchange(void 0)}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return c`
      <wui-flex flexDirection="column">
        ${this.paymentDetailsTemplate()} ${this.paymentMethodsTemplate()}
      </wui-flex>
    `}paymentMethodsTemplate(){return c`
      <wui-flex flexDirection="column" padding="3" gap="2" class="payment-methods-container">
        ${this.payWithWalletTemplate()} ${this.templateSeparator()}
        ${this.templateExchangeOptions()}
      </wui-flex>
    `}initializeNamespace(){var n;const t=y.state.activeChain;this.namespace=t,this.caipAddress=(n=y.getAccountData(t))==null?void 0:n.caipAddress,this.unsubscribe.push(y.subscribeChainProp("accountState",o=>{this.caipAddress=o==null?void 0:o.caipAddress},t))}paymentDetailsTemplate(){const n=y.getAllRequestedCaipNetworks().find(o=>o.caipNetworkId===this.paymentAsset.network);return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        .padding=${["6","8","6","8"]}
        gap="2"
      >
        <wui-flex alignItems="center" gap="1">
          <wui-text variant="h1-regular" color="primary">
            ${He(this.amount||"0")}
          </wui-text>

          <wui-flex flexDirection="column">
            <wui-text variant="h6-regular" color="secondary">
              ${this.paymentAsset.metadata.symbol||"Unknown"}
            </wui-text>
            <wui-text variant="md-medium" color="secondary"
              >on ${(n==null?void 0:n.name)||"Unknown"}</wui-text
            >
          </wui-flex>
        </wui-flex>

        <wui-flex class="left-image-container">
          <wui-image
            src=${A(this.paymentAsset.metadata.logoURI)}
            class="token-image"
          ></wui-image>
          <wui-image
            src=${A(H.getNetworkImage(n))}
            class="chain-image"
          ></wui-image>
        </wui-flex>
      </wui-flex>
    `}payWithWalletTemplate(){return Ln(this.paymentAsset.network)?this.caipAddress?this.connectedWalletTemplate():this.disconnectedWalletTemplate():c``}connectedWalletTemplate(){const{name:t,image:n}=this.getWalletProperties({namespace:this.namespace});return c`
      <wui-flex flexDirection="column" gap="3">
        <wui-list-item
          type="secondary"
          boxColor="foregroundSecondary"
          @click=${this.onWalletPayment}
          .boxed=${!1}
          ?chevron=${!0}
          ?fullSize=${!1}
          ?rounded=${!0}
          data-testid="wallet-payment-option"
          imageSrc=${A(n)}
          imageSize="3xl"
        >
          <wui-text variant="lg-regular" color="primary">Pay with ${t}</wui-text>
        </wui-list-item>

        <wui-list-item
          type="secondary"
          icon="power"
          iconColor="error"
          @click=${this.onDisconnect}
          data-testid="disconnect-button"
          ?chevron=${!1}
          boxColor="foregroundSecondary"
        >
          <wui-text variant="lg-regular" color="secondary">Disconnect</wui-text>
        </wui-list-item>
      </wui-flex>
    `}disconnectedWalletTemplate(){return c`<wui-list-item
      type="secondary"
      boxColor="foregroundSecondary"
      variant="icon"
      iconColor="default"
      iconVariant="overlay"
      icon="wallet"
      @click=${this.onWalletPayment}
      ?chevron=${!0}
      data-testid="wallet-payment-option"
    >
      <wui-text variant="lg-regular" color="primary">Pay with wallet</wui-text>
    </wui-list-item>`}templateExchangeOptions(){if(this.isLoading)return c`<wui-flex justifyContent="center" alignItems="center">
        <wui-loading-spinner size="md"></wui-loading-spinner>
      </wui-flex>`;const t=this.exchanges.filter(n=>zn(this.paymentAsset)?n.id===Pt:n.id!==Pt);return t.length===0?c`<wui-flex justifyContent="center" alignItems="center">
        <wui-text variant="md-medium" color="primary">No exchanges available</wui-text>
      </wui-flex>`:t.map(n=>c`
        <wui-list-item
          type="secondary"
          boxColor="foregroundSecondary"
          @click=${()=>this.onExchangePayment(n)}
          data-testid="exchange-option-${n.id}"
          ?chevron=${!0}
          imageSrc=${A(n.imageUrl)}
        >
          <wui-text flexGrow="1" variant="lg-regular" color="primary">
            Pay with ${n.name}
          </wui-text>
        </wui-list-item>
      `)}templateSeparator(){return c`<wui-separator text="or" bgColor="secondary"></wui-separator>`}async onWalletPayment(){if(!this.namespace)throw new Error("Namespace not found");this.caipAddress?f.push("PayQuote"):(await B.connect(),await L.open({view:"PayQuote"}))}onExchangePayment(t){h.setSelectedExchange(t),f.push("PayQuote")}async onDisconnect(){try{await j.disconnect(),await L.open({view:"Pay"})}catch{console.error("Failed to disconnect"),E.showError("Failed to disconnect")}}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const r=H.getConnectorImage(o);return{name:o.name,image:r}}};ie.styles=qn;fe([m()],ie.prototype,"amount",void 0);fe([m()],ie.prototype,"namespace",void 0);fe([m()],ie.prototype,"paymentAsset",void 0);fe([m()],ie.prototype,"activeConnectorIds",void 0);fe([m()],ie.prototype,"caipAddress",void 0);fe([m()],ie.prototype,"exchanges",void 0);fe([m()],ie.prototype,"isLoading",void 0);ie=fe([k("w3m-pay-view")],ie);const Vn=I`
  :host {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .pulse-container {
    position: relative;
    width: var(--pulse-size);
    height: var(--pulse-size);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pulse-rings {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--pulse-color);
    opacity: 0;
    animation: pulse var(--pulse-duration, 2s) ease-out infinite;
  }

  .pulse-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.5);
      opacity: var(--pulse-opacity, 0.3);
    }
    50% {
      opacity: calc(var(--pulse-opacity, 0.3) * 0.5);
    }
    100% {
      transform: scale(1.2);
      opacity: 0;
    }
  }
`;var Ae=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const Hn=3,Gn=2,Yn=.3,Qn="200px",Kn={"accent-primary":Ne.tokens.core.backgroundAccentPrimary};let me=class extends S{constructor(){super(...arguments),this.rings=Hn,this.duration=Gn,this.opacity=Yn,this.size=Qn,this.variant="accent-primary"}render(){const t=Kn[this.variant];this.style.cssText=`
      --pulse-size: ${this.size};
      --pulse-duration: ${this.duration}s;
      --pulse-color: ${t};
      --pulse-opacity: ${this.opacity};
    `;const n=Array.from({length:this.rings},(o,r)=>this.renderRing(r,this.rings));return c`
      <div class="pulse-container">
        <div class="pulse-rings">${n}</div>
        <div class="pulse-content">
          <slot></slot>
        </div>
      </div>
    `}renderRing(t,n){const r=`animation-delay: ${t/n*this.duration}s;`;return c`<div class="pulse-ring" style=${r}></div>`}};me.styles=[re,Vn];Ae([p({type:Number})],me.prototype,"rings",void 0);Ae([p({type:Number})],me.prototype,"duration",void 0);Ae([p({type:Number})],me.prototype,"opacity",void 0);Ae([p()],me.prototype,"size",void 0);Ae([p()],me.prototype,"variant",void 0);me=Ae([k("wui-pulse")],me);const Ot=[{id:"received",title:"Receiving funds",icon:"dollar"},{id:"processing",title:"Swapping asset",icon:"recycleHorizontal"},{id:"sending",title:"Sending asset to the recipient address",icon:"send"}],Rt=["success","submitted","failure","timeout","refund"],Xn=I`
  :host {
    display: block;
    height: 100%;
    width: 100%;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  .token-badge-container {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: ${({borderRadius:e})=>e[4]};
    z-index: 3;
    min-width: 105px;
  }

  .token-badge-container.loading {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 3px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .token-badge-container.success {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 3px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .token-image-container {
    position: relative;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 64px;
    height: 64px;
  }

  .token-image.success {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .token-image.error {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .token-image.loading {
    background: ${({colors:e})=>e.accent010};
  }

  .token-image wui-icon {
    width: 32px;
    height: 32px;
  }

  .token-badge {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  .token-badge wui-text {
    white-space: nowrap;
  }

  .payment-lifecycle-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[6]};
    border-top-left-radius: ${({borderRadius:e})=>e[6]};
  }

  .payment-step-badge {
    padding: ${({spacing:e})=>e[1]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  .payment-step-badge.loading {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .payment-step-badge.error {
    background-color: ${({tokens:e})=>e.core.backgroundError};
  }

  .payment-step-badge.success {
    background-color: ${({tokens:e})=>e.core.backgroundSuccess};
  }

  .step-icon-container {
    position: relative;
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e.round};
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .step-icon-box {
    position: absolute;
    right: -4px;
    bottom: -1px;
    padding: 2px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .step-icon-box.success {
    background-color: ${({tokens:e})=>e.core.backgroundSuccess};
  }
`;var se=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const Zn={received:["pending","success","submitted"],processing:["success","submitted"],sending:["success","submitted"]},Jn=3e3;let K=class extends S{constructor(){super(),this.unsubscribe=[],this.pollingInterval=null,this.paymentAsset=h.state.paymentAsset,this.quoteStatus=h.state.quoteStatus,this.quote=h.state.quote,this.amount=h.state.amount,this.namespace=void 0,this.caipAddress=void 0,this.profileName=null,this.activeConnectorIds=B.state.activeConnectorIds,this.selectedExchange=h.state.selectedExchange,this.initializeNamespace(),this.unsubscribe.push(h.subscribeKey("quoteStatus",t=>this.quoteStatus=t),h.subscribeKey("quote",t=>this.quote=t),B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t),h.subscribeKey("selectedExchange",t=>this.selectedExchange=t))}connectedCallback(){super.connectedCallback(),this.startPolling()}disconnectedCallback(){super.disconnectedCallback(),this.stopPolling(),this.unsubscribe.forEach(t=>t())}render(){return c`
      <wui-flex flexDirection="column" .padding=${["3","0","0","0"]} gap="2">
        ${this.tokenTemplate()} ${this.paymentTemplate()} ${this.paymentLifecycleTemplate()}
      </wui-flex>
    `}tokenTemplate(){var a;const t=He(this.amount||"0"),n=(a=this.paymentAsset.metadata.symbol)!=null?a:"Unknown",r=y.getAllRequestedCaipNetworks().find(d=>d.caipNetworkId===this.paymentAsset.network),i=this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund";return this.quoteStatus==="success"||this.quoteStatus==="submitted"?c`<wui-flex alignItems="center" justifyContent="center">
        <wui-flex justifyContent="center" alignItems="center" class="token-image success">
          <wui-icon name="checkmark" color="success" size="inherit"></wui-icon>
        </wui-flex>
      </wui-flex>`:i?c`<wui-flex alignItems="center" justifyContent="center">
        <wui-flex justifyContent="center" alignItems="center" class="token-image error">
          <wui-icon name="close" color="error" size="inherit"></wui-icon>
        </wui-flex>
      </wui-flex>`:c`
      <wui-flex alignItems="center" justifyContent="center">
        <wui-flex class="token-image-container">
          <wui-pulse size="125px" rings="3" duration="4" opacity="0.5" variant="accent-primary">
            <wui-flex justifyContent="center" alignItems="center" class="token-image loading">
              <wui-icon name="paperPlaneTitle" color="accent-primary" size="inherit"></wui-icon>
            </wui-flex>
          </wui-pulse>

          <wui-flex
            justifyContent="center"
            alignItems="center"
            class="token-badge-container loading"
          >
            <wui-flex
              alignItems="center"
              justifyContent="center"
              gap="01"
              padding="1"
              class="token-badge"
            >
              <wui-image
                src=${A(H.getNetworkImage(r))}
                class="chain-image"
                size="mdl"
              ></wui-image>

              <wui-text variant="lg-regular" color="primary">${t} ${n}</wui-text>
            </wui-flex>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}paymentTemplate(){return c`
      <wui-flex flexDirection="column" gap="2" .padding=${["0","6","0","6"]}>
        ${this.renderPayment()}
        <wui-separator></wui-separator>
        ${this.renderWallet()}
      </wui-flex>
    `}paymentLifecycleTemplate(){const t=this.getStepsWithStatus();return c`
      <wui-flex flexDirection="column" padding="4" gap="2" class="payment-lifecycle-container">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">PAYMENT CYCLE</wui-text>

          ${this.renderPaymentCycleBadge()}
        </wui-flex>

        <wui-flex flexDirection="column" gap="5" .padding=${["2","0","2","0"]}>
          ${t.map(n=>this.renderStep(n))}
        </wui-flex>
      </wui-flex>
    `}renderPaymentCycleBadge(){var r,i;const t=this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund",n=this.quoteStatus==="success"||this.quoteStatus==="submitted";if(t)return c`
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge error"
          gap="1"
        >
          <wui-icon name="close" color="error" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="error">Failed</wui-text>
        </wui-flex>
      `;if(n)return c`
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge success"
          gap="1"
        >
          <wui-icon name="checkmark" color="success" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="success">Completed</wui-text>
        </wui-flex>
      `;const o=(i=(r=this.quote)==null?void 0:r.timeInSeconds)!=null?i:0;return c`
      <wui-flex alignItems="center" justifyContent="space-between" gap="3">
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge loading"
          gap="1"
        >
          <wui-icon name="clock" color="default" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="primary">Est. ${o} sec</wui-text>
        </wui-flex>

        <wui-icon name="chevronBottom" color="default" size="xxs"></wui-icon>
      </wui-flex>
    `}renderPayment(){var s,a,d,w,T;const n=y.getAllRequestedCaipNetworks().find(C=>{var F;const U=(F=this.quote)==null?void 0:F.origin.currency.network;if(!U)return!1;const{chainId:M}=_.parseCaipNetworkId(U);return J.isLowerCaseMatch(C.id.toString(),M.toString())}),o=x.formatNumber(((s=this.quote)==null?void 0:s.origin.amount)||"0",{decimals:(d=(a=this.quote)==null?void 0:a.origin.currency.metadata.decimals)!=null?d:0}).toString(),r=He(o),i=(T=(w=this.quote)==null?void 0:w.origin.currency.metadata.symbol)!=null?T:"Unknown";return c`
      <wui-flex
        alignItems="flex-start"
        justifyContent="space-between"
        .padding=${["3","0","3","0"]}
      >
        <wui-text variant="lg-regular" color="secondary">Payment Method</wui-text>

        <wui-flex flexDirection="column" alignItems="flex-end" gap="1">
          <wui-flex alignItems="center" gap="01">
            <wui-text variant="lg-regular" color="primary">${r}</wui-text>
            <wui-text variant="lg-regular" color="secondary">${i}</wui-text>
          </wui-flex>

          <wui-flex alignItems="center" gap="1">
            <wui-text variant="md-regular" color="secondary">on</wui-text>
            <wui-image
              src=${A(H.getNetworkImage(n))}
              size="xs"
            ></wui-image>
            <wui-text variant="md-regular" color="secondary">${n==null?void 0:n.name}</wui-text>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}renderWallet(){return c`
      <wui-flex
        alignItems="flex-start"
        justifyContent="space-between"
        .padding=${["3","0","3","0"]}
      >
        <wui-text variant="lg-regular" color="secondary">Wallet</wui-text>

        ${this.renderWalletText()}
      </wui-flex>
    `}renderWalletText(){var r;const{image:t}=this.getWalletProperties({namespace:this.namespace}),{address:n}=this.caipAddress?_.parseCaipAddress(this.caipAddress):{},o=(r=this.selectedExchange)==null?void 0:r.name;return this.selectedExchange?c`
        <wui-flex alignItems="center" justifyContent="flex-end" gap="1">
          <wui-text variant="lg-regular" color="primary">${o}</wui-text>
          <wui-image src=${A(this.selectedExchange.imageUrl)} size="mdl"></wui-image>
        </wui-flex>
      `:c`
      <wui-flex alignItems="center" justifyContent="flex-end" gap="1">
        <wui-text variant="lg-regular" color="primary">
          ${Je.getTruncateString({string:this.profileName||n||o||"",charsStart:this.profileName?16:4,charsEnd:this.profileName?0:6,truncate:this.profileName?"end":"middle"})}
        </wui-text>

        <wui-image src=${A(t)} size="mdl"></wui-image>
      </wui-flex>
    `}getStepsWithStatus(){return this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund"?Ot.map(n=>({...n,status:"failed"})):Ot.map(n=>{var i;const r=((i=Zn[n.id])!=null?i:[]).includes(this.quoteStatus)?"completed":"pending";return{...n,status:r}})}renderStep({title:t,icon:n,status:o}){return c`
      <wui-flex alignItems="center" gap="3">
        <wui-flex justifyContent="center" alignItems="center" class="step-icon-container">
          <wui-icon name=${n} color="default" size="mdl"></wui-icon>

          <wui-flex alignItems="center" justifyContent="center" class=${Mt({"step-icon-box":!0,success:o==="completed"})}>
            ${this.renderStatusIndicator(o)}
          </wui-flex>
        </wui-flex>

        <wui-text variant="md-regular" color="primary">${t}</wui-text>
      </wui-flex>
    `}renderStatusIndicator(t){return t==="completed"?c`<wui-icon size="sm" color="success" name="checkmark"></wui-icon>`:t==="failed"?c`<wui-icon size="sm" color="error" name="close"></wui-icon>`:t==="pending"?c`<wui-loading-spinner color="accent-primary" size="sm"></wui-loading-spinner>`:null}startPolling(){this.pollingInterval||(this.fetchQuoteStatus(),this.pollingInterval=setInterval(()=>{this.fetchQuoteStatus()},Jn))}stopPolling(){this.pollingInterval&&(clearInterval(this.pollingInterval),this.pollingInterval=null)}async fetchQuoteStatus(){const t=h.state.requestId;if(!t||Rt.includes(this.quoteStatus))this.stopPolling();else try{await h.fetchQuoteStatus({requestId:t}),Rt.includes(this.quoteStatus)&&this.stopPolling()}catch{this.stopPolling()}}initializeNamespace(){var n,o,r;const t=y.state.activeChain;this.namespace=t,this.caipAddress=(n=y.getAccountData(t))==null?void 0:n.caipAddress,this.profileName=(r=(o=y.getAccountData(t))==null?void 0:o.profileName)!=null?r:null,this.unsubscribe.push(y.subscribeChainProp("accountState",i=>{var s;this.caipAddress=i==null?void 0:i.caipAddress,this.profileName=(s=i==null?void 0:i.profileName)!=null?s:null},t))}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const r=H.getConnectorImage(o);return{name:o.name,image:r}}};K.styles=Xn;se([m()],K.prototype,"paymentAsset",void 0);se([m()],K.prototype,"quoteStatus",void 0);se([m()],K.prototype,"quote",void 0);se([m()],K.prototype,"amount",void 0);se([m()],K.prototype,"namespace",void 0);se([m()],K.prototype,"caipAddress",void 0);se([m()],K.prototype,"profileName",void 0);se([m()],K.prototype,"activeConnectorIds",void 0);se([m()],K.prototype,"selectedExchange",void 0);K=se([k("w3m-pay-loading-view")],K);const ei=I`
  button {
    display: flex;
    align-items: center;
    height: 40px;
    padding: ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[4]};
    column-gap: ${({spacing:e})=>e[1]};
    background-color: transparent;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  wui-image,
  .icon-box {
    width: ${({spacing:e})=>e[6]};
    height: ${({spacing:e})=>e[6]};
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-text {
    flex: 1;
  }

  .icon-box {
    position: relative;
  }

  .icon-box[data-active='true'] {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .circle {
    position: absolute;
    left: 16px;
    top: 15px;
    width: 8px;
    height: 8px;
    background-color: ${({tokens:e})=>e.core.textSuccess};
    box-shadow: 0 0 0 2px ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: 50%;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }
`;var ee=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let G=class extends S{constructor(){super(...arguments),this.address="",this.profileName="",this.alt="",this.imageSrc="",this.icon=void 0,this.iconSize="md",this.enableGreenCircle=!0,this.loading=!1,this.charsStart=4,this.charsEnd=6}render(){return c`
      <button>
        ${this.leftImageTemplate()} ${this.textTemplate()} ${this.rightImageTemplate()}
      </button>
    `}leftImageTemplate(){const t=this.icon?c`<wui-icon
          size=${A(this.iconSize)}
          color="default"
          name=${this.icon}
          class="icon"
        ></wui-icon>`:c`<wui-image src=${this.imageSrc} alt=${this.alt}></wui-image>`;return c`
      <wui-flex
        alignItems="center"
        justifyContent="center"
        class="icon-box"
        data-active=${!!this.icon}
      >
        ${t}
        ${this.enableGreenCircle?c`<wui-flex class="circle"></wui-flex>`:null}
      </wui-flex>
    `}textTemplate(){return c`
      <wui-text variant="lg-regular" color="primary">
        ${Je.getTruncateString({string:this.profileName||this.address,charsStart:this.profileName?16:this.charsStart,charsEnd:this.profileName?0:this.charsEnd,truncate:this.profileName?"end":"middle"})}
      </wui-text>
    `}rightImageTemplate(){return c`<wui-icon name="chevronBottom" size="sm" color="default"></wui-icon>`}};G.styles=[re,Xe,ei];ee([p()],G.prototype,"address",void 0);ee([p()],G.prototype,"profileName",void 0);ee([p()],G.prototype,"alt",void 0);ee([p()],G.prototype,"imageSrc",void 0);ee([p()],G.prototype,"icon",void 0);ee([p()],G.prototype,"iconSize",void 0);ee([p({type:Boolean})],G.prototype,"enableGreenCircle",void 0);ee([p({type:Boolean})],G.prototype,"loading",void 0);ee([p({type:Number})],G.prototype,"charsStart",void 0);ee([p({type:Number})],G.prototype,"charsEnd",void 0);G=ee([k("wui-wallet-switch")],G);const ti=Ze`
  :host {
    display: block;
  }
`;var ni=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let lt=class extends S{render(){return c`
      <wui-flex flexDirection="column" gap="4">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Pay</wui-text>
          <wui-shimmer width="60px" height="16px" borderRadius="4xs" variant="light"></wui-shimmer>
        </wui-flex>

        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Network Fee</wui-text>

          <wui-flex flexDirection="column" alignItems="flex-end" gap="2">
            <wui-shimmer
              width="75px"
              height="16px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>

            <wui-flex alignItems="center" gap="01">
              <wui-shimmer width="14px" height="14px" rounded variant="light"></wui-shimmer>
              <wui-shimmer
                width="49px"
                height="14px"
                borderRadius="4xs"
                variant="light"
              ></wui-shimmer>
            </wui-flex>
          </wui-flex>
        </wui-flex>

        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Service Fee</wui-text>
          <wui-shimmer width="75px" height="16px" borderRadius="4xs" variant="light"></wui-shimmer>
        </wui-flex>
      </wui-flex>
    `}};lt.styles=[ti];lt=ni([k("w3m-pay-fees-skeleton")],lt);const ii=I`
  :host {
    display: block;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }
`;var Ht=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Ge=class extends S{constructor(){super(),this.unsubscribe=[],this.quote=h.state.quote,this.unsubscribe.push(h.subscribeKey("quote",t=>this.quote=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var n,o,r,i;const t=x.formatNumber(((n=this.quote)==null?void 0:n.origin.amount)||"0",{decimals:(r=(o=this.quote)==null?void 0:o.origin.currency.metadata.decimals)!=null?r:0,round:6}).toString();return c`
      <wui-flex flexDirection="column" gap="4">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Pay</wui-text>
          <wui-text variant="md-regular" color="primary">
            ${t} ${((i=this.quote)==null?void 0:i.origin.currency.metadata.symbol)||"Unknown"}
          </wui-text>
        </wui-flex>

        ${this.quote&&this.quote.fees.length>0?this.quote.fees.map(s=>this.renderFee(s)):null}
      </wui-flex>
    `}renderFee(t){var r;const n=t.id==="network",o=x.formatNumber(t.amount||"0",{decimals:(r=t.currency.metadata.decimals)!=null?r:0,round:6}).toString();if(n){const s=y.getAllRequestedCaipNetworks().find(a=>J.isLowerCaseMatch(a.caipNetworkId,t.currency.network));return c`
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">${t.label}</wui-text>

          <wui-flex flexDirection="column" alignItems="flex-end" gap="2">
            <wui-text variant="md-regular" color="primary">
              ${o} ${t.currency.metadata.symbol||"Unknown"}
            </wui-text>

            <wui-flex alignItems="center" gap="01">
              <wui-image
                src=${A(H.getNetworkImage(s))}
                size="xs"
              ></wui-image>
              <wui-text variant="sm-regular" color="secondary">
                ${(s==null?void 0:s.name)||"Unknown"}
              </wui-text>
            </wui-flex>
          </wui-flex>
        </wui-flex>
      `}return c`
      <wui-flex alignItems="center" justifyContent="space-between">
        <wui-text variant="md-regular" color="secondary">${t.label}</wui-text>
        <wui-text variant="md-regular" color="primary">
          ${o} ${t.currency.metadata.symbol||"Unknown"}
        </wui-text>
      </wui-flex>
    `}};Ge.styles=[ii];Ht([m()],Ge.prototype,"quote",void 0);Ge=Ht([k("w3m-pay-fees")],Ge);const oi=I`
  :host {
    display: block;
    width: 100%;
  }

  .disabled-container {
    padding: ${({spacing:e})=>e[2]};
    min-height: 168px;
  }

  wui-icon {
    width: ${({spacing:e})=>e[8]};
    height: ${({spacing:e})=>e[8]};
  }

  wui-flex > wui-text {
    max-width: 273px;
  }
`;var Gt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Ye=class extends S{constructor(){super(),this.unsubscribe=[],this.selectedExchange=h.state.selectedExchange,this.unsubscribe.push(h.subscribeKey("selectedExchange",t=>this.selectedExchange=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=!!this.selectedExchange;return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
        class="disabled-container"
      >
        <wui-icon name="coins" color="default" size="inherit"></wui-icon>

        <wui-text variant="md-regular" color="primary" align="center">
          You don't have enough funds to complete this transaction
        </wui-text>

        ${t?null:c`<wui-button
              size="md"
              variant="neutral-secondary"
              @click=${this.dispatchConnectOtherWalletEvent.bind(this)}
              >Connect other wallet</wui-button
            >`}
      </wui-flex>
    `}dispatchConnectOtherWalletEvent(){this.dispatchEvent(new CustomEvent("connectOtherWallet",{detail:!0,bubbles:!0,composed:!0}))}};Ye.styles=[oi];Gt([p({type:Array})],Ye.prototype,"selectedExchange",void 0);Ye=Gt([k("w3m-pay-options-empty")],Ye);const ri=I`
  :host {
    display: block;
    width: 100%;
  }

  .pay-options-container {
    max-height: 196px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .pay-options-container::-webkit-scrollbar {
    display: none;
  }

  .pay-option-container {
    border-radius: ${({borderRadius:e})=>e[4]};
    padding: ${({spacing:e})=>e[3]};
    min-height: 60px;
  }

  .token-images-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .chain-image {
    position: absolute;
    bottom: -3px;
    right: -5px;
    border: 2px solid ${({tokens:e})=>e.theme.foregroundSecondary};
  }
`;var si=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let ut=class extends S{render(){return c`
      <wui-flex flexDirection="column" gap="2" class="pay-options-container">
        ${this.renderOptionEntry()} ${this.renderOptionEntry()} ${this.renderOptionEntry()}
      </wui-flex>
    `}renderOptionEntry(){return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        class="pay-option-container"
      >
        <wui-flex alignItems="center" gap="2">
          <wui-flex class="token-images-container">
            <wui-shimmer
              width="32px"
              height="32px"
              rounded
              variant="light"
              class="token-image"
            ></wui-shimmer>
            <wui-shimmer
              width="16px"
              height="16px"
              rounded
              variant="light"
              class="chain-image"
            ></wui-shimmer>
          </wui-flex>

          <wui-flex flexDirection="column" gap="1">
            <wui-shimmer
              width="74px"
              height="16px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>
            <wui-shimmer
              width="46px"
              height="14px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}};ut.styles=[ri];ut=si([k("w3m-pay-options-skeleton")],ut);const ai=I`
  :host {
    display: block;
    width: 100%;
  }

  .pay-options-container {
    max-height: 196px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    mask-image: var(--options-mask-image);
    -webkit-mask-image: var(--options-mask-image);
  }

  .pay-options-container::-webkit-scrollbar {
    display: none;
  }

  .pay-option-container {
    cursor: pointer;
    border-radius: ${({borderRadius:e})=>e[4]};
    padding: ${({spacing:e})=>e[3]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color;
  }

  .token-images-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 32px;
    height: 32px;
  }

  .chain-image {
    position: absolute;
    width: 16px;
    height: 16px;
    bottom: -3px;
    right: -5px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  @media (hover: hover) and (pointer: fine) {
    .pay-option-container:hover {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }
`;var et=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const ci=300;let xe=class extends S{constructor(){super(),this.unsubscribe=[],this.options=[],this.selectedPaymentAsset=null}disconnectedCallback(){var n,o;this.unsubscribe.forEach(r=>r()),(n=this.resizeObserver)==null||n.disconnect();const t=(o=this.shadowRoot)==null?void 0:o.querySelector(".pay-options-container");t==null||t.removeEventListener("scroll",this.handleOptionsListScroll.bind(this))}firstUpdated(){var n,o;const t=(n=this.shadowRoot)==null?void 0:n.querySelector(".pay-options-container");t&&(requestAnimationFrame(this.handleOptionsListScroll.bind(this)),t==null||t.addEventListener("scroll",this.handleOptionsListScroll.bind(this)),this.resizeObserver=new ResizeObserver(()=>{this.handleOptionsListScroll()}),(o=this.resizeObserver)==null||o.observe(t),this.handleOptionsListScroll())}render(){return c`
      <wui-flex flexDirection="column" gap="2" class="pay-options-container">
        ${this.options.map(t=>this.payOptionTemplate(t))}
      </wui-flex>
    `}payOptionTemplate(t){var M,F;const{network:n,metadata:o,asset:r,amount:i="0"}=t,a=y.getAllRequestedCaipNetworks().find(q=>q.caipNetworkId===n),d=`${n}:${r}`,w=`${(M=this.selectedPaymentAsset)==null?void 0:M.network}:${(F=this.selectedPaymentAsset)==null?void 0:F.asset}`,T=d===w,C=x.bigNumber(i,{safe:!0}),U=C.gt(0);return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        @click=${()=>{var q;return(q=this.onSelect)==null?void 0:q.call(this,t)}}
        class="pay-option-container"
      >
        <wui-flex alignItems="center" gap="2">
          <wui-flex class="token-images-container">
            <wui-image
              src=${A(o.logoURI)}
              class="token-image"
              size="3xl"
            ></wui-image>
            <wui-image
              src=${A(H.getNetworkImage(a))}
              class="chain-image"
              size="md"
            ></wui-image>
          </wui-flex>

          <wui-flex flexDirection="column" gap="1">
            <wui-text variant="lg-regular" color="primary">${o.symbol}</wui-text>
            ${U?c`<wui-text variant="sm-regular" color="secondary">
                  ${C.round(6).toString()} ${o.symbol}
                </wui-text>`:null}
          </wui-flex>
        </wui-flex>

        ${T?c`<wui-icon name="checkmark" size="md" color="success"></wui-icon>`:null}
      </wui-flex>
    `}handleOptionsListScroll(){var o;const t=(o=this.shadowRoot)==null?void 0:o.querySelector(".pay-options-container");if(!t)return;t.scrollHeight>ci?(t.style.setProperty("--options-mask-image",`linear-gradient(
          to bottom,
          rgba(0, 0, 0, calc(1 - var(--options-scroll--top-opacity))) 0px,
          rgba(200, 200, 200, calc(1 - var(--options-scroll--top-opacity))) 1px,
          black 50px,
          black calc(100% - 50px),
          rgba(155, 155, 155, calc(1 - var(--options-scroll--bottom-opacity))) calc(100% - 1px),
          rgba(0, 0, 0, calc(1 - var(--options-scroll--bottom-opacity))) 100%
        )`),t.style.setProperty("--options-scroll--top-opacity",Ct.interpolate([0,50],[0,1],t.scrollTop).toString()),t.style.setProperty("--options-scroll--bottom-opacity",Ct.interpolate([0,50],[0,1],t.scrollHeight-t.scrollTop-t.offsetHeight).toString())):(t.style.setProperty("--options-mask-image","none"),t.style.setProperty("--options-scroll--top-opacity","0"),t.style.setProperty("--options-scroll--bottom-opacity","0"))}};xe.styles=[ai];et([p({type:Array})],xe.prototype,"options",void 0);et([p()],xe.prototype,"selectedPaymentAsset",void 0);et([p()],xe.prototype,"onSelect",void 0);xe=et([k("w3m-pay-options")],xe);const li=I`
  .payment-methods-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[5]};
    border-top-left-radius: ${({borderRadius:e})=>e[5]};
  }

  .pay-options-container {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[5]};
    padding: ${({spacing:e})=>e[1]};
  }

  w3m-tooltip-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: fit-content;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  w3m-pay-options.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
`;var R=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const ze={eip155:"ethereum",solana:"solana",bip122:"bitcoin",ton:"ton"},ui={eip155:{icon:ze.eip155,label:"EVM"},solana:{icon:ze.solana,label:"Solana"},bip122:{icon:ze.bip122,label:"Bitcoin"},ton:{icon:ze.ton,label:"Ton"}};let N=class extends S{constructor(){super(),this.unsubscribe=[],this.profileName=null,this.paymentAsset=h.state.paymentAsset,this.namespace=void 0,this.caipAddress=void 0,this.amount=h.state.amount,this.recipient=h.state.recipient,this.activeConnectorIds=B.state.activeConnectorIds,this.selectedPaymentAsset=h.state.selectedPaymentAsset,this.selectedExchange=h.state.selectedExchange,this.isFetchingQuote=h.state.isFetchingQuote,this.quoteError=h.state.quoteError,this.quote=h.state.quote,this.isFetchingTokenBalances=h.state.isFetchingTokenBalances,this.tokenBalances=h.state.tokenBalances,this.isPaymentInProgress=h.state.isPaymentInProgress,this.exchangeUrlForQuote=h.state.exchangeUrlForQuote,this.completedTransactionsCount=0,this.unsubscribe.push(h.subscribeKey("paymentAsset",t=>this.paymentAsset=t)),this.unsubscribe.push(h.subscribeKey("tokenBalances",t=>this.onTokenBalancesChanged(t))),this.unsubscribe.push(h.subscribeKey("isFetchingTokenBalances",t=>this.isFetchingTokenBalances=t)),this.unsubscribe.push(B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t)),this.unsubscribe.push(h.subscribeKey("selectedPaymentAsset",t=>this.selectedPaymentAsset=t)),this.unsubscribe.push(h.subscribeKey("isFetchingQuote",t=>this.isFetchingQuote=t)),this.unsubscribe.push(h.subscribeKey("quoteError",t=>this.quoteError=t)),this.unsubscribe.push(h.subscribeKey("quote",t=>this.quote=t)),this.unsubscribe.push(h.subscribeKey("amount",t=>this.amount=t)),this.unsubscribe.push(h.subscribeKey("recipient",t=>this.recipient=t)),this.unsubscribe.push(h.subscribeKey("isPaymentInProgress",t=>this.isPaymentInProgress=t)),this.unsubscribe.push(h.subscribeKey("selectedExchange",t=>this.selectedExchange=t)),this.unsubscribe.push(h.subscribeKey("exchangeUrlForQuote",t=>this.exchangeUrlForQuote=t)),this.resetQuoteState(),this.initializeNamespace(),this.fetchTokens()}disconnectedCallback(){super.disconnectedCallback(),this.resetAssetsState(),this.unsubscribe.forEach(t=>t())}updated(t){super.updated(t),t.has("selectedPaymentAsset")&&this.fetchQuote()}render(){return c`
      <wui-flex flexDirection="column">
        ${this.profileTemplate()}

        <wui-flex
          flexDirection="column"
          gap="4"
          class="payment-methods-container"
          .padding=${["4","4","5","4"]}
        >
          ${this.paymentOptionsViewTemplate()} ${this.amountWithFeeTemplate()}

          <wui-flex
            alignItems="center"
            justifyContent="space-between"
            .padding=${["1","0","1","0"]}
          >
            <wui-separator></wui-separator>
          </wui-flex>

          ${this.paymentActionsTemplate()}
        </wui-flex>
      </wui-flex>
    `}profileTemplate(){var s,a,d,w,T;if(this.selectedExchange){const C=x.formatNumber((s=this.quote)==null?void 0:s.origin.amount,{decimals:(d=(a=this.quote)==null?void 0:a.origin.currency.metadata.decimals)!=null?d:0}).toString();return c`
        <wui-flex
          .padding=${["4","3","4","3"]}
          alignItems="center"
          justifyContent="space-between"
          gap="2"
        >
          <wui-text variant="lg-regular" color="secondary">Paying with</wui-text>

          ${this.quote?c`<wui-text variant="lg-regular" color="primary">
                ${x.bigNumber(C,{safe:!0}).round(6).toString()}
                ${this.quote.origin.currency.metadata.symbol}
              </wui-text>`:c`<wui-shimmer width="80px" height="18px" variant="light"></wui-shimmer>`}
        </wui-flex>
      `}const t=(w=Q.getPlainAddress(this.caipAddress))!=null?w:"",{name:n,image:o}=this.getWalletProperties({namespace:this.namespace}),{icon:r,label:i}=(T=ui[this.namespace])!=null?T:{};return c`
      <wui-flex
        .padding=${["4","3","4","3"]}
        alignItems="center"
        justifyContent="space-between"
        gap="2"
      >
        <wui-wallet-switch
          profileName=${A(this.profileName)}
          address=${A(t)}
          imageSrc=${A(o)}
          alt=${A(n)}
          @click=${this.onConnectOtherWallet.bind(this)}
          data-testid="wui-wallet-switch"
        ></wui-wallet-switch>

        <wui-wallet-switch
          profileName=${A(i)}
          address=${A(t)}
          icon=${A(r)}
          iconSize="xs"
          .enableGreenCircle=${!1}
          alt=${A(i)}
          @click=${this.onConnectOtherWallet.bind(this)}
          data-testid="wui-wallet-switch"
        ></wui-wallet-switch>
      </wui-flex>
    `}initializeNamespace(){var n,o,r;const t=y.state.activeChain;this.namespace=t,this.caipAddress=(n=y.getAccountData(t))==null?void 0:n.caipAddress,this.profileName=(r=(o=y.getAccountData(t))==null?void 0:o.profileName)!=null?r:null,this.unsubscribe.push(y.subscribeChainProp("accountState",i=>this.onAccountStateChanged(i),t))}async fetchTokens(){if(this.namespace){let t;if(this.caipAddress){const{chainId:n,chainNamespace:o}=_.parseCaipAddress(this.caipAddress),r=`${o}:${n}`;t=y.getAllRequestedCaipNetworks().find(s=>s.caipNetworkId===r)}await h.fetchTokens({caipAddress:this.caipAddress,caipNetwork:t,namespace:this.namespace})}}fetchQuote(){if(this.amount&&this.recipient&&this.selectedPaymentAsset&&this.paymentAsset){const{address:t}=this.caipAddress?_.parseCaipAddress(this.caipAddress):{};h.fetchQuote({amount:this.amount.toString(),address:t,sourceToken:this.selectedPaymentAsset,toToken:this.paymentAsset,recipient:this.recipient})}}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const r=H.getConnectorImage(o);return{name:o.name,image:r}}paymentOptionsViewTemplate(){return c`
      <wui-flex flexDirection="column" gap="2">
        <wui-text variant="sm-regular" color="secondary">CHOOSE PAYMENT OPTION</wui-text>
        <wui-flex class="pay-options-container">${this.paymentOptionsTemplate()}</wui-flex>
      </wui-flex>
    `}paymentOptionsTemplate(){const t=this.getPaymentAssetFromTokenBalances();if(this.isFetchingTokenBalances)return c`<w3m-pay-options-skeleton></w3m-pay-options-skeleton>`;if(t.length===0)return c`<w3m-pay-options-empty
        @connectOtherWallet=${this.onConnectOtherWallet.bind(this)}
      ></w3m-pay-options-empty>`;const n={disabled:this.isFetchingQuote};return c`<w3m-pay-options
      class=${Mt(n)}
      .options=${t}
      .selectedPaymentAsset=${A(this.selectedPaymentAsset)}
      .onSelect=${this.onSelectedPaymentAssetChanged.bind(this)}
    ></w3m-pay-options>`}amountWithFeeTemplate(){return this.isFetchingQuote||!this.selectedPaymentAsset||this.quoteError?c`<w3m-pay-fees-skeleton></w3m-pay-fees-skeleton>`:c`<w3m-pay-fees></w3m-pay-fees>`}paymentActionsTemplate(){var r,i,s,a,d;const t=this.isFetchingQuote||this.isFetchingTokenBalances,n=this.isFetchingQuote||this.isFetchingTokenBalances||!this.selectedPaymentAsset||!!this.quoteError,o=x.formatNumber((i=(r=this.quote)==null?void 0:r.origin.amount)!=null?i:0,{decimals:(a=(s=this.quote)==null?void 0:s.origin.currency.metadata.decimals)!=null?a:0}).toString();return this.selectedExchange?t||n?c`
          <wui-shimmer width="100%" height="48px" variant="light" ?rounded=${!0}></wui-shimmer>
        `:c`<wui-button
        size="lg"
        fullWidth
        variant="accent-secondary"
        @click=${this.onPayWithExchange.bind(this)}
      >
        ${`Continue in ${this.selectedExchange.name}`}

        <wui-icon name="arrowRight" color="inherit" size="sm" slot="iconRight"></wui-icon>
      </wui-button>`:c`
      <wui-flex alignItems="center" justifyContent="space-between">
        <wui-flex flexDirection="column" gap="1">
          <wui-text variant="md-regular" color="secondary">Order Total</wui-text>

          ${t||n?c`<wui-shimmer width="58px" height="32px" variant="light"></wui-shimmer>`:c`<wui-flex alignItems="center" gap="01">
                <wui-text variant="h4-regular" color="primary">${He(o)}</wui-text>

                <wui-text variant="lg-regular" color="secondary">
                  ${((d=this.quote)==null?void 0:d.origin.currency.metadata.symbol)||"Unknown"}
                </wui-text>
              </wui-flex>`}
        </wui-flex>

        ${this.actionButtonTemplate({isLoading:t,isDisabled:n})}
      </wui-flex>
    `}actionButtonTemplate(t){const n=nt(this.quote),{isLoading:o,isDisabled:r}=t;let i="Pay";return n.length>1&&this.completedTransactionsCount===0&&(i="Approve"),c`
      <wui-button
        size="lg"
        variant="accent-primary"
        ?loading=${o||this.isPaymentInProgress}
        ?disabled=${r||this.isPaymentInProgress}
        @click=${()=>{n.length>0?this.onSendTransactions():this.onTransfer()}}
      >
        ${i}
        ${o?null:c`<wui-icon
              name="arrowRight"
              color="inherit"
              size="sm"
              slot="iconRight"
            ></wui-icon>`}
      </wui-button>
    `}getPaymentAssetFromTokenBalances(){var r;return this.namespace?((r=this.tokenBalances[this.namespace])!=null?r:[]).map(i=>{try{return Bn(i)}catch{return null}}).filter(i=>!!i).filter(i=>{const{chainId:s}=_.parseCaipNetworkId(i.network),{chainId:a}=_.parseCaipNetworkId(this.paymentAsset.network);return J.isLowerCaseMatch(i.asset,this.paymentAsset.asset)?!0:this.selectedExchange?!J.isLowerCaseMatch(s.toString(),a.toString()):!0}):[]}onTokenBalancesChanged(t){this.tokenBalances=t;const[n]=this.getPaymentAssetFromTokenBalances();n&&h.setSelectedPaymentAsset(n)}async onConnectOtherWallet(){await B.connect(),await L.open({view:"PayQuote"})}onAccountStateChanged(t){var o;const{address:n}=this.caipAddress?_.parseCaipAddress(this.caipAddress):{};if(this.caipAddress=t==null?void 0:t.caipAddress,this.profileName=(o=t==null?void 0:t.profileName)!=null?o:null,n){const{address:r}=this.caipAddress?_.parseCaipAddress(this.caipAddress):{};r?J.isLowerCaseMatch(r,n)||(this.resetAssetsState(),this.resetQuoteState(),this.fetchTokens()):L.close()}}onSelectedPaymentAssetChanged(t){this.isFetchingQuote||h.setSelectedPaymentAsset(t)}async onTransfer(){var n,o,r,i,s;const t=at(this.quote);if(t){if(!J.isLowerCaseMatch((n=this.selectedPaymentAsset)==null?void 0:n.asset,t.deposit.currency))throw new Error("Quote asset is not the same as the selected payment asset");const d=(r=(o=this.selectedPaymentAsset)==null?void 0:o.amount)!=null?r:"0",w=x.formatNumber(t.deposit.amount,{decimals:(s=(i=this.selectedPaymentAsset)==null?void 0:i.metadata.decimals)!=null?s:0}).toString();if(!x.bigNumber(d).gte(w)){E.showError("Insufficient funds");return}if(this.quote&&this.selectedPaymentAsset&&this.caipAddress&&this.namespace){const{address:C}=_.parseCaipAddress(this.caipAddress);await h.onTransfer({chainNamespace:this.namespace,fromAddress:C,toAddress:t.deposit.receiver,amount:w,paymentAsset:this.selectedPaymentAsset}),h.setRequestId(t.requestId),f.push("PayLoading")}}}async onSendTransactions(){var s,a,d,w,T,C;const t=(a=(s=this.selectedPaymentAsset)==null?void 0:s.amount)!=null?a:"0",n=x.formatNumber((w=(d=this.quote)==null?void 0:d.origin.amount)!=null?w:0,{decimals:(C=(T=this.selectedPaymentAsset)==null?void 0:T.metadata.decimals)!=null?C:0}).toString();if(!x.bigNumber(t).gte(n)){E.showError("Insufficient funds");return}const r=nt(this.quote),[i]=nt(this.quote,this.completedTransactionsCount);i&&this.namespace&&(await h.onSendTransaction({namespace:this.namespace,transactionStep:i}),this.completedTransactionsCount+=1,this.completedTransactionsCount===r.length&&(h.setRequestId(i.requestId),f.push("PayLoading")))}onPayWithExchange(){if(this.exchangeUrlForQuote){const t=Q.returnOpenHref("","popupWindow","scrollbar=yes,width=480,height=720");if(!t)throw new Error("Could not create popup window");t.location.href=this.exchangeUrlForQuote;const n=at(this.quote);n&&h.setRequestId(n.requestId),h.initiatePayment(),f.push("PayLoading")}}resetAssetsState(){h.setSelectedPaymentAsset(null)}resetQuoteState(){h.resetQuoteState()}};N.styles=li;R([m()],N.prototype,"profileName",void 0);R([m()],N.prototype,"paymentAsset",void 0);R([m()],N.prototype,"namespace",void 0);R([m()],N.prototype,"caipAddress",void 0);R([m()],N.prototype,"amount",void 0);R([m()],N.prototype,"recipient",void 0);R([m()],N.prototype,"activeConnectorIds",void 0);R([m()],N.prototype,"selectedPaymentAsset",void 0);R([m()],N.prototype,"selectedExchange",void 0);R([m()],N.prototype,"isFetchingQuote",void 0);R([m()],N.prototype,"quoteError",void 0);R([m()],N.prototype,"quote",void 0);R([m()],N.prototype,"isFetchingTokenBalances",void 0);R([m()],N.prototype,"tokenBalances",void 0);R([m()],N.prototype,"isPaymentInProgress",void 0);R([m()],N.prototype,"exchangeUrlForQuote",void 0);R([m()],N.prototype,"completedTransactionsCount",void 0);N=R([k("w3m-pay-quote-view")],N);const di=I`
  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  .transfers-badge {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[4]};
  }
`;var xt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Re=class extends S{constructor(){super(),this.unsubscribe=[],this.paymentAsset=h.state.paymentAsset,this.amount=h.state.amount,this.unsubscribe.push(h.subscribeKey("paymentAsset",t=>{this.paymentAsset=t}),h.subscribeKey("amount",t=>{this.amount=t}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var o;const n=y.getAllRequestedCaipNetworks().find(r=>r.caipNetworkId===this.paymentAsset.network);return c`<wui-flex
      alignItems="center"
      gap="1"
      .padding=${["1","2","1","1"]}
      class="transfers-badge"
    >
      <wui-image src=${A(this.paymentAsset.metadata.logoURI)} size="xl"></wui-image>
      <wui-text variant="lg-regular" color="primary">
        ${this.amount} ${this.paymentAsset.metadata.symbol}
      </wui-text>
      <wui-text variant="sm-regular" color="secondary">
        on ${(o=n==null?void 0:n.name)!=null?o:"Unknown"}
      </wui-text>
    </wui-flex>`}};Re.styles=[di];xt([p()],Re.prototype,"paymentAsset",void 0);xt([p()],Re.prototype,"amount",void 0);Re=xt([k("w3m-pay-header")],Re);const pi=I`
  :host {
    height: 60px;
  }

  :host > wui-flex {
    box-sizing: border-box;
    background-color: var(--local-header-background-color);
  }

  wui-text {
    background-color: var(--local-header-background-color);
  }

  wui-flex.w3m-header-title {
    transform: translateY(0);
    opacity: 1;
  }

  wui-flex.w3m-header-title[view-direction='prev'] {
    animation:
      slide-down-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-down-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-flex.w3m-header-title[view-direction='next'] {
    animation:
      slide-up-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-up-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-icon-button[data-hidden='true'] {
    opacity: 0 !important;
    pointer-events: none;
  }

  @keyframes slide-up-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(3px);
      opacity: 0;
    }
  }

  @keyframes slide-up-in {
    from {
      transform: translateY(-3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slide-down-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(-3px);
      opacity: 0;
    }
  }

  @keyframes slide-down-in {
    from {
      transform: translateY(3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;var ge=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const hi=["SmartSessionList"],mi={PayWithExchange:Ne.tokens.theme.foregroundPrimary};function Ut(){var d,w,T,C,U,M,F,q;const e=(w=(d=f.state.data)==null?void 0:d.connector)==null?void 0:w.name,t=(C=(T=f.state.data)==null?void 0:T.wallet)==null?void 0:C.name,n=(M=(U=f.state.data)==null?void 0:U.network)==null?void 0:M.name,o=t!=null?t:e,r=B.getConnectors(),i=r.length===1&&((F=r[0])==null?void 0:F.id)==="w3m-email",s=(q=y.getAccountData())==null?void 0:q.socialProvider,a=s?s.charAt(0).toUpperCase()+s.slice(1):"Connect Social";return{Connect:`Connect ${i?"Email":""} Wallet`,Create:"Create Wallet",ChooseAccountName:void 0,Account:void 0,AccountSettings:void 0,AllWallets:"All Wallets",ApproveTransaction:"Approve Transaction",BuyInProgress:"Buy",UsageExceeded:"Usage Exceeded",ConnectingExternal:o!=null?o:"Connect Wallet",ConnectingWalletConnect:o!=null?o:"WalletConnect",ConnectingWalletConnectBasic:"WalletConnect",ConnectingSiwe:"Sign In",Convert:"Convert",ConvertSelectToken:"Select token",ConvertPreview:"Preview Convert",Downloads:o?`Get ${o}`:"Downloads",EmailLogin:"Email Login",EmailVerifyOtp:"Confirm Email",EmailVerifyDevice:"Register Device",GetWallet:"Get a Wallet",Networks:"Choose Network",OnRampProviders:"Choose Provider",OnRampActivity:"Activity",OnRampTokenSelect:"Select Token",OnRampFiatSelect:"Select Currency",Pay:"How you pay",ProfileWallets:"Wallets",SwitchNetwork:n!=null?n:"Switch Network",Transactions:"Activity",UnsupportedChain:"Switch Network",UpgradeEmailWallet:"Upgrade Your Wallet",UpdateEmailWallet:"Edit Email",UpdateEmailPrimaryOtp:"Confirm Current Email",UpdateEmailSecondaryOtp:"Confirm New Email",WhatIsABuy:"What is Buy?",RegisterAccountName:"Choose Name",RegisterAccountNameSuccess:"",WalletReceive:"Receive",WalletCompatibleNetworks:"Compatible Networks",Swap:"Swap",SwapSelectToken:"Select Token",SwapPreview:"Preview Swap",WalletSend:"Send",WalletSendPreview:"Review Send",WalletSendSelectToken:"Select Token",WalletSendConfirmed:"Confirmed",WhatIsANetwork:"What is a network?",WhatIsAWallet:"What is a Wallet?",ConnectWallets:"Connect Wallet",ConnectSocials:"All Socials",ConnectingSocial:a,ConnectingMultiChain:"Select Chain",ConnectingFarcaster:"Farcaster",SwitchActiveChain:"Switch Chain",SmartSessionCreated:void 0,SmartSessionList:"Smart Sessions",SIWXSignMessage:"Sign In",PayLoading:"Processing payment...",PayQuote:"Payment Quote",DataCapture:"Profile",DataCaptureOtpConfirm:"Confirm Email",FundWallet:"Fund Wallet",PayWithExchange:"Deposit from Exchange",PayWithExchangeSelectAsset:"Select Asset",SmartAccountSettings:"Smart Account Settings"}}let oe=class extends S{constructor(){super(),this.unsubscribe=[],this.heading=Ut()[f.state.view],this.network=y.state.activeCaipNetwork,this.networkImage=H.getNetworkImage(this.network),this.showBack=!1,this.prevHistoryLength=1,this.view=f.state.view,this.viewDirection="",this.unsubscribe.push(en.subscribeNetworkImages(()=>{this.networkImage=H.getNetworkImage(this.network)}),f.subscribeKey("view",t=>{setTimeout(()=>{this.view=t,this.heading=Ut()[t]},ye.ANIMATION_DURATIONS.HeaderText),this.onViewChange(),this.onHistoryChange()}),y.subscribeKey("activeCaipNetwork",t=>{this.network=t,this.networkImage=H.getNetworkImage(this.network)}))}disconnectCallback(){this.unsubscribe.forEach(t=>t())}render(){var n;const t=(n=mi[f.state.view])!=null?n:Ne.tokens.theme.backgroundPrimary;return this.style.setProperty("--local-header-background-color",t),c`
      <wui-flex
        .padding=${["0","4","0","4"]}
        justifyContent="space-between"
        alignItems="center"
      >
        ${this.leftHeaderTemplate()} ${this.titleTemplate()} ${this.rightHeaderTemplate()}
      </wui-flex>
    `}onWalletHelp(){V.sendEvent({type:"track",event:"CLICK_WALLET_HELP"}),f.push("WhatIsAWallet")}async onClose(){await qt.safeClose()}rightHeaderTemplate(){var n,o,r;const t=(r=(o=(n=P)==null?void 0:n.state)==null?void 0:o.features)==null?void 0:r.smartSessions;return f.state.view!=="Account"||!t?this.closeButtonTemplate():c`<wui-flex>
      <wui-icon-button
        icon="clock"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${()=>f.push("SmartSessionList")}
        data-testid="w3m-header-smart-sessions"
      ></wui-icon-button>
      ${this.closeButtonTemplate()}
    </wui-flex> `}closeButtonTemplate(){return c`
      <wui-icon-button
        icon="close"
        size="lg"
        type="neutral"
        variant="primary"
        iconSize="lg"
        @click=${this.onClose.bind(this)}
        data-testid="w3m-header-close"
      ></wui-icon-button>
    `}titleTemplate(){if(this.view==="PayQuote")return c`<w3m-pay-header></w3m-pay-header>`;const t=hi.includes(this.view);return c`
      <wui-flex
        view-direction="${this.viewDirection}"
        class="w3m-header-title"
        alignItems="center"
        gap="2"
      >
        <wui-text
          display="inline"
          variant="lg-regular"
          color="primary"
          data-testid="w3m-header-text"
        >
          ${this.heading}
        </wui-text>
        ${t?c`<wui-tag variant="accent" size="md">Beta</wui-tag>`:null}
      </wui-flex>
    `}leftHeaderTemplate(){var w;const{view:t}=f.state,n=t==="Connect",o=P.state.enableEmbedded,r=t==="ApproveTransaction",i=t==="ConnectingSiwe",s=t==="Account",a=P.state.enableNetworkSwitch,d=r||i||n&&o;return s&&a?c`<wui-select
        id="dynamic"
        data-testid="w3m-account-select-network"
        active-network=${A((w=this.network)==null?void 0:w.name)}
        @click=${this.onNetworks.bind(this)}
        imageSrc=${A(this.networkImage)}
      ></wui-select>`:this.showBack&&!d?c`<wui-icon-button
        data-testid="header-back"
        id="dynamic"
        icon="chevronLeft"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${this.onGoBack.bind(this)}
      ></wui-icon-button>`:c`<wui-icon-button
      data-hidden=${!n}
      id="dynamic"
      icon="helpCircle"
      size="lg"
      iconSize="lg"
      type="neutral"
      variant="primary"
      @click=${this.onWalletHelp.bind(this)}
    ></wui-icon-button>`}onNetworks(){this.isAllowedNetworkSwitch()&&(V.sendEvent({type:"track",event:"CLICK_NETWORKS"}),f.push("Networks"))}isAllowedNetworkSwitch(){const t=y.getAllRequestedCaipNetworks(),n=t?t.length>1:!1,o=t==null?void 0:t.find(({id:r})=>{var i;return r===((i=this.network)==null?void 0:i.id)});return n||!o}onViewChange(){const{history:t}=f.state;let n=ye.VIEW_DIRECTION.Next;t.length<this.prevHistoryLength&&(n=ye.VIEW_DIRECTION.Prev),this.prevHistoryLength=t.length,this.viewDirection=n}async onHistoryChange(){var o;const{history:t}=f.state,n=(o=this.shadowRoot)==null?void 0:o.querySelector("#dynamic");t.length>1&&!this.showBack&&n?(await n.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!0,n.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"})):t.length<=1&&this.showBack&&n&&(await n.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!1,n.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}onGoBack(){f.goBack()}};oe.styles=pi;ge([m()],oe.prototype,"heading",void 0);ge([m()],oe.prototype,"network",void 0);ge([m()],oe.prototype,"networkImage",void 0);ge([m()],oe.prototype,"showBack",void 0);ge([m()],oe.prototype,"prevHistoryLength",void 0);ge([m()],oe.prototype,"view",void 0);ge([m()],oe.prototype,"viewDirection",void 0);oe=ge([k("w3m-header")],oe);const wi=I`
  :host {
    display: flex;
    align-items: center;
    gap: ${({spacing:e})=>e[1]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[2]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow:
      0px 0px 8px 0px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px ${({tokens:e})=>e.theme.borderPrimary};
    max-width: 320px;
  }

  wui-icon-box {
    border-radius: ${({borderRadius:e})=>e.round} !important;
    overflow: hidden;
  }

  wui-loading-spinner {
    padding: ${({spacing:e})=>e[1]};
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    border-radius: ${({borderRadius:e})=>e.round} !important;
  }
`;var kt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Ue=class extends S{constructor(){super(...arguments),this.message="",this.variant="success"}render(){return c`
      ${this.templateIcon()}
      <wui-text variant="lg-regular" color="primary" data-testid="wui-snackbar-message"
        >${this.message}</wui-text
      >
    `}templateIcon(){const t={success:"success",error:"error",warning:"warning",info:"default"},n={success:"checkmark",error:"warning",warning:"warningCircle",info:"info"};return this.variant==="loading"?c`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:c`<wui-icon-box
      size="md"
      color=${t[this.variant]}
      icon=${n[this.variant]}
    ></wui-icon-box>`}};Ue.styles=[re,wi];kt([p()],Ue.prototype,"message",void 0);kt([p()],Ue.prototype,"variant",void 0);Ue=kt([k("wui-snackbar")],Ue);const fi=Ze`
  :host {
    display: block;
    position: absolute;
    opacity: 0;
    pointer-events: none;
    top: 11px;
    left: 50%;
    width: max-content;
  }
`;var Yt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Qe=class extends S{constructor(){super(),this.unsubscribe=[],this.timeout=void 0,this.open=E.state.open,this.unsubscribe.push(E.subscribeKey("open",t=>{this.open=t,this.onOpen()}))}disconnectedCallback(){clearTimeout(this.timeout),this.unsubscribe.forEach(t=>t())}render(){const{message:t,variant:n}=E.state;return c` <wui-snackbar message=${t} variant=${n}></wui-snackbar> `}onOpen(){clearTimeout(this.timeout),this.open?(this.animate([{opacity:0,transform:"translateX(-50%) scale(0.85)"},{opacity:1,transform:"translateX(-50%) scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.timeout&&clearTimeout(this.timeout),E.state.autoClose&&(this.timeout=setTimeout(()=>E.hide(),2500))):this.animate([{opacity:1,transform:"translateX(-50%) scale(1)"},{opacity:0,transform:"translateX(-50%) scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"})}};Qe.styles=fi;Yt([m()],Qe.prototype,"open",void 0);Qe=Yt([k("w3m-snackbar")],Qe);const gi=Ze`
  :host {
    width: 100%;
    display: block;
  }
`;var Tt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let We=class extends S{constructor(){super(),this.unsubscribe=[],this.text="",this.open=Y.state.open,this.unsubscribe.push(f.subscribeKey("view",()=>{Y.hide()}),L.subscribeKey("open",t=>{t||Y.hide()}),Y.subscribeKey("open",t=>{this.open=t}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),Y.hide()}render(){return c`
      <div
        @pointermove=${this.onMouseEnter.bind(this)}
        @pointerleave=${this.onMouseLeave.bind(this)}
      >
        ${this.renderChildren()}
      </div>
    `}renderChildren(){return c`<slot></slot> `}onMouseEnter(){const t=this.getBoundingClientRect();if(!this.open){const n=document.querySelector("w3m-modal"),o={width:t.width,height:t.height,left:t.left,top:t.top};if(n){const r=n.getBoundingClientRect();o.left=t.left-(window.innerWidth-r.width)/2,o.top=t.top-(window.innerHeight-r.height)/2}Y.showTooltip({message:this.text,triggerRect:o,variant:"shade"})}}onMouseLeave(t){this.contains(t.relatedTarget)||Y.hide()}};We.styles=[gi];Tt([p()],We.prototype,"text",void 0);Tt([m()],We.prototype,"open",void 0);We=Tt([k("w3m-tooltip-trigger")],We);const yi=I`
  :host {
    pointer-events: none;
  }

  :host > wui-flex {
    display: var(--w3m-tooltip-display);
    opacity: var(--w3m-tooltip-opacity);
    padding: 9px ${({spacing:e})=>e[3]} 10px ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.backgroundPrimary};
    position: absolute;
    top: var(--w3m-tooltip-top);
    left: var(--w3m-tooltip-left);
    transform: translate(calc(-50% + var(--w3m-tooltip-parent-width)), calc(-100% - 8px));
    max-width: calc(var(--apkt-modal-width) - ${({spacing:e})=>e[5]});
    transition: opacity ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  :host([data-variant='shade']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  :host([data-variant='shade']) > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  :host([data-variant='fill']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  wui-icon {
    position: absolute;
    width: 12px !important;
    height: 4px !important;
    color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon[data-placement='top'] {
    bottom: 0px;
    left: 50%;
    transform: translate(-50%, 95%);
  }

  wui-icon[data-placement='bottom'] {
    top: 0;
    left: 50%;
    transform: translate(-50%, -95%) rotate(180deg);
  }

  wui-icon[data-placement='right'] {
    top: 50%;
    left: 0;
    transform: translate(-65%, -50%) rotate(90deg);
  }

  wui-icon[data-placement='left'] {
    top: 50%;
    right: 0%;
    transform: translate(65%, -50%) rotate(270deg);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var Be=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let be=class extends S{constructor(){super(),this.unsubscribe=[],this.open=Y.state.open,this.message=Y.state.message,this.triggerRect=Y.state.triggerRect,this.variant=Y.state.variant,this.unsubscribe.push(Y.subscribe(t=>{this.open=t.open,this.message=t.message,this.triggerRect=t.triggerRect,this.variant=t.variant}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){this.dataset.variant=this.variant;const t=this.triggerRect.top,n=this.triggerRect.left;return this.style.cssText=`
    --w3m-tooltip-top: ${t}px;
    --w3m-tooltip-left: ${n}px;
    --w3m-tooltip-parent-width: ${this.triggerRect.width/2}px;
    --w3m-tooltip-display: ${this.open?"flex":"none"};
    --w3m-tooltip-opacity: ${this.open?1:0};
    `,c`<wui-flex>
      <wui-icon data-placement="top" size="inherit" name="cursor"></wui-icon>
      <wui-text color="primary" variant="sm-regular">${this.message}</wui-text>
    </wui-flex>`}};be.styles=[yi];Be([m()],be.prototype,"open",void 0);Be([m()],be.prototype,"message",void 0);Be([m()],be.prototype,"triggerRect",void 0);Be([m()],be.prototype,"variant",void 0);be=Be([k("w3m-tooltip")],be);const $e={getTabsByNamespace(e){var n;return!!e&&e===$.CHAIN.EVM?((n=P.state.remoteFeatures)==null?void 0:n.activity)===!1?ye.ACCOUNT_TABS.filter(o=>o.label!=="Activity"):ye.ACCOUNT_TABS:[]},isValidReownName(e){return/^[a-zA-Z0-9]+$/gu.test(e)},isValidEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/gu.test(e)},validateReownName(e){return e.replace(/\^/gu,"").toLowerCase().replace(/[^a-zA-Z0-9]/gu,"")},hasFooter(){var t;const e=f.state.view;if(ye.VIEWS_WITH_LEGAL_FOOTER.includes(e)){const{termsConditionsUrl:n,privacyPolicyUrl:o}=P.state,r=(t=P.state.features)==null?void 0:t.legalCheckbox;return!(!n&&!o||r)}return ye.VIEWS_WITH_DEFAULT_FOOTER.includes(e)}},bi=I`
  :host wui-ux-by-reown {
    padding-top: 0;
  }

  :host wui-ux-by-reown.branding-only {
    padding-top: ${({spacing:e})=>e[3]};
  }

  a {
    text-decoration: none;
    color: ${({tokens:e})=>e.core.textAccentPrimary};
    font-weight: 500;
  }
`;var Qt=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Ke=class extends S{constructor(){super(),this.unsubscribe=[],this.remoteFeatures=P.state.remoteFeatures,this.unsubscribe.push(P.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var i;const{termsConditionsUrl:t,privacyPolicyUrl:n}=P.state,o=(i=P.state.features)==null?void 0:i.legalCheckbox;return!t&&!n||o?c`
        <wui-flex flexDirection="column"> ${this.reownBrandingTemplate(!0)} </wui-flex>
      `:c`
      <wui-flex flexDirection="column">
        <wui-flex .padding=${["4","3","3","3"]} justifyContent="center">
          <wui-text color="secondary" variant="md-regular" align="center">
            By connecting your wallet, you agree to our <br />
            ${this.termsTemplate()} ${this.andTemplate()} ${this.privacyTemplate()}
          </wui-text>
        </wui-flex>
        ${this.reownBrandingTemplate()}
      </wui-flex>
    `}andTemplate(){const{termsConditionsUrl:t,privacyPolicyUrl:n}=P.state;return t&&n?"and":""}termsTemplate(){const{termsConditionsUrl:t}=P.state;return t?c`<a href=${t} target="_blank" rel="noopener noreferrer"
      >Terms of Service</a
    >`:null}privacyTemplate(){const{privacyPolicyUrl:t}=P.state;return t?c`<a href=${t} target="_blank" rel="noopener noreferrer"
      >Privacy Policy</a
    >`:null}reownBrandingTemplate(t=!1){var n;return(n=this.remoteFeatures)!=null&&n.reownBranding?t?c`<wui-ux-by-reown class="branding-only"></wui-ux-by-reown>`:c`<wui-ux-by-reown></wui-ux-by-reown>`:null}};Ke.styles=[bi];Qt([m()],Ke.prototype,"remoteFeatures",void 0);Ke=Qt([k("w3m-legal-footer")],Ke);const vi=Ze``;var xi=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let dt=class extends S{render(){const{termsConditionsUrl:t,privacyPolicyUrl:n}=P.state;return!t&&!n?null:c`
      <wui-flex
        .padding=${["4","3","3","3"]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
      >
        <wui-text color="secondary" variant="md-regular" align="center">
          We work with the best providers to give you the lowest fees and best support. More options
          coming soon!
        </wui-text>

        ${this.howDoesItWorkTemplate()}
      </wui-flex>
    `}howDoesItWorkTemplate(){return c` <wui-link @click=${this.onWhatIsBuy.bind(this)}>
      <wui-icon size="xs" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
      How does it work?
    </wui-link>`}onWhatIsBuy(){V.sendEvent({type:"track",event:"SELECT_WHAT_IS_A_BUY",properties:{isSmartAccount:je(y.state.activeChain)===Me.ACCOUNT_TYPES.SMART_ACCOUNT}}),f.push("WhatIsABuy")}};dt.styles=[vi];dt=xi([k("w3m-onramp-providers-footer")],dt);const ki=I`
  :host {
    display: block;
  }

  div.container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    height: auto;
    display: block;
  }

  div.container[status='hide'] {
    animation: fade-out;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: 0s;
  }

  div.container[status='show'] {
    animation: fade-in;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      filter: blur(6px);
    }
    to {
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
      filter: blur(0px);
    }
    to {
      opacity: 0;
      filter: blur(6px);
    }
  }
`;var At=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let De=class extends S{constructor(){super(...arguments),this.resizeObserver=void 0,this.unsubscribe=[],this.status="hide",this.view=f.state.view}firstUpdated(){this.status=$e.hasFooter()?"show":"hide",this.unsubscribe.push(f.subscribeKey("view",t=>{this.view=t,this.status=$e.hasFooter()?"show":"hide",this.status==="hide"&&document.documentElement.style.setProperty("--apkt-footer-height","0px")})),this.resizeObserver=new ResizeObserver(t=>{for(const n of t)if(n.target===this.getWrapper()){const o=`${n.contentRect.height}px`;document.documentElement.style.setProperty("--apkt-footer-height",o)}}),this.resizeObserver.observe(this.getWrapper())}render(){return c`
      <div class="container" status=${this.status}>${this.templatePageContainer()}</div>
    `}templatePageContainer(){return $e.hasFooter()?c` ${this.templateFooter()}`:null}templateFooter(){switch(this.view){case"Networks":return this.templateNetworksFooter();case"Connect":case"ConnectWallets":case"OnRampFiatSelect":case"OnRampTokenSelect":return c`<w3m-legal-footer></w3m-legal-footer>`;case"OnRampProviders":return c`<w3m-onramp-providers-footer></w3m-onramp-providers-footer>`;default:return null}}templateNetworksFooter(){return c` <wui-flex
      class="footer-in"
      padding="3"
      flexDirection="column"
      gap="3"
      alignItems="center"
    >
      <wui-text variant="md-regular" color="secondary" align="center">
        Your connected wallet may not support some of the networks available for this dApp
      </wui-text>
      <wui-link @click=${this.onNetworkHelp.bind(this)}>
        <wui-icon size="sm" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
        What is a network
      </wui-link>
    </wui-flex>`}onNetworkHelp(){V.sendEvent({type:"track",event:"CLICK_NETWORK_HELP"}),f.push("WhatIsANetwork")}getWrapper(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector("div.container")}};De.styles=[ki];At([m()],De.prototype,"status",void 0);At([m()],De.prototype,"view",void 0);De=At([k("w3m-footer")],De);const Ti=I`
  :host {
    display: block;
    width: inherit;
  }
`;var St=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let Le=class extends S{constructor(){super(),this.unsubscribe=[],this.viewState=f.state.view,this.history=f.state.history.join(","),this.unsubscribe.push(f.subscribeKey("view",()=>{this.history=f.state.history.join(","),document.documentElement.style.setProperty("--apkt-duration-dynamic","var(--apkt-durations-lg)")}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),document.documentElement.style.setProperty("--apkt-duration-dynamic","0s")}render(){return c`${this.templatePageContainer()}`}templatePageContainer(){return c`<w3m-router-container
      history=${this.history}
      .setView=${()=>{this.viewState=f.state.view}}
    >
      ${this.viewTemplate(this.viewState)}
    </w3m-router-container>`}viewTemplate(t){switch(t){case"AccountSettings":return c`<w3m-account-settings-view></w3m-account-settings-view>`;case"Account":return c`<w3m-account-view></w3m-account-view>`;case"AllWallets":return c`<w3m-all-wallets-view></w3m-all-wallets-view>`;case"ApproveTransaction":return c`<w3m-approve-transaction-view></w3m-approve-transaction-view>`;case"BuyInProgress":return c`<w3m-buy-in-progress-view></w3m-buy-in-progress-view>`;case"ChooseAccountName":return c`<w3m-choose-account-name-view></w3m-choose-account-name-view>`;case"Connect":return c`<w3m-connect-view></w3m-connect-view>`;case"Create":return c`<w3m-connect-view walletGuide="explore"></w3m-connect-view>`;case"ConnectingWalletConnect":return c`<w3m-connecting-wc-view></w3m-connecting-wc-view>`;case"ConnectingWalletConnectBasic":return c`<w3m-connecting-wc-basic-view></w3m-connecting-wc-basic-view>`;case"ConnectingExternal":return c`<w3m-connecting-external-view></w3m-connecting-external-view>`;case"ConnectingSiwe":return c`<w3m-connecting-siwe-view></w3m-connecting-siwe-view>`;case"ConnectWallets":return c`<w3m-connect-wallets-view></w3m-connect-wallets-view>`;case"ConnectSocials":return c`<w3m-connect-socials-view></w3m-connect-socials-view>`;case"ConnectingSocial":return c`<w3m-connecting-social-view></w3m-connecting-social-view>`;case"DataCapture":return c`<w3m-data-capture-view></w3m-data-capture-view>`;case"DataCaptureOtpConfirm":return c`<w3m-data-capture-otp-confirm-view></w3m-data-capture-otp-confirm-view>`;case"Downloads":return c`<w3m-downloads-view></w3m-downloads-view>`;case"EmailLogin":return c`<w3m-email-login-view></w3m-email-login-view>`;case"EmailVerifyOtp":return c`<w3m-email-verify-otp-view></w3m-email-verify-otp-view>`;case"EmailVerifyDevice":return c`<w3m-email-verify-device-view></w3m-email-verify-device-view>`;case"GetWallet":return c`<w3m-get-wallet-view></w3m-get-wallet-view>`;case"Networks":return c`<w3m-networks-view></w3m-networks-view>`;case"SwitchNetwork":return c`<w3m-network-switch-view></w3m-network-switch-view>`;case"ProfileWallets":return c`<w3m-profile-wallets-view></w3m-profile-wallets-view>`;case"Transactions":return c`<w3m-transactions-view></w3m-transactions-view>`;case"OnRampProviders":return c`<w3m-onramp-providers-view></w3m-onramp-providers-view>`;case"OnRampTokenSelect":return c`<w3m-onramp-token-select-view></w3m-onramp-token-select-view>`;case"OnRampFiatSelect":return c`<w3m-onramp-fiat-select-view></w3m-onramp-fiat-select-view>`;case"UpgradeEmailWallet":return c`<w3m-upgrade-wallet-view></w3m-upgrade-wallet-view>`;case"UpdateEmailWallet":return c`<w3m-update-email-wallet-view></w3m-update-email-wallet-view>`;case"UpdateEmailPrimaryOtp":return c`<w3m-update-email-primary-otp-view></w3m-update-email-primary-otp-view>`;case"UpdateEmailSecondaryOtp":return c`<w3m-update-email-secondary-otp-view></w3m-update-email-secondary-otp-view>`;case"UnsupportedChain":return c`<w3m-unsupported-chain-view></w3m-unsupported-chain-view>`;case"Swap":return c`<w3m-swap-view></w3m-swap-view>`;case"SwapSelectToken":return c`<w3m-swap-select-token-view></w3m-swap-select-token-view>`;case"SwapPreview":return c`<w3m-swap-preview-view></w3m-swap-preview-view>`;case"WalletSend":return c`<w3m-wallet-send-view></w3m-wallet-send-view>`;case"WalletSendSelectToken":return c`<w3m-wallet-send-select-token-view></w3m-wallet-send-select-token-view>`;case"WalletSendPreview":return c`<w3m-wallet-send-preview-view></w3m-wallet-send-preview-view>`;case"WalletSendConfirmed":return c`<w3m-send-confirmed-view></w3m-send-confirmed-view>`;case"WhatIsABuy":return c`<w3m-what-is-a-buy-view></w3m-what-is-a-buy-view>`;case"WalletReceive":return c`<w3m-wallet-receive-view></w3m-wallet-receive-view>`;case"WalletCompatibleNetworks":return c`<w3m-wallet-compatible-networks-view></w3m-wallet-compatible-networks-view>`;case"WhatIsAWallet":return c`<w3m-what-is-a-wallet-view></w3m-what-is-a-wallet-view>`;case"ConnectingMultiChain":return c`<w3m-connecting-multi-chain-view></w3m-connecting-multi-chain-view>`;case"WhatIsANetwork":return c`<w3m-what-is-a-network-view></w3m-what-is-a-network-view>`;case"ConnectingFarcaster":return c`<w3m-connecting-farcaster-view></w3m-connecting-farcaster-view>`;case"SwitchActiveChain":return c`<w3m-switch-active-chain-view></w3m-switch-active-chain-view>`;case"RegisterAccountName":return c`<w3m-register-account-name-view></w3m-register-account-name-view>`;case"RegisterAccountNameSuccess":return c`<w3m-register-account-name-success-view></w3m-register-account-name-success-view>`;case"SmartSessionCreated":return c`<w3m-smart-session-created-view></w3m-smart-session-created-view>`;case"SmartSessionList":return c`<w3m-smart-session-list-view></w3m-smart-session-list-view>`;case"SIWXSignMessage":return c`<w3m-siwx-sign-message-view></w3m-siwx-sign-message-view>`;case"Pay":return c`<w3m-pay-view></w3m-pay-view>`;case"PayLoading":return c`<w3m-pay-loading-view></w3m-pay-loading-view>`;case"PayQuote":return c`<w3m-pay-quote-view></w3m-pay-quote-view>`;case"FundWallet":return c`<w3m-fund-wallet-view></w3m-fund-wallet-view>`;case"PayWithExchange":return c`<w3m-deposit-from-exchange-view></w3m-deposit-from-exchange-view>`;case"PayWithExchangeSelectAsset":return c`<w3m-deposit-from-exchange-select-asset-view></w3m-deposit-from-exchange-select-asset-view>`;case"UsageExceeded":return c`<w3m-usage-exceeded-view></w3m-usage-exceeded-view>`;case"SmartAccountSettings":return c`<w3m-smart-account-settings-view></w3m-smart-account-settings-view>`;default:return c`<w3m-connect-view></w3m-connect-view>`}}};Le.styles=[Ti];St([m()],Le.prototype,"viewState",void 0);St([m()],Le.prototype,"history",void 0);Le=St([k("w3m-router")],Le);const Ai=I`
  :host {
    z-index: ${({tokens:e})=>e.core.zIndex};
    display: block;
    backface-visibility: hidden;
    will-change: opacity;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    opacity: 0;
    background-color: ${({tokens:e})=>e.theme.overlay};
    backdrop-filter: blur(0px);
    transition:
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      backdrop-filter ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
  }

  :host(.open) {
    opacity: 1;
    backdrop-filter: blur(8px);
  }

  :host(.appkit-modal) {
    position: relative;
    pointer-events: unset;
    background: none;
    width: 100%;
    opacity: 1;
  }

  wui-card {
    max-width: var(--apkt-modal-width);
    width: 100%;
    position: relative;
    outline: none;
    transform: translateY(4px);
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.05);
    transition:
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]};
    will-change: border-radius, background-color, transform, box-shadow;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    padding: var(--local-modal-padding);
    box-sizing: border-box;
  }

  :host(.open) wui-card {
    transform: translateY(0px);
  }

  wui-card::before {
    z-index: 1;
    pointer-events: none;
    content: '';
    position: absolute;
    inset: 0;
    border-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    transition: box-shadow ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    transition-delay: ${({durations:e})=>e.md};
    will-change: box-shadow;
  }

  :host([data-mobile-fullscreen='true']) wui-card::before {
    border-radius: 0px;
  }

  :host([data-border='true']) wui-card::before {
    box-shadow: inset 0px 0px 0px 4px ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  :host([data-border='false']) wui-card::before {
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.borderPrimaryDark};
  }

  :host([data-border='true']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-border var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  :host([data-border='false']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-default var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: 0s;
  }

  :host(.appkit-modal) wui-card {
    max-width: var(--apkt-modal-width);
  }

  wui-card[shake='true'] {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      w3m-shake ${({durations:e})=>e.xl}
        ${({easings:e})=>e["ease-out-power-2"]};
  }

  wui-flex {
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 700px) and (min-width: 431px) {
    wui-flex {
      align-items: flex-start;
    }

    wui-card {
      margin: var(--apkt-spacing-6) 0px;
    }
  }

  @media (max-width: 430px) {
    :host([data-mobile-fullscreen='true']) {
      height: 100dvh;
    }
    :host([data-mobile-fullscreen='true']) wui-flex {
      align-items: stretch;
    }
    :host([data-mobile-fullscreen='true']) wui-card {
      max-width: 100%;
      height: 100%;
      border-radius: 0;
      border: none;
    }
    :host(:not([data-mobile-fullscreen='true'])) wui-flex {
      align-items: flex-end;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card {
      max-width: 100%;
      border-bottom: none;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card[data-embedded='true'] {
      border-bottom-left-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
      border-bottom-right-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card:not([data-embedded='true']) {
      border-bottom-left-radius: 0px;
      border-bottom-right-radius: 0px;
    }

    wui-card[shake='true'] {
      animation: w3m-shake 0.5s ${({easings:e})=>e["ease-out-power-2"]};
    }
  }

  @keyframes fade-in {
    0% {
      transform: scale(0.99) translateY(4px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes w3m-shake {
    0% {
      transform: scale(1) rotate(0deg);
    }
    20% {
      transform: scale(1) rotate(-1deg);
    }
    40% {
      transform: scale(1) rotate(1.5deg);
    }
    60% {
      transform: scale(1) rotate(-1.5deg);
    }
    80% {
      transform: scale(1) rotate(1deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes card-background-border {
    from {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  @keyframes card-background-default {
    from {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
  }
`;var ae=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const Wt="scroll-lock",Si={PayWithExchange:"0",PayWithExchangeSelectAsset:"0",Pay:"0",PayQuote:"0",PayLoading:"0"};class te extends S{constructor(){super(),this.unsubscribe=[],this.abortController=void 0,this.hasPrefetched=!1,this.enableEmbedded=P.state.enableEmbedded,this.open=L.state.open,this.caipAddress=y.state.activeCaipAddress,this.caipNetwork=y.state.activeCaipNetwork,this.shake=L.state.shake,this.filterByNamespace=B.state.filterByNamespace,this.padding=Ne.spacing[1],this.mobileFullScreen=P.state.enableMobileFullScreen,this.initializeTheming(),Fe.prefetchAnalyticsConfig(),this.unsubscribe.push(L.subscribeKey("open",t=>t?this.onOpen():this.onClose()),L.subscribeKey("shake",t=>this.shake=t),y.subscribeKey("activeCaipNetwork",t=>this.onNewNetwork(t)),y.subscribeKey("activeCaipAddress",t=>this.onNewAddress(t)),P.subscribeKey("enableEmbedded",t=>this.enableEmbedded=t),B.subscribeKey("filterByNamespace",t=>{var n;this.filterByNamespace!==t&&!((n=y.getAccountData(t))!=null&&n.caipAddress)&&(Fe.fetchRecommendedWallets(),this.filterByNamespace=t)}),f.subscribeKey("view",()=>{var t;this.dataset.border=$e.hasFooter()?"true":"false",this.padding=(t=Si[f.state.view])!=null?t:Ne.spacing[1]}))}firstUpdated(){if(this.dataset.border=$e.hasFooter()?"true":"false",this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.caipAddress){if(this.enableEmbedded){L.close(),this.prefetch();return}this.onNewAddress(this.caipAddress)}this.open&&this.onOpen(),this.enableEmbedded&&this.prefetch()}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),this.onRemoveKeyboardListener()}render(){return this.style.setProperty("--local-modal-padding",this.padding),this.enableEmbedded?c`${this.contentTemplate()}
        <w3m-tooltip></w3m-tooltip> `:this.open?c`
          <wui-flex @click=${this.onOverlayClick.bind(this)} data-testid="w3m-modal-overlay">
            ${this.contentTemplate()}
          </wui-flex>
          <w3m-tooltip></w3m-tooltip>
        `:null}contentTemplate(){return c` <wui-card
      shake="${this.shake}"
      data-embedded="${A(this.enableEmbedded)}"
      role="alertdialog"
      aria-modal="true"
      tabindex="0"
      data-testid="w3m-modal-card"
    >
      <w3m-header></w3m-header>
      <w3m-router></w3m-router>
      <w3m-footer></w3m-footer>
      <w3m-snackbar></w3m-snackbar>
      <w3m-alertbar></w3m-alertbar>
    </wui-card>`}async onOverlayClick(t){if(t.target===t.currentTarget){if(this.mobileFullScreen)return;await this.handleClose()}}async handleClose(){await qt.safeClose()}initializeTheming(){const{themeVariables:t,themeMode:n}=tn.state,o=Je.getColorTheme(n);nn(t,o)}onClose(){this.open=!1,this.classList.remove("open"),this.onScrollUnlock(),E.hide(),this.onRemoveKeyboardListener()}onOpen(){this.open=!0,this.classList.add("open"),this.onScrollLock(),this.onAddKeyboardListener()}onScrollLock(){const t=document.createElement("style");t.dataset.w3m=Wt,t.textContent=`
      body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: contain;
      }
      w3m-modal {
        pointer-events: auto;
      }
    `,document.head.appendChild(t)}onScrollUnlock(){const t=document.head.querySelector(`style[data-w3m="${Wt}"]`);t&&t.remove()}onAddKeyboardListener(){var n;this.abortController=new AbortController;const t=(n=this.shadowRoot)==null?void 0:n.querySelector("wui-card");t==null||t.focus(),window.addEventListener("keydown",o=>{if(o.key==="Escape")this.handleClose();else if(o.key==="Tab"){const{tagName:r}=o.target;r&&!r.includes("W3M-")&&!r.includes("WUI-")&&(t==null||t.focus())}},this.abortController)}onRemoveKeyboardListener(){var t;(t=this.abortController)==null||t.abort(),this.abortController=void 0}async onNewAddress(t){const n=y.state.isSwitchingNamespace,o=f.state.view==="ProfileWallets";!t&&!n&&!o&&L.close(),await zt.initializeIfEnabled(t),this.caipAddress=t,y.setIsSwitchingNamespace(!1)}onNewNetwork(t){var w,T;const n=this.caipNetwork,o=(w=n==null?void 0:n.caipNetworkId)==null?void 0:w.toString(),r=(T=t==null?void 0:t.caipNetworkId)==null?void 0:T.toString(),i=o!==r,s=f.state.view==="UnsupportedChain",a=L.state.open;let d=!1;this.enableEmbedded&&f.state.view==="SwitchNetwork"&&(d=!0),i&&g.resetState(),a&&s&&(d=!0),d&&f.state.view!=="SIWXSignMessage"&&f.goBack(),this.caipNetwork=t}prefetch(){this.hasPrefetched||(Fe.prefetch(),Fe.fetchWalletsByPage({page:1}),this.hasPrefetched=!0)}}te.styles=Ai;ae([p({type:Boolean})],te.prototype,"enableEmbedded",void 0);ae([m()],te.prototype,"open",void 0);ae([m()],te.prototype,"caipAddress",void 0);ae([m()],te.prototype,"caipNetwork",void 0);ae([m()],te.prototype,"shake",void 0);ae([m()],te.prototype,"filterByNamespace",void 0);ae([m()],te.prototype,"padding",void 0);ae([m()],te.prototype,"mobileFullScreen",void 0);let Dt=class extends te{};Dt=ae([k("w3m-modal")],Dt);let Lt=class extends te{};Lt=ae([k("appkit-modal")],Lt);const Ii=I`
  .icon-box {
    width: 64px;
    height: 64px;
    border-radius: ${({borderRadius:e})=>e[5]};
    background-color: ${({colors:e})=>e.semanticError010};
  }
`;var Ei=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let pt=class extends S{constructor(){super()}render(){return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        gap="4"
        .padding="${["1","3","4","3"]}"
      >
        <wui-flex justifyContent="center" alignItems="center" class="icon-box">
          <wui-icon size="xxl" color="error" name="warningCircle"></wui-icon>
        </wui-flex>

        <wui-text variant="lg-medium" color="primary" align="center">
          The app isn't responding as expected
        </wui-text>
        <wui-text variant="md-regular" color="secondary" align="center">
          Try again or reach out to the app team for help.
        </wui-text>

        <wui-button
          variant="neutral-secondary"
          size="md"
          @click=${this.onTryAgainClick.bind(this)}
          data-testid="w3m-usage-exceeded-button"
        >
          <wui-icon color="inherit" slot="iconLeft" name="refresh"></wui-icon>
          Try Again
        </wui-button>
      </wui-flex>
    `}onTryAgainClick(){f.goBack()}};pt.styles=Ii;pt=Ei([k("w3m-usage-exceeded-view")],pt);const Ci=I`
  :host {
    width: 100%;
  }
`;var W=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};let O=class extends S{constructor(){super(...arguments),this.hasImpressionSent=!1,this.walletImages=[],this.imageSrc="",this.name="",this.size="md",this.tabIdx=void 0,this.disabled=!1,this.showAllWallets=!1,this.loading=!1,this.loadingSpinnerColor="accent-100",this.rdnsId="",this.displayIndex=void 0,this.walletRank=void 0,this.namespaces=[]}connectedCallback(){super.connectedCallback()}disconnectedCallback(){super.disconnectedCallback(),this.cleanupIntersectionObserver()}updated(t){super.updated(t),(t.has("name")||t.has("imageSrc")||t.has("walletRank"))&&(this.hasImpressionSent=!1),t.has("walletRank")&&this.walletRank&&!this.intersectionObserver&&this.setupIntersectionObserver()}setupIntersectionObserver(){this.intersectionObserver=new IntersectionObserver(t=>{t.forEach(n=>{n.isIntersecting&&!this.loading&&!this.hasImpressionSent&&this.sendImpressionEvent()})},{threshold:.1}),this.intersectionObserver.observe(this)}cleanupIntersectionObserver(){this.intersectionObserver&&(this.intersectionObserver.disconnect(),this.intersectionObserver=void 0)}sendImpressionEvent(){!this.name||this.hasImpressionSent||!this.walletRank||(this.hasImpressionSent=!0,(this.rdnsId||this.name)&&V.sendWalletImpressionEvent({name:this.name,walletRank:this.walletRank,rdnsId:this.rdnsId,view:f.state.view,displayIndex:this.displayIndex}))}handleGetWalletNamespaces(){return Object.keys(on.state.adapters).length>1?this.namespaces:[]}render(){return c`
      <wui-list-wallet
        .walletImages=${this.walletImages}
        imageSrc=${A(this.imageSrc)}
        name=${this.name}
        size=${A(this.size)}
        tagLabel=${A(this.tagLabel)}
        .tagVariant=${this.tagVariant}
        .walletIcon=${this.walletIcon}
        .tabIdx=${this.tabIdx}
        .disabled=${this.disabled}
        .showAllWallets=${this.showAllWallets}
        .loading=${this.loading}
        loadingSpinnerColor=${this.loadingSpinnerColor}
        .namespaces=${this.handleGetWalletNamespaces()}
      ></wui-list-wallet>
    `}};O.styles=Ci;W([p({type:Array})],O.prototype,"walletImages",void 0);W([p()],O.prototype,"imageSrc",void 0);W([p()],O.prototype,"name",void 0);W([p()],O.prototype,"size",void 0);W([p()],O.prototype,"tagLabel",void 0);W([p()],O.prototype,"tagVariant",void 0);W([p()],O.prototype,"walletIcon",void 0);W([p()],O.prototype,"tabIdx",void 0);W([p({type:Boolean})],O.prototype,"disabled",void 0);W([p({type:Boolean})],O.prototype,"showAllWallets",void 0);W([p({type:Boolean})],O.prototype,"loading",void 0);W([p({type:String})],O.prototype,"loadingSpinnerColor",void 0);W([p()],O.prototype,"rdnsId",void 0);W([p()],O.prototype,"displayIndex",void 0);W([p()],O.prototype,"walletRank",void 0);W([p({type:Array})],O.prototype,"namespaces",void 0);O=W([k("w3m-list-wallet")],O);const Pi=I`
  :host {
    --local-duration-height: 0s;
    --local-duration: ${({durations:e})=>e.lg};
    --local-transition: ${({easings:e})=>e["ease-out-power-2"]};
  }

  .container {
    display: block;
    overflow: hidden;
    overflow: hidden;
    position: relative;
    height: var(--local-container-height);
    transition: height var(--local-duration-height) var(--local-transition);
    will-change: height, padding-bottom;
  }

  .container[data-mobile-fullscreen='true'] {
    overflow: scroll;
  }

  .page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    width: inherit;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-bottom-left-radius: var(--local-border-bottom-radius);
    border-bottom-right-radius: var(--local-border-bottom-radius);
    transition: border-bottom-left-radius var(--local-duration) var(--local-transition);
  }

  .page[data-mobile-fullscreen='true'] {
    height: 100%;
  }

  .page-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .footer {
    height: var(--apkt-footer-height);
  }

  div.page[view-direction^='prev-'] .page-content {
    animation:
      slide-left-out var(--local-duration) forwards var(--local-transition),
      slide-left-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  div.page[view-direction^='next-'] .page-content {
    animation:
      slide-right-out var(--local-duration) forwards var(--local-transition),
      slide-right-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  @keyframes slide-left-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-left-in {
    from {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes slide-right-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-right-in {
    from {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }
`;var ce=function(e,t,n,o){var r=arguments.length,i=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(i=(r<3?s(i):r>3?s(t,n,i):s(t,n))||i);return r>3&&i&&Object.defineProperty(t,n,i),i};const $i=60;let X=class extends S{constructor(){super(...arguments),this.resizeObserver=void 0,this.transitionDuration="0.15s",this.transitionFunction="",this.history="",this.view="",this.setView=void 0,this.viewDirection="",this.historyState="",this.previousHeight="0px",this.mobileFullScreen=P.state.enableMobileFullScreen,this.onViewportResize=()=>{this.updateContainerHeight()}}updated(t){if(t.has("history")){const n=this.history;this.historyState!==""&&this.historyState!==n&&this.onViewChange(n)}t.has("transitionDuration")&&this.style.setProperty("--local-duration",this.transitionDuration),t.has("transitionFunction")&&this.style.setProperty("--local-transition",this.transitionFunction)}firstUpdated(){var t;this.transitionFunction&&this.style.setProperty("--local-transition",this.transitionFunction),this.style.setProperty("--local-duration",this.transitionDuration),this.historyState=this.history,this.resizeObserver=new ResizeObserver(n=>{var o;for(const r of n)if(r.target===this.getWrapper()){let i=r.contentRect.height;const s=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0");if(this.mobileFullScreen){const a=((o=window.visualViewport)==null?void 0:o.height)||window.innerHeight,d=this.getHeaderHeight();i=a-d-s,this.style.setProperty("--local-border-bottom-radius","0px")}else i=i+s,this.style.setProperty("--local-border-bottom-radius",s?"var(--apkt-borderRadius-5)":"0px");this.style.setProperty("--local-container-height",`${i}px`),this.previousHeight!=="0px"&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${i}px`}}),this.resizeObserver.observe(this.getWrapper()),this.updateContainerHeight(),window.addEventListener("resize",this.onViewportResize),(t=window.visualViewport)==null||t.addEventListener("resize",this.onViewportResize)}disconnectedCallback(){var n;const t=this.getWrapper();t&&this.resizeObserver&&this.resizeObserver.unobserve(t),window.removeEventListener("resize",this.onViewportResize),(n=window.visualViewport)==null||n.removeEventListener("resize",this.onViewportResize)}render(){return c`
      <div class="container" data-mobile-fullscreen="${A(this.mobileFullScreen)}">
        <div
          class="page"
          data-mobile-fullscreen="${A(this.mobileFullScreen)}"
          view-direction="${this.viewDirection}"
        >
          <div class="page-content">
            <slot></slot>
          </div>
        </div>
      </div>
    `}onViewChange(t){const n=t.split(",").filter(Boolean),o=this.historyState.split(",").filter(Boolean),r=o.length,i=n.length,s=n[n.length-1]||"",a=Je.cssDurationToNumber(this.transitionDuration);let d="";i>r?d="next":i<r?d="prev":i===r&&n[i-1]!==o[r-1]&&(d="next"),this.viewDirection=`${d}-${s}`,setTimeout(()=>{var w;this.historyState=t,(w=this.setView)==null||w.call(this,s)},a),setTimeout(()=>{this.viewDirection=""},a*2)}getWrapper(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector("div.page")}updateContainerHeight(){var r;const t=this.getWrapper();if(!t)return;const n=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0");let o=0;if(this.mobileFullScreen){const i=((r=window.visualViewport)==null?void 0:r.height)||window.innerHeight,s=this.getHeaderHeight();o=i-s-n,this.style.setProperty("--local-border-bottom-radius","0px")}else o=t.getBoundingClientRect().height+n,this.style.setProperty("--local-border-bottom-radius",n?"var(--apkt-borderRadius-5)":"0px");this.style.setProperty("--local-container-height",`${o}px`),this.previousHeight!=="0px"&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${o}px`}getHeaderHeight(){return $i}};X.styles=[Pi];ce([p({type:String})],X.prototype,"transitionDuration",void 0);ce([p({type:String})],X.prototype,"transitionFunction",void 0);ce([p({type:String})],X.prototype,"history",void 0);ce([p({type:String})],X.prototype,"view",void 0);ce([p({attribute:!1})],X.prototype,"setView",void 0);ce([m()],X.prototype,"viewDirection",void 0);ce([m()],X.prototype,"historyState",void 0);ce([m()],X.prototype,"previousHeight",void 0);ce([m()],X.prototype,"mobileFullScreen",void 0);X=ce([k("w3m-router-container")],X);export{Lt as AppKitModal,O as W3mListWallet,Dt as W3mModal,te as W3mModalBase,X as W3mRouterContainer,pt as W3mUsageExceededView};
