"""Browser test for the IPv4 Settings tab and sidebar modes.
Run:  pip install playwright && playwright install chromium && python tests/settings_smoke.py
Exits non-zero if any check fails.
"""
from playwright.sync_api import sync_playwright
import os, sys, json, tempfile
URL='file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
fails=[]
def check(name,cond,extra=''):
    print(('PASS' if cond else 'FAIL'),name,extra)
    if not cond: fails.append(name)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1440,'height':900}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None)
    pg.goto(URL); pg.wait_for_timeout(400)
    attr=lambda a: pg.evaluate(f"document.documentElement.getAttribute('{a}')")
    # nav + settings page
    check('Settings nav item exists', pg.locator('.nav-btn[data-section="settings"]').count()==1)
    check('5 menu groups', pg.locator('.nav-group-head').count()==5)
    pg.click('.nav-btn[data-section="settings"]'); pg.wait_for_timeout(200)
    check('settings section active', pg.evaluate("document.getElementById('sec-settings').classList.contains('active')"))
    check('header title Settings', pg.inner_text('#portal-page-name')=='Settings', pg.inner_text('#portal-page-name'))
    check('no pager on settings', pg.locator('#sec-settings .pager').count()==0)
    check('hash is #settings', pg.evaluate("location.hash")=='#settings')
    # pager on resources must not link to settings
    pg.click('.nav-btn[data-section="resources"]'); pg.wait_for_timeout(150)
    check('resources has no Next -> settings', pg.locator('#sec-resources .pager-next').count()==0)
    pg.click('#settings-open'); pg.wait_for_timeout(150)
    check('header gear opens settings', pg.evaluate("document.getElementById('sec-settings').classList.contains('active')"))
    # theme
    pg.click('[data-setting="theme"] [data-value="dark"]'); check('theme dark',attr('data-theme')=='dark')
    pg.click('#theme-toggle'); check('header toggle -> light & setting synced', attr('data-theme')=='light' and pg.evaluate("VLab.Settings.get().theme")=='light')
    pg.click('[data-setting="theme"] [data-value="light"]')
    # accent
    pg.click('[data-setting="accent"] [data-value="teal"]'); check('accent teal',attr('data-accent')=='teal')
    acc=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()"); check('accent var changed', acc.startswith('hsl(') , acc)
    pg.click('[data-setting="accent"] [data-value="indigo"]'); check('indigo restores original', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")=='#4258ff')
    # text size, contrast, motion
    pg.click('[data-setting="text"] [data-value="large"]'); check('text large', attr('data-text')=='large' and pg.evaluate("getComputedStyle(document.documentElement).fontSize")=='18px')
    pg.click('[data-setting="text"] [data-value="medium"]')
    pg.click('[data-setting="contrastHigh"]'); check('high contrast', attr('data-contrast')=='high')
    pg.click('[data-setting="contrastHigh"]')
    pg.click('[data-setting="motion"] [data-value="on"]'); check('reduce motion', attr('data-motion')=='reduce')
    pg.click('[data-setting="motion"] [data-value="off"]'); check('motion full', attr('data-motion')=='full')
    # sidebar modes
    pg.click('[data-setting="sidebar"] [data-value="compact"]'); pg.wait_for_timeout(450)
    w=pg.evaluate("document.getElementById('sidebar').getBoundingClientRect().width"); check('compact width ~78',abs(w-78)<3,str(w))
    check('compact: nav labels hidden visually', pg.evaluate("getComputedStyle(document.querySelector('.nav-btn[data-section=\"home\"]')).fontSize")=='0px')
    check('compact: collapse arrow says expand', 'Expand' in pg.get_attribute('#sb-collapse','aria-label'))
    pg.click('#sb-collapse'); pg.wait_for_timeout(450)
    w=pg.evaluate("document.getElementById('sidebar').getBoundingClientRect().width"); check('expanded width ~288',abs(w-288)<3,str(w))
    pg.keyboard.press('Escape'); pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press('b'); pg.wait_for_timeout(450); check('B hides sidebar', attr('data-sidebar')=='hidden' and pg.evaluate("document.getElementById('sidebar').inert"))
    cw=pg.evaluate("document.getElementById('main').getBoundingClientRect().width"); check('content full width when hidden', cw>=1430, str(cw))
    pg.click('#sb-toggle'); pg.wait_for_timeout(450); check('header toggle shows sidebar', attr('data-sidebar')=='expanded')
    # groups collapse
    pg.click('.nav-group-head[data-group="lab"] .nav-toggle'); pg.wait_for_timeout(100)
    check('group closes', pg.evaluate("document.querySelector('.nav-btn[data-section=\"setup\"]').parentNode.hidden"))
    check('closed group remembered', pg.evaluate("VLab.Settings.get().groups.lab")==True)
    pg.reload(); pg.wait_for_timeout(300)
    check('closed group persists after reload', pg.evaluate("document.querySelector('.nav-btn[data-section=\"setup\"]').parentNode.hidden"))
    pg.evaluate("document.querySelector('.nav-btn[data-section=\"settings\"]').click()"); pg.wait_for_timeout(100)
    pg.click('#btn-expand-groups'); check('expand all groups', pg.evaluate("!document.querySelector('.nav-btn[data-section=\"setup\"]').parentNode.hidden"))
    # navigating into a closed group re-opens it
    pg.click('.nav-group-head[data-group="lab"] .nav-toggle')
    pg.evaluate("VLab.App.showSection('setup')"); check('open page never hidden in closed group', pg.evaluate("!document.querySelector('.nav-btn[data-section=\"setup\"]').parentNode.hidden"))
    # course card / voice / workings / log
    pg.click('.nav-btn[data-section="settings"]'); pg.wait_for_timeout(100)
    pg.click('[data-setting="showCourse"]'); check('course card hidden', not pg.is_visible('.sidebar-course'))
    pg.click('[data-setting="showCourse"]')
    pg.click('[data-setting="showVoice"]'); check('voice hidden', not pg.is_visible('.voice-panel'))
    pg.click('[data-setting="showVoice"]')
    # persistence of settings
    pg.click('.nav-btn[data-section="settings"]'); pg.wait_for_timeout(100)
    pg.click('[data-setting="accent"] [data-value="violet"]'); pg.click('[data-setting="idFormat"] [data-value="hex"]'); pg.click('[data-setting="ttl"] [data-value="128"]')
    pg.fill('[data-setting="timeout"]','30'); pg.press('[data-setting="timeout"]','Tab')
    pg.reload(); pg.wait_for_timeout(300)
    check('accent persists', attr('data-accent')=='violet'); s=pg.evaluate("VLab.Settings.get()")
    pg.click('#btn-expand-groups')
    check('protocol values persist', s['idFormat']=='hex' and s['ttl']==128 and s['timeout']==30, str(s))
    # simulation uses the settings
    pg.click('.nav-btn[data-section="setup"]'); pg.click('#btn-simulate'); pg.wait_for_timeout(300)
    r=pg.evaluate("VLab.App.getState().result")
    check('TTL setting reaches the engine', r['original']['ttl']==128, str(r['original']['ttl']))
    check('forwarded TTL decremented', r['packets'][1]['ttl']==127 if len(r['packets'])>1 else True, str([x['ttl'] for x in r['packets']]))
    check('identification shown in hex in summary', pg.evaluate("/0x[0-9A-F]{4}/.test(document.getElementById('sim-summary').textContent)"), pg.inner_text('#sim-summary')[:120])
    check('autoStart default plays', pg.evaluate("VLab.Animation.getState()")in('running','stepping'))
    pg.click('#btn-sim-reset')
    pg.click('.nav-btn[data-section="inspector"]'); pg.wait_for_timeout(300)
    txt=pg.inner_text('#sec-inspector'); check('inspector: hex main + decimal caption', '0x' in txt)
    # reassembler timeout
    pg.click('.nav-btn[data-section="reassembly"]'); pg.wait_for_timeout(200)
    check('reassembler timeout 30 s', pg.evaluate("VLab.App.getState().re.reassembler.timeoutMs")==30000)
    check('timeout note updated', '30 s' in pg.inner_text('#re-note'), pg.inner_text('#re-note'))
    # speed sync both ways
    pg.click('.nav-btn[data-section="settings"]'); pg.evaluate("var s=document.querySelector('[data-setting=speed]'); s.value=2.5; s.dispatchEvent(new Event('input',{bubbles:true}))")
    check('settings speed -> slider', pg.evaluate("document.getElementById('sim-speed').value")=='2.5')
    pg.click('.nav-btn[data-section="simulation"]'); pg.click('.speed-presets [data-speed="0.5"]')
    check('slider -> settings speed', pg.evaluate("VLab.Settings.get().speed")==0.5)
    # autoStart off, workings/log hide
    pg.click('.nav-btn[data-section="settings"]')
    pg.click('[data-setting="autoStart"]'); pg.click('[data-setting="showWorkings"]'); pg.click('[data-setting="showLog"]')
    pg.click('.nav-btn[data-section="setup"]'); pg.click('#btn-simulate'); pg.wait_for_timeout(300)
    check('autoStart off: idle', pg.evaluate("VLab.Animation.getState()")=='idle')
    check('workings + log hidden', not pg.is_visible('#card-workings') and not pg.is_visible('#card-log'))
    # shortcuts off
    pg.click('.nav-btn[data-section="settings"]'); pg.click('[data-setting="shortcuts"]')
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press('2'); pg.wait_for_timeout(150); check('number shortcut disabled', pg.evaluate("document.getElementById('sec-settings').classList.contains('active')"))
    pg.click('[data-setting="shortcuts"]'); pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press('2'); pg.wait_for_timeout(150); check('number shortcut works when on', pg.evaluate("document.getElementById('sec-theory').classList.contains('active')"))
    pg.keyboard.press('0'); pg.wait_for_timeout(150); check('0 opens settings', pg.evaluate("document.getElementById('sec-settings').classList.contains('active')"))
    # progress
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    t=pg.inner_text('#sb-progress-title'); check('progress text', 'pages visited' in t or 'complete' in t, t)
    check('visited dots', pg.locator('.nav-btn.visited').count()>=3)
    pg.click('#btn-reset-progress'); check('clear progress', 'Ready' in pg.inner_text('#sb-progress-title'))
    # reset experiment values
    pg.click('.nav-btn[data-section="setup"]'); pg.fill('#in-size','2000'); pg.click('.nav-btn[data-section="settings"]'); pg.click('#btn-reset-config')
    check('reset values', pg.evaluate("document.getElementById('in-size').value")=='4000')
    # export/import
    with pg.expect_download() as d: pg.click('#btn-export')
    path=d.value.path(); data=json.load(open(path)); check('export has settings', data.get('accent')=='violet' and data.get('ttl')==128)
    data['accent']='green'; data['ttl']=255; imp=os.path.join(tempfile.gettempdir(),'dcn-imp.json'); open(imp,'w').write(json.dumps(data))
    pg.set_input_files('#file-import',imp); pg.wait_for_timeout(200)
    check('import applies', attr('data-accent')=='green' and pg.evaluate("VLab.Settings.get().ttl")==255)
    pg.once('dialog', lambda dl: dl.accept()); pg.click('#btn-reset-all'); pg.wait_for_timeout(200)
    check('reset all', attr('data-accent')=='indigo' and pg.evaluate("VLab.Settings.get().ttl")==64 and pg.evaluate("VLab.Settings.get().autoStart"))
    # palette
    pg.keyboard.press('Control+k'); pg.keyboard.type('sett'); pg.wait_for_timeout(100); check('palette finds Settings', 'Settings' in pg.inner_text('.cmdk-list')); pg.keyboard.press('Escape')
    # mobile drawer
    m=b.new_context(viewport={'width':390,'height':800}).new_page(); m.goto(URL); m.wait_for_timeout(300)
    check('mobile: sidebar inert when closed', m.evaluate("document.getElementById('sidebar').inert"))
    m.click('#menu-toggle'); m.wait_for_timeout(400)
    check('mobile: drawer open, menu button hidden', m.evaluate("!document.getElementById('sidebar').inert") and not m.is_visible('#menu-toggle'))
    check('mobile: close button visible', m.is_visible('#sb-close'))
    m.click('#sb-close'); m.wait_for_timeout(400); check('mobile: close works', m.evaluate("document.getElementById('sidebar').inert"))
    m.click('#menu-toggle'); m.wait_for_timeout(350); m.click('.nav-btn[data-section="settings"]'); m.wait_for_timeout(400)
    check('mobile: picking Settings closes drawer', m.evaluate("document.getElementById('sidebar').inert") and m.evaluate("document.getElementById('sec-settings').classList.contains('active')"))
    check('mobile: no sideways overflow', m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), m.evaluate("document.documentElement.scrollWidth"))
    real=[e for e in errs if 'favicon' not in e]
    check('no console errors', not real, str(real)[:300])
    b.close()
print('FAILS:',fails); sys.exit(1 if fails else 0)
