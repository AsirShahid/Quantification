import json
import os
import struct
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect

# Run only against an explicitly selected deployment, with synthetic fixtures.
OUT = Path(os.environ['SMOKE_OUTPUT']).resolve()
OUT.mkdir(parents=True, exist_ok=True)
container = os.environ['SMOKE_CONTAINER']
info = json.loads(subprocess.check_output(['docker','inspect',container]))[0]
ip = next(iter(info['NetworkSettings']['Networks'].values()))['IPAddress']
origin = f'http://{ip}:3000'
assertion = subprocess.check_output(['docker','exec',container,'node','-e',"process.stdout.write(require('node:fs').readFileSync('/run/secrets/kidneyquant-proxy-assertion','utf8'))"],text=True).strip()
values = [100,200,300,400]
plane = [values[x//8] for y in range(32) for x in range(32)]
im = Image.frombytes('I;16',(32,32),struct.pack('<1024H',*plane))
im.save(OUT/'gray.tif',compression='raw')
im.save(OUT/'gray.jp2',format='JPEG2000',irreversible=False)
colors = [(0,0,0),(100,50,200),(200,100,100),(255,255,255)]
rgb = Image.new('RGB',(32,32)); rgb.putdata([colors[x//8] for y in range(32) for x in range(32)])
rgb.save(OUT/'rgb-a.tif',compression='raw'); rgb.save(OUT/'rgb-b.tif',compression='raw')
summary={'origin_class':'protected internal app connection, not public Basic Auth login','container':container,'checks':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=pw.chromium.executable_path,headless=True,args=[f'--unsafely-treat-insecure-origin-as-secure={origin}','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1600,'height':1050},accept_downloads=True,extra_http_headers={'x-kidneyquant-authenticated-user':'release-verification','x-kidneyquant-proxy-assertion':assertion})
 page=context.new_page(); errors=[]; decodes=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:decodes.append({'status':r.status,'type':r.headers.get('content-type')}) if r.url.endswith('/api/decode') else None)
 def ready():
  expect(page.locator('.primary-button')).to_be_enabled(timeout=30000)
  assert page.locator('.analysis-message.error').count()==0, page.locator('.analysis-message').inner_text()
 def number(id,value):
  page.locator('#'+id).fill(str(value)); page.locator('#'+id).press('Enter')
  expect(page.locator('#'+id)).to_have_value(str(value))
 def load(*names):
  page.locator('input[type=file]').first.set_input_files([str(OUT/n) for n in names]); ready()
 def analyze():
  page.locator('.primary-button').click()
  expect(page.get_by_role('button',name='All channels JSON',exact=True)).to_be_enabled(timeout=30000)
 def download(button,name):
  with page.expect_download() as dl: page.get_by_role('button',name=button,exact=True).click()
  target=OUT/name;dl.value.save_as(str(target));return target
 def records(name):return json.loads(download('All channels JSON',name).read_text())
 try:
  response=page.goto(origin,wait_until='networkidle');assert response is not None and response.status==200;ready()
  assert page.locator('.channel-grid canvas').count()==4
  page.screenshot(path=str(OUT/'initial.png'),full_page=True)
  for ext in ('tif','jp2'):
   load('gray.'+ext)
   number('grayscale-minimum',170);number('grayscale-maximum',170)
   analyze();record=records('gray-'+ext+'.json')[0]
   assert record['source']['analysisWorkflow']=='fluorescence-8bit'
   assert record['source']['originalBitDepth']==16,record['source']
   assert record['analysis']['scoreBitDepth']==8
   assert record['analysis']['intensitySource']=='converted-8bit-analysis-copy'
   assert record['source']['conversionRanges']==[{'minimum':100,'maximum':400}]
   assert record['metrics']['positivePixels']==256 and record['metrics']['analyzedPixels']==1024,record['metrics']
   number('grayscale-brightness-value',2)
   number('grayscale-display-minimum',20)
   analyze();after=records('gray-'+ext+'-display.json')[0]
   assert record['metrics']==after['metrics']
   summary['checks'].append(ext.upper()+': 16-bit source -> known 8-bit copy; exact 170 threshold and display-independent metrics pass')
  assert decodes and decodes[-1]['type']=='application/vnd.kidneyquant.samples+gzip'
  load('rgb-a.tif','rgb-b.tif')
  page.locator('#study-sample').fill('Synthetic A')
  page.locator('#co-stained').select_option('yes')
  page.locator('#marker-primary').select_option('ApoJ / Clusterin')
  page.locator('#channel-primary').select_option('red')
  page.locator('#marker-co-primary').select_option('DAPI')
  page.locator('#stain-channel-view').select_option('primary')
  for channel in ('red','green','blue'):
   number(channel+'-minimum',100);number(channel+'-maximum',255)
  page.locator('#signal-channel').select_option('red')
  analyze();rs=records('rgb.json');assert len(rs)==3
  assert [r['metrics']['positivePixels'] for r in rs]==[768,512,768]
  download('Export Excel · staining tabs','single.xlsx')
  summary['checks'].append('All RGB channels measured independently; initial workbook downloaded')
  page.get_by_role('button',name='Annotate / save PNG',exact=True).click()
  canvas=page.get_by_label('PNG annotation canvas');expect(canvas).to_be_visible()
  box=canvas.bounding_box();assert box is not None;page.mouse.move(box['x']+box['width']*.15,box['y']+box['height']*.15);page.mouse.down();page.mouse.move(box['x']+box['width']*.35,box['y']+box['height']*.3,steps=6);page.mouse.up()
  expect(page.locator('.annotation-tools [role=status]')).to_have_text('1 annotation')
  image=download('Download PNG','annotated.png');assert Image.open(image).width>400 and Image.open(image).height>400
  page.get_by_role('button',name='Close',exact=True).click()
  assert records('after-annotation.json')==rs
  summary['checks'].append('PNG pointer annotation and download do not alter measurements')
  page.get_by_role('button',name='Save reference tile (0)',exact=True).click()
  page.get_by_role('button',name='Accept average thresholds',exact=True).click()
  expect(page.locator('#red-minimum')).to_be_disabled()
  page.locator('.primary-button').click();ready()
  expect(page.get_by_text('1 tiles saved for this sample · 0 tiles in completed samples',exact=True)).to_be_visible()
  # Selecting another pane must not create a second measurement of the same tile.
  page.locator('#signal-channel').select_option('blue');page.locator('.primary-button').click();ready()
  expect(page.get_by_text('1 tiles saved for this sample · 0 tiles in completed samples',exact=True)).to_be_visible()
  summary['checks'].append('Reanalysis after switching selected channel replaces rather than duplicates the saved tile')
  page.get_by_role('button',name='Quantify folder (2 tiles) · all channels',exact=True).click();ready()
  expect(page.get_by_text('2 tiles saved for this sample · 0 tiles in completed samples',exact=True)).to_be_visible()
  workbook=download('Export Excel · staining tabs','study.xlsx')
  with zipfile.ZipFile(workbook) as z:
   ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
   names=[s.attrib['name'] for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',ns)]
   assert all(n in names for n in ['Reference thresholds','Provenance','Tile values','Sample summary','Group summary','Group thresholds'])
   assert any(n.startswith('GraphPad tiles') for n in names)
   assert any(n.startswith('xl/media/') for n in z.namelist())
  summary['checks'].append('Two-tile folder study saved; workbook has reference, provenance, sample/group and GraphPad sheets plus embedded PNGs')
  page.get_by_role('button',name='Save group / switch group',exact=True).click()
  page.locator('#group-name').fill('Synthetic Sirius')
  page.locator('#analysis-method').select_option('sirius');load('rgb-a.tif')
  number('red-minimum',0.35);number('red-maximum',1);analyze();r=records('sirius.json')[0]
  assert r['source']['analysisWorkflow']=='sirius-magenta'
  assert r['metrics']['analyzedPixels']==768 and r['metrics']['positivePixels']==512,r['metrics']
  summary['checks'].append('Sirius fractional score selects expected pixels and excludes undefined all-black pixels')
  page.locator('#draw-shape').select_option('rectangle')
  page.get_by_role('button',name='Draw regions',exact=True).click()
  canvas=page.get_by_label('Microscopy image analysis preview');box=canvas.bounding_box();assert box is not None
  page.mouse.move(box['x']+box['width']*.26,box['y']+box['height']*.1);page.mouse.down();page.mouse.move(box['x']+box['width']*.70,box['y']+box['height']*.90,steps=6);page.mouse.up()
  analyze();r=records('roi.json')[0]
  assert len(r['analysis']['rois'])==1 and 0<r['metrics']['analyzedPixels']<768
  assert r['metrics']['positivePercent']==100,r['metrics']
  summary['checks'].append('Drawn ROI limits measurement denominator')
  page.get_by_role('button',name='Clear (1)',exact=True).click()
  page.locator('#draw-shape').select_option('freehand')
  box=page.get_by_label('Microscopy image analysis preview').bounding_box();assert box is not None
  page.mouse.move(box['x']+box['width']*.27,box['y']+box['height']*.1);page.mouse.down()
  for x,y in [(0.70,0.10),(0.70,0.90),(0.27,0.90),(0.27,0.10)]:
   page.mouse.move(box['x']+box['width']*x,box['y']+box['height']*y,steps=8)
  page.mouse.up();analyze();r=records('freehand.json')[0]
  assert len(r['analysis']['rois'])==1 and len(r['analysis']['rois'][0]['points'])>=3
  assert 0<r['metrics']['analyzedPixels']<768 and r['metrics']['positivePercent']==100
  summary['checks'].append('Freehand outline is retained in the export and limits the counted region')
  assert not errors,errors
  summary.update(passed=True,browser=browser.version,page_errors=errors,decode_responses=decodes)
  page.screenshot(path=str(OUT/'verified.png'),full_page=True)
 except Exception:
  summary.update(passed=False,page_errors=errors,decode_responses=decodes)
  page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  (OUT/'failure.txt').write_text(page.locator('body').inner_text())
  raise
 finally:
  (OUT/'receipt.json').write_text(json.dumps(summary,indent=2)+'\n')
  browser.close()
print(json.dumps(summary,indent=2))
