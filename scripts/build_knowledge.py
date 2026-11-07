"""Build a version-labelled TFT retrieval snapshot. No provider secrets are read here."""
from pathlib import Path
import argparse,json,re,html,urllib.request,datetime,ast,operator
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');args=p.parse_args()
cache=ROOT/'.cache';cache.mkdir(exist_ok=True)
urls={'tft':'https://raw.communitydragon.org/latest/cdragon/tft/zh_cn.json','tft-en':'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json','metadata':'https://raw.communitydragon.org/latest/content-metadata.json'}
for name,url in urls.items():
 target=cache/(name+'.raw')
 if args.refresh or not target.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'YixingPortfolio/1.0'}),timeout=90) as r:target.write_bytes(r.read())
zh=json.loads((cache/'tft.raw').read_text(encoding='utf-8'));en=json.loads((cache/'tft-en.raw').read_text(encoding='utf-8'));metadata=json.loads((cache/'metadata.raw').read_text(encoding='utf-8'))
guides=json.loads((ROOT/'data/guide-snapshot.json').read_text(encoding='utf-8-sig'));set_number=guides['set'];set_zh=zh['sets'][str(set_number)];set_en=en['sets'][str(set_number)]
def clean(text):return html.unescape(re.sub(r'<[^>]+>',' ',text or '')).strip()
def simplify(n):return re.sub(r'[^a-z0-9]','',n.lower())
eng_champs={c['apiName']:c for c in set_en['champions']};eng_items={c['apiName']:c for c in en['items']};eng_traits={t['apiName']:t for t in set_en['traits']}
trans={};champions=[]
for c in set_zh['champions']:
 if not c.get('traits'):continue
 ec=eng_champs.get(c['apiName'],{});english=ec.get('name',c['apiName']);trans[simplify(english)]=c['name']
 champions.append({'id':c['apiName'],'name':c['name'],'english':english,'cost':c['cost'],'traits':c.get('traits',[]),'stats':c.get('stats',{}),'ability':{'name':c.get('ability',{}).get('name'),'description':clean(c.get('ability',{}).get('desc','')),'variables':c.get('ability',{}).get('variables',[])},'source':urls['tft'],'patch':guides['patch']})
items=[]
for item in zh['items']:
 if item.get('isAugment') or not item.get('name') or not item['apiName'].startswith('TFT_Item_'):continue
 english=eng_items.get(item['apiName'],{}).get('name') or item['apiName'];trans[simplify(english)]=item['name']
 items.append({'id':item['apiName'],'name':item['name'],'english':english,'description':clean(item.get('desc','')),'effects':item.get('effects',{}),'composition':item.get('composition',[]),'source':urls['tft'],'availability':'数据目录条目，不保证仍在当前掉落池'})
by_id={i['id']:i['name'] for i in items}
for item in items:item['components']=[by_id.get(x,x) for x in item['composition']]
traits=[]
for t in set_zh['traits']:
 english=eng_traits.get(t['apiName'],{}).get('name',t['apiName']);trans[simplify(english)]=t['name']
 rows=re.findall(r'<row>(.*?)</row>',t.get('desc',''),re.S)
 levels=[]
 for i,effect in enumerate(t.get('effects',[])):
  desc=clean(rows[i] if i<len(rows) else '').replace('@MinUnits@',str(effect['minUnits']))
  levels.append({'units':effect['minUnits'],'effect':desc,'variables':effect.get('variables',{})})
 traits.append({'id':t['apiName'],'name':t['name'],'english':english,'description':clean(t.get('desc','')),'tiers':levels,'breakpoints':t.get('effects',[]),'source':urls['tft']})
def translate(name):return trans.get(simplify(name),name)
for guide in guides['guides']:
 guide['zhName']=' · '.join(translate(x.strip()) for x in guide['name'].split('·'))
 guide['champions']=[translate(x) for x in guide['core']];guide['carryZh']=translate(guide['carry']);guide['itemsZh']=[translate(x) for x in guide['items']]
for build in guides['builds']:
 build['championZh']=translate(build['champion']);build['itemsZh']=[translate(x) for x in build['items']];build['patch']=guides['buildsPatch'];build['source']=guides['buildsSource']
index=[{'name':name,'zhName':' · '.join(translate(x.strip()) for x in name.split('·')),'source':guides['compIndexSource'],'detail':'存在资料快照' if any(g['name']==name for g in guides['guides']) else '仅索引，不含完整站位或运营步骤'} for name in guides['compIndex']]
# Preserve source patch labels: old build rows must never silently become current builds.
kb={'meta':{'patch':guides['patch'],'set':set_number,'checkedAt':guides['checkedAt'],'clientMetadata':metadata,'guideBuildPatch':guides['buildsPatch'],'championCount':len(champions),'itemCount':len(items),'traitCount':len(traits),'compIndexCount':len(index),'detailedGuideCount':len(guides['guides']),'currentGuideCount':sum(g.get('patch')==guides['patch'] for g in guides['guides']),'guideCoverage':guides.get('coverage',{}),'buildCount':len(guides['builds']),'notes':['74 条棋子记录含变体，非 74 个独立商店棋子。','配装统计来自 18.5，需结合当前 18.6 改动核对。','阵容目录逐条核验；无详情的条目仅作索引。未标版本的归档方案不用于当前版本推荐。','技能占位参数无法完全还原时，不编造精确数值。']},'champions':champions,'items':items,'traits':traits,'compIndex':index,'builds':guides['builds'],'guides':guides['guides'],'sources':[{'title':'CommunityDragon 棋子、羁绊与装备数据','url':urls['tft']},{'title':'Riot 18.6 官方更新','url':'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-6/'},{'title':'TFT Coach 18.6 阵容目录','url':guides['compIndexSource']},{'title':'TFT Coach 配装页（18.5 快照）','url':guides['buildsSource']}]}
(ROOT/'data/knowledge.json').write_text(json.dumps(kb,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(kb['meta'],ensure_ascii=True))
