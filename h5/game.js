"use strict";
(function(){
 const h=window.h;
 const {nodes,routes,sources}=window.GAME||{}; const app=document.querySelector("#app");
 if(!nodes?.length||!routes?.length){app.textContent="剧本没有加载，请刷新页面再试。";return;}

 // 进度存在本机：关掉页面再打开可以接着玩；读不到或数据不对就从头开始。
 const SAVE_KEY="nzg-career-v1";
 const letters="ABCDE"; let page="home",picks=[],idx=0,selected=null,finished=false;
 try{
  const sv=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
  if(sv&&Array.isArray(sv.picks)&&sv.picks.length<=nodes.length&&sv.picks.every((v,i)=>Number.isInteger(v)&&v>=0&&(v<nodes[i].options.length||(v===nodes[i].options.length&&(nodes[i].useSkill||nodes[i].relationshipPayoff))))){picks=sv.picks;finished=sv.finished===true&&picks.length===nodes.length;}
 }catch{}
 const save=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify({picks,finished}));}catch{}};
 const btn=(cls,act,label,extra={})=>h("button",{class:cls,"data-act":act,...extra},label);
 const art=(name,caption,cls="sceneArt")=>h("figure",{class:cls},h("img",{src:"art/"+name+".webp",alt:caption,...(cls==="heroArt"?{fetchpriority:"high"}:{loading:"lazy"})}));
 const headline=s=>String(s??"").replace(/^《|》$/g,"");
 // 路线像詹姆斯的程度：0 不像 / 1 有点像 / 2 很像。决定论坛里粉丝多无脑、黑子多凶。
 function heatOf(list){
  const m=list.filter((v,i)=>v===nodes[i].james).length,n=list.length;
  if(!n)return 0;
  if(m>=3&&m/n>=0.6)return 2;
  if((m>=2&&m/n>=0.4)||list[n-1]===nodes[n-1].james)return 1;
  return 0;
 }
 const forum=(value,phase,key,closing=false,option=null,special=null)=>window.FORUM?.render({headline:headline(value),phase,key,option,special,closing,
  heat:heatOf(closing?picks:picks.slice(0,idx).concat(selected===null?[]:[selected]))})??null;

 function home(){
  return [h("section",{class:"hero"},
   h("div",{class:"heroText"},
    h("div",{class:"kicker"},"生涯模式 / 名利、篮球与论坛"),
    h("h1",null,"你这冠算不算？"),
    h("p",null,"同一场球，教练看录像，球迷看比分，评论区看截图。你决定怎么打球，他们决定怎么记住你。"),
    h("div",{class:"actions"},picks.length?[btn("primary","continue",finished?"查看生涯结局":"继续我的生涯"),btn("ghost","reset","开启新生涯")]:btn("primary","start","进入选秀夜"))),
   art("arena","球员从昏暗通道走向球场","heroArt")),
   h("p",{class:"under"},nodes.length+" 站 · "+routes.length+" 位球星原型")];
 }
 function lastSkill(before){return picks.slice(0,before).map((v,i)=>nodes[i].options[v]?.skill).filter(Boolean).at(-1);}
 function trustAt(before){
  return picks.slice(0,before).reduce((t,v,i)=>{
   const n=nodes[i];
   return t+(n.relationship?(n.options[v]?.trust??(n.relationshipPayoff&&v===n.options.length?2:0)):0);
  },0);
 }
 function special(i){
  const n=nodes[i],skill=lastSkill(i);
  if(n.relationshipPayoff&&trustAt(i)>=3)return {
   kind:"payoff",
   text:"把话筒递给他：这一次我们俩一起答。",
   consequence:"他没接你准备好的客套话，反而主动说：‘他私下早跟我说过，最后一球我来叫。’下次记者再问谁是老大，媒体得先剪掉你们两个互相打断的部分。",
   forum:"记者本来准备写交棒，结果还得回去学挡拆。"
  };
  if(n.useSkill&&skill)return {
   kind:"skill",
   text:"用我练过的招："+skill,
   consequence:"你亮出「"+skill+"」，原本被封死的回合多了一种解法。助教把这套战术留到最后两分钟。",
   forum:"赛前都说他就那两下，结果多出来那一下没人会防。"
  };
  return null;
 }
 function play(){
  const n=nodes[idx],bonus=special(idx),recalled=selected===n.options.length,choice=selected===null?null:recalled?bonus:n.options[selected];
  const relation=n.relationship&&trustAt(idx)>=3?"他没让公关先审问题，自己拖了把椅子坐到你旁边。":n.relationship&&trustAt(idx)<=-2?"他听见记者提到自己，没像以前那样留下来等你。":"";
  const locker=choice&&n.relationship?(recalled?"他接过话筒，没有照公关写的念。":choice.trust>0?"散场后，他留了下来，愿意和你再聊两句。":choice.trust<0?"他没当场接话。下次战术会上，你得先把今天这句话讲清楚。":"他听完点了下头，等回更衣室再聊。"):"";
  const skill=lastSkill(idx);
  const chapterArt=n.relationship||n.phase.includes("历史评价")?["press","赛后的采访席与麦克风"]:idx===0?["arena","球馆入场通道"]:([4,6,10].includes(idx)?["court","球场上正要出手的球员"]:null);
  const choiceBtn=(i,letter,text,pressed,extra)=>h("button",{class:"choice","aria-pressed":String(pressed),...extra},h("span",{class:"letter"},letter),h("span",null,text));
  return h("div",{class:"play"},
   h("section",{class:"card"},
    chapterArt?art(...chapterArt,"mobileArt"):null,
    h("div",{class:"tags"},h("span",{class:"kicker"},n.phase)),
    h("h1",{tabindex:"-1"},n.title),
    h("p",{class:"context"},n.context),
    relation?h("div",{class:"note"},h("b",null,"镜头还没开："),relation):null,
    n.useSkill&&skill?h("div",{class:"note"},h("b",null,"你此前练过："),skill+"。这招可以带进这一回合。"):null,
    h("div",{class:"choices"},
     n.options.map((o,i)=>choiceBtn(i,letters[i],o.text,selected===i,{"data-pick":i})),
     bonus?choiceBtn(-1,"★",bonus.text,recalled,{"data-act":"recall"}):null),
    choice?[h("div",{class:"feedback"},
      h("p",null,h("b",null,"即时结果："),choice.consequence),
      locker?h("p",null,h("b",null,"更衣室反应："),locker):null),
     forum(choice.forum,n.phase,idx,false,selected,recalled?bonus.kind:null)]:null,
    h("div",{class:"controls"},
     btn("ghost",idx?"back":"home",idx?"上一站":"首页"),
     btn("primary","next",idx===nodes.length-1?"公布生涯结局":"确定 · 进入下一站",{disabled:selected===null}))),
   h("aside",{class:"side"},
    h("div",{class:"kicker"},"生涯进度"),
    h("h2",null,"第 "+(idx+1)+" / "+nodes.length+" 站"),
    h("div",{class:"bar",role:"progressbar","aria-label":"生涯进度","aria-valuemin":0,"aria-valuemax":nodes.length,"aria-valuenow":idx+1},h("div",{width:((idx+1)/nodes.length*100)+"%"})),
    skill?h("div",{class:"note"},h("b",null,"已练技术"),h("br"),skill):null,
    chapterArt?art(...chapterArt):null));
 }
 const shortName=n=>n.includes("魔术师")?"魔术师":n.includes("科比")?"科比":n.includes("阿德托昆博")?"字母哥":n.split("·").pop();
 const STEEP=5; // 越大，对得最多的那位占比越高
 const STAR={"詹姆斯":14,"科比":6,"乔丹":6,"库里":4,"杜兰特":2.5}; // 话题球星加权，更容易出现在成分里
 // 成分鉴定：每位球星按「对上的关键选择 / 他的关键选择总数」算相似度，按 STEEP 次方放大再乘话题加权后归一，取前四位，其余并入「其他球星」。
 function getResult(){
  const james=routes.find(r=>r.name.includes("詹姆斯"));
  const exact=nodes.every((n,i)=>n.james===picks[i]);
  if(exact&&james)return {exact,mix:[{r:james,pct:100}],other:0};
  const raw=routes.map(r=>{const m=r.anchors.filter(([i,o])=>picks[i]===o).length;return {r,m,w:Math.pow(m/r.anchors.length,STEEP)*(STAR[shortName(r.name)]||1)};}).filter(x=>x.m>0).sort((a,b)=>b.w-a.w||b.m-a.m);
  const sum=raw.reduce((t,x)=>t+x.w,0);
  const mix=sum?raw.slice(0,4).map(x=>({r:x.r,pct:Math.round(x.w/sum*100)})).filter(x=>x.pct>=3):[];
  let over=mix.reduce((t,x)=>t+x.pct,0)-100;
  for(let k=mix.length-1;k>=0&&over>0;k--){const cut=Math.min(over,mix[k].pct-1);mix[k].pct-=cut;over-=cut;}
  return {exact:false,mix,other:Math.max(0,100-mix.reduce((t,x)=>t+x.pct,0))};
 }
 const badges={
  stats:{title:"技术统计优先",one:"赛后看了一眼表格；论坛说这叫认真。",more:"录像还没剪完，你的里程碑海报已经出了三版。",fan:"护卫队：数据是一场一场打出来的，你刷一个试试。",hot:"哥们，你的赛后回顾怎么还能按列排序？"},
  glory:{title:"镜头必须有我",one:"你知道哪些时刻值得留张照片。",more:"队友在捧杯，你已经选好哪张是封面了。",fan:"护卫队：领袖站C位有什么问题？镜头给谁，是导播说了算。",hot:"队友：我们赢了。海报：我听见的是他赢了。"},
  exit:{title:"阵容滑动解锁",one:"你看了看下份合同，不等于已经订了机票。",more:"论坛还在等复盘，你已经开始对比下一站的首发名单。",fan:"护卫队：自由球员选队是规则给的权利，现在人人都这么干。",hot:"下赛季的阵容深度表怎么已经有四个城市了？"},
  mic:{title:"麦克风在我手里",one:"别人还在起草标题，你先把自己的版本讲了。",more:"记者准备了五个问题，你一句话给他写完了五篇稿。",fan:"护卫队：敢开口就有人骂，不开口又说没担当，怎么都不对。",hot:"媒体日主持人：我本来只准备问一个问题。"},
  solo:{title:"关键球只信自己",one:"最后一球你自己来。全场都知道，包括对面。",more:"战术板上的最后一攻只画了一个箭头，指向你自己。",fan:"护卫队：敢投关键球的人，才配被记住。",hot:"最后一攻的战术板：一个箭头，指向他自己。"},
  loyal:{title:"一座城等到老",one:"你选了留下，论坛顺手查了一下球队的补强记录。",more:"忠诚是真的，等了这么多年的替补中锋也是真的没来。",fan:"护卫队：一人一城，这年头你再找一个给我看看。",hot:"铜像的位置圈好了，替补中锋的位置还空着。"},
  quiet:{title:"数据栏查无此人",one:"脏活你干了，集锦里没剪进去。",more:"集锦剪辑师至今没找到你的素材，对面核心倒是一直记得你。",fan:"护卫队：懂球的看防守，不懂的才只看得分栏。",hot:"集锦里找不到他，对面核心的噩梦里全是他。"},
  ride:{title:"含金量计算器",one:"你挑了一支会打球的队，论坛开始算你占几成。",more:"戒指戴上了，论坛的含金量计算器到现在还没关机。",fan:"护卫队：选对球队也是实力，规则又没拦着。",hot:"戒指是真的，含金量讨论楼也是真的盖到了第 400 页。"},
  pass:{title:"关键球又传了",one:"被包夹你就传，评论区有人替你数了次数。",more:"空位队友投了一晚上，评论区问你为什么不自己来。",fan:"护卫队：传给空位是正确的篮球，投丢了又不是老大的错。",hot:"关键球他又传了，空位那位已经开始热身。"},
  rest:{title:"养生馆常驻",one:"你少打了几场，买了票的球迷记住了。",more:"背靠背的出战名单上，你的名字后面总跟着两个字：轮休。",fan:"护卫队：留着腿打季后赛，这叫对冠军负责。",hot:"今晚出战名单：轮休。季后赛见。"},
  nice:{title:"公关部满分答卷",one:"你的回答谁都不得罪，评论区照样打了起来。",more:"记者想要一个标题，你每次都给他一篇通稿。",fan:"护卫队：不踩别人就叫没立场？那你们到底想听什么。",hot:"他的回答谁都不得罪，评论区替他把人得罪完了。"},
  range:{title:"没进叫浪",one:"你把出手点往外挪了一步，投丢的那几个被剪成了合集。",more:"你的三分集锦有两个版本：粉丝剪的叫时代，黑子剪的叫打铁。",fan:"护卫队：空间是投出来的，丢几个怎么了。",hot:"粉丝剪的叫时代，黑子剪的叫打铁，素材是同一场。"},
  late:{title:"早干嘛去了",one:"你练出了新招，去年说你不会的帖子被顶了上来。",more:"你每补一块短板，论坛就翻出一条“他根本不会这个”的旧帖。",fan:"护卫队：能补短板的才叫巨星，谁一出道就十项全能。",hot:"去年说他不会这招的帖子，今天被顶上了首页。"},
  mentor:{title:"提前上岗当教练",one:"你把球交给年轻人，论坛问你是不是打不动了。",more:"你带的新人越打越好，论坛开始讨论你还剩多少场球。",fan:"护卫队：带新人是格局，不是退场。",hot:"新人把球又传了回来，他说：再来一次。"}
 };
 const JAMES_KEYS=["stats","glory","exit","mic"]; // 只有这四类算「有点詹」
 function audit(){
  const sums=Object.fromEntries(Object.keys(badges).map(k=>[k,0]));
  const flagged=[]; let jamesPicks=0;
  picks.forEach((choice,i)=>{
   const o=nodes[i].options[choice];
   const tags=[...new Set([...(o?.satire||[]),...(o?.ledger||[])])].filter(k=>Object.hasOwn(sums,k));
   if(tags.length){flagged.push({i,o,tags});tags.forEach(k=>sums[k]++);}
   if(tags.some(k=>JAMES_KEYS.includes(k)))jamesPicks++;
  });
  const dimensions=Object.keys(sums).filter(k=>sums[k]>0);
  const jamesDims=JAMES_KEYS.filter(k=>sums[k]>0),jamesPoints=JAMES_KEYS.reduce((t,k)=>t+sums[k],0);
  const leaning=jamesPicks>=3&&jamesDims.length>=2&&jamesPoints>=4;
  return {sums,flagged,dimensions,leaning};
 }
 let lastPoster=null,posterBusy=false;
 async function openPoster(){
  if(posterBusy||!lastPoster)return; posterBusy=true;
  const data=lastPoster; let url="",blob=null;
  try{
   blob=await window.POSTER.toBlob(window.POSTER.draw(data)); url=URL.createObjectURL(blob);
  }catch{posterBusy=false;const st=app.querySelector(".posterStatus");if(st)st.textContent="海报没生成出来，再点一次试试。";return;}
  const close=()=>{modal.remove();URL.revokeObjectURL(url);posterBusy=false;document.querySelector('[data-act="poster"]')?.focus();};
  const closeBtn=h("button",{class:"ghost",type:"button"},"关闭");closeBtn.addEventListener("click",close);
  const postBtn=h("button",{class:"primary",type:"button"},"发到虎扑");
  const tip=h("p",{class:"small posterTip","aria-live":"polite"},"这是你这份生涯的海报。点「发到虎扑」会打开发帖编辑器，你确认后才会发出。");
  const stages={checking:"正在确认登录状态…",uploading:"正在上传海报…",opening:"正在打开发帖编辑器…"};
  postBtn.addEventListener("click",async()=>{
   if(postBtn.disabled)return; postBtn.disabled=true;

   const res=await window.PLATFORM.share({blob,
    title:"我的生涯成分："+data.heading+"｜你这冠算不算？",
    content:"我在《你这冠算不算？》打完了 "+nodes.length+" 站生涯，成分鉴定："+(data.mixText||"自成一派")+"。你的生涯，这冠算不算？",
    onStage:k=>{tip.textContent=stages[k]||"";}});
   tip.textContent=res.msg; postBtn.disabled=false;
  });
  const modal=h("div",{class:"posterModal",role:"dialog","aria-modal":"true","aria-label":"晒战绩海报"},
   h("div",{class:"posterBox"},h("img",{src:url,alt:"我的生涯结局海报："+data.heading}),tip,h("div",{class:"actions posterActions"},postBtn,closeBtn)));
  modal.addEventListener("click",e=>{if(e.target===modal)close();});
  document.body.append(modal);postBtn.focus();
 }
 function result(){
  const {exact,mix,other}=getResult(),a=audit();
  const heading=mix.length?mix.slice(0,2).map(x=>shortName(x.r.name)+" "+x.pct+"%").join(" + "):"自成一派";
  const mixText=mix.map(x=>shortName(x.r.name)+" "+x.pct+"%").join("、")+(other?"、其他球星 "+other+"%":"");
  const opener=exact?"真正的詹姆斯。从选秀夜打到最后一场发布会，连场外的几次关键决定都对上了。首冠只是把你送上论坛首页。":a.leaning?"鉴定备注：你这路子，有点詹。数据、话筒和下一份阵容名单，刚好都排在你最先要看的东西里。":mix.length?"按你这 "+nodes.length+" 站的选择，论坛给你做了一次成分鉴定。像谁，不等于复制了谁的冠军数。":"你的路线对不上任何一位球星原型。论坛没能给你贴一个整齐的标签。";
  const ranked=a.dimensions.sort((x,y)=>a.sums[y]-a.sums[x]).slice(0,4); // 只翻最多的四笔
  const trust=trustAt(nodes.length),locker=trust>=3?"遇到问题，他愿意在同一个镜头里和你把话讲完。":trust<=-2?"球可以照传，但散场后他先走了。":"对外各说各的，回队里还能看同一份录像。";
  const hot=a.sums.stats>=2&&a.sums.mic>=2?"赛后问你今天怎么赢的，你说稍等，我把历史划成三个阶段给你讲。":a.sums.exit>=2&&a.sums.glory>=2?"主场字幕才打出下赛季再见，他已经在新城市采访里说我们了。":ranked.length?badges[ranked[0]].hot:"这回没刷出任何黑料。评论区决定延长讨论时间。";
  lastPoster={heading,opener,hot,
   count:nodes.length,mixText,players:mix.map(({r,pct})=>({name:r.name,short:shortName(r.name),title:r.title,pct})),other,
   badges:ranked.map(k=>({title:badges[k].title,count:a.sums[k],line:a.sums[k]===1?badges[k].one:badges[k].more}))};
  const li=(title,text)=>h("li",null,h("b",null,title),h("p",{class:"chosen"},text));
  return h("section",{class:"card result"},
   h("div",{class:"kicker"},"终场哨 / 成分鉴定"),
   h("h1",{tabindex:"-1"},heading),
   h("p",{class:"context"},opener),
   mix.length?[h("h2",null,"你的生涯成分"),h("div",{class:"mix"},
    mix.map(({r,pct})=>h("div",{class:"mixRow"},h("div",{class:"mixHead"},h("b",null,r.name),h("span",{class:"mixPct"},pct+"%")),h("div",{class:"mixBar"},h("div",{width:pct+"%"})),h("p",{class:"chosen"},r.title))),
    other?h("div",{class:"mixRow"},h("div",{class:"mixHead"},h("b",{class:"mixOther"},"其他球星"),h("span",{class:"mixPct"},other+"%")),h("div",{class:"mixBar"},h("div",{width:other+"%"}))):null),
    h("p",{class:"chosen mb"},mix[0].r.name+"："+mix[0].r.description)]:null,
   forum(hot,"生涯结算",null,true),
   ranked.length?[h("h2",null,"论坛翻出来的旧账"),h("div",{class:"resultGrid mb"},ranked.map(k=>h("div",{class:"score"},
    h("b",null,badges[k].title),h("p",null,a.sums[k]===1?badges[k].one:badges[k].more),h("p",{class:"small"},badges[k].fan),h("span",{class:"small"},"触发 "+a.sums[k]+" 次"))))]:null,
   h("div",{class:"note"},h("b",null,"更衣室关系："),locker),
   h("div",{class:"actions sectionEnd"},btn("primary","poster","晒战绩"),btn("ghost","reset","再开一个生涯"),btn("ghost","back","改最后一站")),
   h("p",{class:"small posterStatus","aria-live":"polite"}),
   a.flagged.length?h("details",null,h("summary",null,"翻看这几笔旧账"),h("ol",null,a.flagged.map(({i,o,tags})=>li(nodes[i].title,o.text+" · "+tags.map(k=>badges[k].title).join("、"))))):null,
   h("details",null,h("summary",null,"看看我的每一步"),h("ol",null,nodes.map((n,i)=>li(n.title,n.options[picks[i]]?.text||special(i)?.text||"")))),
   h("details",null,h("summary",null,"展开 20 位球星路线与史料"),
    h("p",{class:"small"},"剧情、采访台词与论坛回帖是游戏演绎。以下是取材参考。"),
    h("ol",null,routes.map(r=>h("li",null,h("b",null,r.name)," · "+r.title))),
    h("ul",{class:"sources"},sources.map(s=>h("li",null,s.text,s.site?h("span",{class:"small"}," · "+s.site):null)))));
 }
 function draw(advance=false){
  const view=page==="home"?home():page==="result"?result():play();
  app.replaceChildren(...[view].flat());
  if(advance){window.scrollTo(0,0);app.querySelector("h1[tabindex]")?.focus({preventScroll:true});}
 }
 function resume(){if(finished){page="result";idx=nodes.length-1;}else{page="play";idx=Math.min(picks.length,nodes.length-1);selected=picks[idx]??null;}draw(true);}
 document.querySelector("[data-home]")?.addEventListener("click",()=>{page="home";draw(true);});
 app.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.pick!==undefined){selected=Number(b.dataset.pick);draw();app.querySelector('[data-pick="'+selected+'"]')?.focus({preventScroll:true});return;}
  switch(b.dataset.act){
   case "recall": {const n=nodes[idx];if(special(idx)){selected=n.options.length;draw();app.querySelector('[data-act="recall"]')?.focus({preventScroll:true});}break;}
   case "poster":openPoster();break;
   case "continue":case "start":window.PLATFORM?.applySafeTop();resume();break;
   case "home":page="home";draw(true);break;
   case "reset":picks=[];finished=false;save();resume();break;
   case "back":if(page==="result"){idx=nodes.length-1;page="play";}else idx=Math.max(0,idx-1);selected=picks[idx]??null;draw(true);break;
   case "next":if(!Number.isInteger(selected))return;picks=picks.slice(0,idx);picks.push(selected);finished=picks.length===nodes.length;save();if(finished)page="result";else{idx++;selected=null;}draw(true);break;
  }
 });
 draw();
 // 首屏可用（首页已渲染、主图已加载、按钮可点）后再上报就绪；主图加载失败不上报。
 const ready=()=>{if(app.querySelector("button"))window.ShaperPerformance?.markReady?.();};
 const hero=app.querySelector(".heroArt img");
 if(hero){if(hero.complete&&hero.naturalWidth>0)ready();else hero.addEventListener("load",ready,{once:true});}else ready();
 window.addEventListener("shaper:performance:reset",ready);
})();
