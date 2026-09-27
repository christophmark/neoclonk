#!/usr/bin/env python3
"""Package actual original-engine screenshots into a labeled inspection sheet."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat

root=Path(__file__).resolve().parents[2]
out=root/'rage-port/outputs/scenario-library'
catalog=json.loads((root/'rage-port/catalog/scenarios.json').read_text())
manifest=json.loads((out/'screenshots.json').read_text())
by_id={item['id']:item for item in manifest}
records={item['id']:item for item in json.loads((out/'report.json').read_text())['results']}
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10)
columns=8; cell_w=200; cell_h=160; rows=math.ceil(len(catalog['scenarios'])/columns)
sheet=Image.new('RGB',(columns*cell_w,rows*cell_h),(20,15,10));draw=ImageDraw.Draw(sheet)
checks=[]
for index,scenario in enumerate(catalog['scenarios']):
    x=(index%columns)*cell_w;y=(index//columns)*cell_h
    capture=by_id.get(scenario['id']);entry={'id':scenario['id'],'present':False}
    if capture:
        image=Image.open(root/'rage-port'/capture['path']).convert('RGB')
        entry.update(present=True,dimensions=list(image.size),stddev=ImageStat.Stat(image.resize((64,64))).stddev)
        entry['visuallyBlankCandidate']=max(entry['stddev'])<2
        image.thumbnail((cell_w-10,118),Image.Resampling.LANCZOS)
        sheet.paste(image,(x+(cell_w-image.width)//2,y+4+(118-image.height)//2))
    else:
        draw.text((x+12,y+45),'CAPTURE MISSING',font=font,fill=(255,110,90))
    passed=records.get(scenario['id'],{}).get('passed',False)
    draw.rectangle((x+2,y+1,x+cell_w-3,y+cell_h-3),outline=(130,101,53) if passed else (196,66,42))
    label=f'{index+1:02d} {scenario["title"]}'
    while draw.textlength(label,font=font)>cell_w-12:label=label[:-2]+'…'
    draw.text((x+6,y+124),label,font=font,fill=(245,227,183))
    detail=scenario['categoryId'].replace('base-','')+(' · PASS' if passed else ' · REVIEW')
    draw.text((x+6,y+141),detail,font=small,fill=(185,170,145))
    checks.append(entry)
sheet.save(out/'contact-sheet.png')
sheet.save(out/'contact-sheet.webp',quality=90,method=6)
(out/'image-checks.json').write_text(json.dumps({'count':len(checks),'captured':sum(c['present'] for c in checks),'checks':checks},indent=2)+'\n')
print(json.dumps({'sheet':str(out/'contact-sheet.png'),'captured':sum(c['present'] for c in checks),'total':len(checks),'blankCandidates':[c['id'] for c in checks if c.get('visuallyBlankCandidate')]}))
