const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code, {exports, URL, URLSearchParams, Headers, ...globals,
    require: name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('/checkout-theme')) return load('app/lib/checkout-theme.ts', {}, globals);
      if (name === './lib/theme') return load('app/lib/theme.ts');
      if (name.endsWith('.css')) return {};
      throw Error('Unmocked import '+name);
    },
  });
  return exports;
}
const theme = load('app/lib/checkout-theme.ts');
const palette = load('app/lib/theme.ts');

test('theme URL input is allowlisted, case insensitive, and does not persist between visits', () => {
  for (const value of ['light','Light',' LIGHT ']) assert.equal(theme.parseCheckoutTheme(value),'light');
  for (const value of [null,undefined,'auto','white','<script>']) assert.equal(theme.parseCheckoutTheme(value),null);
  assert.equal(theme.parseCheckoutTheme('dark'),'dark');
});
test('internal transitions preserve identifiers, language, retry, hash and explicit dark', () => {
  for (const target of ['/checkout/payment-status','/checkout/paypal-pending','/checkout/giftcard-pending','/checkout','/']) {
    const result = new URL(theme.withCheckoutTheme(target+'?orderId=fixture&lang=ar&retry=1#details','light'),'https://checkout.invalid');
    assert.equal(result.searchParams.get('theme'),'light');
    assert.equal(result.searchParams.get('orderId'),'fixture');
    assert.equal(result.searchParams.get('lang'),'ar');
    assert.equal(result.hash,'#details');
  }
  assert.equal(theme.withCheckoutTheme('/checkout?theme=dark','light'),'/checkout?theme=dark');
  assert.equal(theme.withCheckoutTheme('/checkout?plan=1',null),'/checkout?plan=1');
  for (const href of ['https://provider.test?token=secret','//provider.test','/\\provider.test','mailto:support@test.invalid']) {
    assert.equal(theme.withCheckoutTheme(href,'light'),href);
  }
});
test('server proxy replaces untrusted theme headers using only query choice', () => {
  const proxy=load('proxy.ts',{'next/server':{NextResponse:{next:opts=>opts}}});
  for(const [query,expected] of [['?theme=Light','light'],['',''],['?theme=unknown','']]) {
    const result=proxy.proxy({headers:new Headers({'x-checkout-theme':'light'}),nextUrl:new URL('https://checkout.invalid/checkout'+query)});
    assert.equal(result.request.headers.get(theme.THEME_HEADER),expected);
  }
});
test('first server HTML is white without browser JavaScript; dark/default stays unchanged', async () => {
  for(const mode of ['light','dark','']) {
    const layout=load('app/layout.tsx',{
      'next/headers':{headers:async()=>new Headers({[theme.THEME_HEADER]:mode})},
      'next/font/google':{Inter:()=>({variable:'fixture-font'})},
      './lib/site':{getSiteConfigForRequest:async()=>({site:'brand',config:{site_name:'brand',theme_bg_color:'#0c0c0e',theme_accent_color:'#c9a96e'}})},
    });
    const html=renderToStaticMarkup(await layout.default({children:React.createElement('main',null,'Checkout')}));
    assert.match(html,new RegExp('data-checkout-theme="'+(mode==='light'?'light':'dark')+'"'));
    assert.match(html,new RegExp('--bg-primary:'+(mode==='light'?'#ffffff':'#0c0c0e')));
    assert.match(html,/<meta name="color-scheme"/);
    assert.ok(html.indexOf('--bg-primary:')<html.indexOf('<body>'));
    assert.doesNotMatch(html,/localStorage|sessionStorage|document\.cookie/);
  }
});
const lum=hex=>hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
test('light labels and primary button text meet AA contrast; dark brand accent is preserved', () => {
  for(const accent of ['#c9a96e','#ffffff','#eeee00','#00ffff','#111111','#ef44ff']) {
    const vars=palette.deriveThemeVars('#ffffff',accent);
    assert.equal(vars['--bg-primary'],'#ffffff');
    assert.ok(contrast(vars['--accent'],vars['--bg-hover'])>=4.5);
    assert.ok(contrast(vars['--accent'],vars['--on-accent'])>=4.5);
    for(const key of ['--text-primary','--text-secondary','--text-tertiary','--text-muted','--success','--error','--warning']) assert.ok(contrast(vars[key],'#ffffff')>=4.5,key);
  }
  const dark=palette.deriveThemeVars('#0c0c0e','#c9a96e');
  assert.equal(dark['--accent'],'#c9a96e');
  assert.equal(dark['--text-primary'],'#e8e6e1');
});
test('router wrapper preserves theme on push and replace including provider Back recovery', () => {
  const calls=[];
  const hook=load('app/lib/use-checkout-router.ts',{
    react:{useMemo:fn=>fn()},
    'next/navigation':{useRouter:()=>({push:(...a)=>calls.push(a),replace:(...a)=>calls.push(a)})},
  },{window:{location:{search:'?theme=light&plan=1-month'}}});
  const router=hook.useCheckoutRouter();
  router.push('/checkout/paypal-pending?orderId=fixture');
  router.replace('/checkout/payment-status?orderId=fixture&method=card-crypto');
  assert.ok(calls.every(([href])=>new URL(href,'https://checkout.invalid').searchParams.get('theme')==='light'));
});
