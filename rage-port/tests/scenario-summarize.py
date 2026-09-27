#!/usr/bin/env python3
"""Summarize observed scenario evidence without converting partial checks to wins."""
import hashlib,json,re
from collections import Counter
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'rage-port/outputs/scenario-library'
report=json.loads((out/'report.json').read_text())
results=report['results']
ledger=json.loads((out/'engine-provenance.json').read_text())
for r in results:
    if r['id'] in ledger.get('recordsAfter',[]):
        r.setdefault('processStartEngineSha256',r['engineSha256'])
        r['engineSha256']=ledger['afterSha256']
        r['engineProvenance']='Corrected from exact link timeline; initial runner recorded process-start hash.'
    overlap=ledger.get('overlappingRecord',{})
    if r['id']==overlap.get('id'):
        r['engineSha256AtProcessStart']=r.pop('engineSha256',r.get('engineSha256AtProcessStart'))
        r['possibleEngineSha256']=overlap['possibleHashes']
        r['engineProvenance']=overlap['note']
    for change in ledger.get('laterChanges',[]):
        if r['id']==change.get('overlappingRecord'):
            r['engineSha256AtCaseStart']=r.pop('engineSha256',r.get('engineSha256AtCaseStart'))
            r['possibleEngineSha256']=[change['beforeSha256'],change['afterSha256']]
            r['engineProvenance']=change['note']
items={}
for r in results:
    notices=[line for line in r.get('logs',[]) if 'string table entry not found:' in line]
    if notices:r['originalLocalizationNotices']=notices
    for line in notices:
        match=re.search(r'((?:Western|Fantasy|Knights|FarWorlds)\.c4[fd]/.*?/StringTblUS.txt): string table entry not found: "([^"]+)"',line)
        if not match:continue
        rel,key=match.groups();file=root/'original-content/addons/import/all/files'/rel
        data=file.read_bytes();keys=[line.split('=',1)[0].strip() for line in data.decode('cp1252').splitlines() if '=' in line]
        items[(rel,key)]={'path':rel,'key':key,'originalExtractedFileSha256':hashlib.sha256(data).hexdigest(),'keyPresent':key in keys,'keyCaseInsensitivePresent':key.lower() in [s.lower() for s in keys]}
summary={'scenarioCount':report['scenarioCount'],'recorded':len(results),'passed':sum(bool(r['passed']) for r in results),'failed':[{'id':r['id'],'error':r.get('error')} for r in results if not r['passed']], 'screenshots':sum(bool(r.get('screenshot')) for r in results),'realTwoDeviceRooms':sum(bool(r.get('multiplayer')) and r['passed'] for r in results),'originalSaves':sum(r.get('save',{}).get('status')=='saved' for r in results),'saveReloadCategories':[r['categoryId'] for r in results if r.get('saveLoad',{}).get('passed')],'shippedScriptWarnings':[{'id':r['id'],**r['shippedWarnings']} for r in results if r.get('shippedWarnings')],'categoryCounts':dict(Counter(r['categoryId'] for r in results if r['passed'])),'scope':'Original startup, required players, short simulation, controls, original rendering/captures, solo save and representative reload; real two-device controls and frozen native sync/terrain for rooms. Scenario objectives and long-session completeness not asserted.','provenance':'Per-case recorded artifact hashes plus engine-provenance.json; early link overlaps remain explicitly uncertain.'}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'western-localization-audit.json').write_text(json.dumps({'note':'Exact unchanged original English tables inspected. Original notices retained, no content edits.','entries':list(items.values())},indent=2)+'\n')
print(json.dumps(summary,indent=2))
