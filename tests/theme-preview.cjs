// Local-only visual fixture: never connects to Supabase, Backend or payment providers.
// Run: node tests/theme-preview.cjs; open http://127.0.0.1:3107/checkout?theme=light
const http = require('node:http');
const {spawn} = require('node:child_process');
const path = require('node:path');
const server = http.createServer(async (req,res) => {
  let text='';for await(const part of req) text+=part;
  let body={};try{body=JSON.parse(text);}catch{}
  let result;
  if(req.url==='/config/gateway') result={config:{ORDER_UPDATE_HMAC:'local-fixture-only',GATEWAY_REDEEM_KEY:'local-fixture-only'}};
  if(req.url==='/gateway/giftcards/availability') result={available:true};
  if(req.url.startsWith('/gateway/giftcards/') && req.method==='GET' && !req.url.endsWith('/availability')) {
    const ending=req.url.slice(-1);
    const state=({'4':'verified','5':'review','6':'uncertain'})[ending];
    result={orderNumber:12345,status:state==='verified'?'pending':state?'processing':'awaiting_payment',planName:'Starter',planPrice:20,connections:1,
      customerEmail:'customer@example.invalid',sessionExpiresAt:new Date(Date.now()+2*60*60*1000).toISOString(),serverNow:new Date().toISOString(),redemptionAvailable:true,
      ...(state?{redemption:{state,reason:state==='review'?'underpaid':'interrupted',codeLast4:'A123',...(state!=='uncertain'?{faceValue:state==='verified'?20:15,currency:'USD'}:{})}}:{})};
  }
  if(req.url==='/rest/v1/rpc/get_public_site_config') result={site_name:'preview',display_name:'Checkout Preview',theme_bg_color:'#0c0c0e',theme_accent_color:'#c9a96e'};
  if(req.url==='/rest/v1/rpc/get_site_plan_prices') result=['1-month','3-months','6-months','12-months'].map((id,i)=>({plan_id:id,original:20+i*15,final:20+i*15,amount_off:0}));
  if(req.url==='/rest/v1/rpc/checkout_dispatch') {
    if(body.p_action==='issue_payment_challenge') result={token:'fixture-token',difficulty:0,captcha_required:false};
    if(body.p_action==='giftcard_links') result=[{site_name:'preview',giftcard_link1:['https://example.invalid/gift-card']}];
    if(body.p_action==='get_order_public') {
      const payload=JSON.parse(body.p_payload);
      result={id:payload.p_order_id,order_number:12345,status:payload.p_order_id.endsWith('3')?'cancelled':'awaiting_payment',plan_name:'Starter',plan_id:'1-month',site_name:'preview',plan_price:20,connections:1,
        payment_method:['2','4','5','6'].includes(payload.p_order_id.slice(-1))?'giftcard':'paypal',customer_email:'customer@example.invalid',paypal_email:'merchant@example.invalid',
        session_expires_at:new Date(Date.now()+25*60*1000).toISOString(),server_now:new Date().toISOString()};
    }
  }
  res.writeHead(result===undefined?503:200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(result??{error:'Preview blocks all unlisted operations'}));
});
server.listen(3108,'127.0.0.1',()=>{
  const child=spawn(process.execPath,[path.join(__dirname,'../node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3107'],{
    cwd:path.join(__dirname,'..'),stdio:'inherit',windowsHide:true,
    env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3108',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',
      BACKEND_URL:'http://127.0.0.1:3108',BACKEND_CONFIG_KEY:'fixture-config-key',ORDER_UPDATE_HMAC:'local-fixture-only',
      NEXT_TELEMETRY_DISABLED:'1',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'},
  });
  const stop=()=>{child.kill();server.close();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  child.on('exit',()=>server.close());
});
