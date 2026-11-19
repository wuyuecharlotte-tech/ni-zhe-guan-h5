const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
 const runs={'6-论坛吵翻':[1,2,0,3,1,2],'7-论坛日常':[0,0,1,2,0,0]};
 for(const [name,picks] of Object.entries(runs)){
  const pg=await (await b.newContext({viewport:{width:540,height:960},deviceScaleFactor:2})).newPage();
  await pg.goto('file://'+require('path').resolve(__dirname,'../h5/index.html'));await pg.click('[data-act=start]');
  for(let i=0;i<picks.length;i++){await pg.click(`[data-pick="${picks[i]}"]`);if(i<picks.length-1)await pg.click('[data-act=next]');}
  await pg.click('.forumThread summary');
  await pg.evaluate(()=>{const t=document.querySelector('.forumThread');const f=document.querySelector('.feedback');(t.offsetHeight>700?t:f).scrollIntoView();window.scrollBy(0,-12);});
  await pg.screenshot({path:require('path').resolve(__dirname,'../listing/screenshots')+'/'+name+'.png'});
 }
 await b.close();})();
