"""UI smoke test for the simulation page.
Run:  pip install playwright && playwright install chromium && python tests/ui_smoke.py
Exits non-zero if any check fails.
"""
from playwright.sync_api import sync_playwright
import os, sys
URL='file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
fails=[]
def check(name,cond,extra=''):
    print(('PASS' if cond else 'FAIL'),name,extra)
    if not cond: fails.append(name)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1440,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None)
    pg.goto(URL); pg.wait_for_timeout(400)
    st=lambda: pg.evaluate("VLab.Animation.getState()")
    dis=lambda: pg.evaluate("['start','pause','resume','step','reset'].map(x=>document.getElementById('btn-sim-'+x).disabled)")
    goto=lambda s:(pg.click(f'.nav-btn[data-section="{s}"]'),pg.wait_for_timeout(150))
    def speed(v): pg.evaluate(f"var s=document.getElementById('sim-speed'); s.value={v}; s.dispatchEvent(new Event('input',{{bubbles:true}}))")

    # 1 step mode -> resume plays the rest automatically
    goto('setup'); pg.click('[data-scenario="3"]'); pg.wait_for_timeout(300)
    pg.click('#btn-sim-reset'); pg.click('#btn-sim-step'); pg.wait_for_timeout(300)
    check('step mode: resume enabled',dis()[2]==False, str(dis()))
    speed(3); pg.click('#btn-sim-resume')
    pg.wait_for_function("VLab.Animation.getState()==='finished'",timeout=30000)
    check('step -> resume finishes automatically', st()=='finished')
    check('next-steps banner shown at finish', pg.evaluate("!document.getElementById('sim-next').hidden"))
    check('step enabled after finish (restart in step mode)', dis()[3]==False)
    # 2 tray + stepper end state
    check('all tray items arrived', pg.evaluate("Array.from(document.querySelectorAll('.tray-item')).every(i=>i.dataset.state==='arrived')"))
    check('all stepper items done', pg.evaluate("Array.from(document.querySelectorAll('.step')).every(i=>i.classList.contains('is-done'))"))
    check('buffer filled to total', pg.evaluate("document.querySelector('.buf-label').textContent")=='Buffer: 3980 of 3980 B')
    # 3 shortcuts
    pg.click('#btn-sim-reset'); pg.wait_for_timeout(100)
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    speed(1)
    pg.keyboard.press(' '); pg.wait_for_timeout(600); check('Space starts',st()=='running')
    pg.keyboard.press(' '); pg.wait_for_timeout(200); check('Space pauses',st()=='paused')
    pg.keyboard.press(' '); pg.wait_for_timeout(200); check('Space resumes',st()=='running')
    pg.keyboard.press('r'); pg.wait_for_timeout(200); check('R resets',st()=='idle')
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300); check('Right arrow steps',st()=='stepping')
    pg.click('#btn-sim-reset')
    # 4 auto-pause on leaving
    speed(1); pg.click('#btn-sim-start'); pg.wait_for_timeout(800)
    goto('theory'); pg.wait_for_timeout(300)
    check('auto-pause when leaving the page',st()=='paused')
    goto('simulation'); pg.wait_for_timeout(200)
    check('chip says paused',  'paused' in pg.inner_text('#sim-stage'), pg.inner_text('#sim-stage'))
    pg.click('#btn-sim-resume'); pg.wait_for_timeout(300); check('resumes after returning',st()=='running')
    pg.click('#btn-sim-reset')
    # 5 speed presets
    pg.click('.speed-presets [data-speed="2"]'); check('preset sets slider',pg.evaluate("document.getElementById('sim-speed').value")=='2')
    check('preset highlighted',pg.evaluate("document.querySelector('.speed-presets .is-active').dataset.speed")=='2')
    # 6 DF flow
    goto('setup'); pg.click('[data-scenario="4"]'); pg.wait_for_timeout(300); speed(3)
    pg.wait_for_function("VLab.Animation.getState()==='finished'",timeout=30000)
    check('DF: no tray', pg.evaluate("document.getElementById('frag-tray').hidden"))
    check('DF: outcome chip',  'Dropped' in pg.inner_text('#sim-summary'))
    pg.click('#sim-next-actions .btn.primary'); pg.wait_for_timeout(400)
    check('DF: clear-DF reruns as fragmentation', pg.evaluate("VLab.App.getState().result.status")=='fragmented' and pg.evaluate("VLab.App.getState().result.params.df")==0)
    speed(3); pg.wait_for_function("VLab.Animation.getState()==='finished'",timeout=30000)
    # 7 no-frag scenario
    goto('setup'); pg.click('[data-scenario="2"]'); pg.wait_for_timeout(300); speed(3)
    pg.wait_for_function("VLab.Animation.getState()==='finished'",timeout=30000)
    check('no-frag: tray hidden, banner offers inspector', pg.evaluate("document.getElementById('frag-tray').hidden") and 'Inspect' in pg.inner_text('#sim-next-actions'))
    # 8 many fragments: dense tray, labelled last fragment
    goto('setup')
    pg.evaluate("""(function(){var a=document.getElementById('in-size');a.value=6000;a.dispatchEvent(new Event('input',{bubbles:true}));var m=document.getElementById('in-mtu');m.value=300;m.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    pg.click('#btn-simulate'); pg.wait_for_timeout(300); speed(3)
    pg.wait_for_function("VLab.Animation.getState()==='finished'",timeout=40000)
    check('dense tray for 22 fragments', pg.evaluate("document.getElementById('frag-tray').classList.contains('is-dense')"))
    # last fragment label in the fan (22 fragments): wait for the header stage, when all fragments are drawn
    goto('setup'); pg.click('#btn-simulate')
    pg.wait_for_function("document.querySelector('.step.is-active') && document.querySelector('.step.is-active').dataset.step==='4'",timeout=40000)
    lbl=pg.evaluate("Array.from(document.querySelectorAll('#packet-layer .pkt text')).map(t=>t.textContent)")
    check('last fragment F22 is labelled', 'F22' in lbl, str(lbl[-3:]))
    check('no console errors/warnings', not errs, str(errs))
    b.close()
print('\nFAILS:',fails)
sys.exit(1 if fails else 0)
