"use strict";
(function(){
 const h=window.h;
 const {nodes,routes,sources}=window.GAME||{}; const app=document.querySelector("#app");
 if(!nodes?.length||!routes?.length){app.textContent="剧本没有加载，请刷新页面再试。";return;}

 // 虎扑全屏容器：启动时读一次顶部安全距离，取它和 CSS 安全区里较大的一个。
 try{
  const px=Number(window.ColorboxAI?.getFullscreenSafeTop?.())||0;
  if(px>0)document.documentElement.style.setProperty("--host-top",Math.round(px)+"px");
 }catch{}

 // 进度只保存在本次打开的页面里，不写浏览器存储。
 const letters="ABCDE"; let page="home",picks=[],idx=0,selected=null,finished=false;
 const btn=(cls,act,label,extra={})=>h("button",{class:cls,"data-act":act,...extra},label);
 const art=(name,caption,cls="sceneArt")=>h("figure",{class:cls},h("img",{src:"art/"+name+".webp",alt:caption,...(cls==="heroArt"?{fetchpriority:"high"}:{loading:"lazy"})}));
 const headline=s=>String(s??"").replace(/^《|》$/g,"");
 const forum=(value,phase,key,closing=false,option=null,special=null)=>window.FORUM?.render({headline:headline(value),phase,key,option,special,closing})??null;

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
  const chapterArt=n.relationship||idx===13?["press","赛后的采访席与麦克风"]:idx===0?["arena","球馆入场通道"]:([4,6,10].includes(idx)?["court","球场上正要出手的球员"]:null);
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
 function getResult(){
  const exact=nodes.every((n,i)=>n.james===picks[i]); const james=routes.find(r=>r.name.includes("詹姆斯"));
  if(exact&&james)return {exact,top:[{r:james,m:nodes.length}]};
  const score=routes.filter(r=>r!==james).map(r=>({r,m:r.anchors.filter(([i,o])=>picks[i]===o).length})).filter(x=>x.m>=2).sort((a,b)=>b.m-a.m||b.m/b.r.anchors.length-a.m/a.r.anchors.length);
  return {exact:false,top:score.length?score.filter(x=>x.m===score[0].m&&x.r.anchors.length===score[0].r.anchors.length).slice(0,3):[]};
 }
 const badges={
  stats:{title:"技术统计优先",one:"赛后看了一眼表格；论坛说这叫认真。",more:"录像还没剪完，你的里程碑海报已经出了三版。",fan:"詹蜜：数据是一场一场打出来的，你刷一个试试。"},
  glory:{title:"镜头必须有我",one:"你知道哪些时刻值得留张照片。",more:"队友在捧杯，你已经选好哪张是封面了。",fan:"詹蜜：领袖站C位有什么问题？镜头给谁，是导播说了算。"},
  exit:{title:"阵容滑动解锁",one:"你看了看下份合同，不等于已经订了机票。",more:"论坛还在等复盘，你已经开始对比下一站的首发名单。",fan:"詹蜜：自由球员选队是规则给的权利，现在人人都这么干。"},
  mic:{title:"麦克风在我手里",one:"别人还在起草标题，你先把自己的版本讲了。",more:"记者准备了五个问题，你一句话给他写完了五篇稿。",fan:"詹蜜：敢开口就有人骂，不开口又说没担当，怎么都不对。"}
 };
 function audit(){
  const sums=Object.fromEntries(Object.keys(badges).map(k=>[k,0]));
  const flagged=[];
  picks.forEach((choice,i)=>{
   const o=nodes[i].options[choice];
   const tags=[...new Set(o?.satire||[])].filter(k=>Object.hasOwn(sums,k));
   if(tags.length){flagged.push({i,o,tags});tags.forEach(k=>sums[k]++);}
  });
  const dimensions=Object.keys(sums).filter(k=>sums[k]>0);
  const points=Object.values(sums).reduce((a,b)=>a+b,0);
  const leaning=flagged.length>=3&&dimensions.length>=2&&points>=4;
  return {sums,flagged,dimensions,points,leaning};
 }
 let lastPoster=null,posterBusy=false;
 async function openPoster(){
  if(posterBusy||!lastPoster)return; posterBusy=true;
  let url="";
  try{
   const cv=window.POSTER.draw(lastPoster); const blob=await window.POSTER.toBlob(cv); url=URL.createObjectURL(blob);
  }catch{posterBusy=false;const st=app.querySelector(".posterStatus");if(st)st.textContent="海报没生成出来，再点一次试试。";return;}
  const close=()=>{modal.remove();URL.revokeObjectURL(url);posterBusy=false;document.querySelector('[data-act="poster"]')?.focus();};
  const closeBtn=h("button",{class:"ghost",type:"button"},"关闭");closeBtn.addEventListener("click",close);
  const postBtn=h("button",{class:"primary",type:"button"},"发到虎扑");
  const tip=h("p",{class:"small posterTip"},"这是你这份生涯的海报。");
  postBtn.addEventListener("click",()=>{tip.textContent="预览版：正式版会在这里打开虎扑发帖编辑器，海报和文案已经填好，你确认后再发。";});
  const modal=h("div",{class:"posterModal",role:"dialog","aria-modal":"true","aria-label":"晒战绩海报"},
   h("div",{class:"posterBox"},h("img",{src:url,alt:"我的生涯结局海报：" + lastPoster.heading}),tip,h("div",{class:"actions posterActions"},postBtn,closeBtn)));
  modal.addEventListener("click",e=>{if(e.target===modal)close();});
  document.body.append(modal);postBtn.focus();
 }
 const host=u=>{try{return new URL(u).hostname.replace(/^www\./,"");}catch{return "";}};
 function result(){
  const {exact,top}=getResult(),a=audit();
  const heading=exact?"真正的詹姆斯":a.leaning?"你这路子，有点詹":top.length>1?"混合生涯":top[0]?.r.name||"自成一派";
  const opener=exact?"从选秀夜打到最后一场发布会，连场外的几次关键决定都对上了。首冠只是把你送上论坛首页。":a.leaning?"你不一定打得像他。但有几次，数据、话筒和下一份阵容名单，刚好都排在你最先要看的东西里。":top.length?"你的球场选择最接近这些球星原型。像谁，不等于复制了谁的冠军数。":"你的路线没有单一球星原型。论坛没能给你贴一个整齐的标签。";
  const ranked=a.dimensions.sort((x,y)=>a.sums[y]-a.sums[x]);
  const trust=trustAt(nodes.length),locker=trust>=3?"遇到问题，他愿意在同一个镜头里和你把话讲完。":trust<=-2?"球可以照传，但散场后他先走了。":"对外各说各的，回队里还能看同一份录像。";
  const hot=a.sums.stats>=2&&a.sums.mic>=2?"赛后问你今天怎么赢的，你说稍等，我把历史划成三个阶段给你讲。":a.sums.exit>=2&&a.sums.glory>=2?"主场字幕才打出下赛季再见，他已经在新城市采访里说我们了。":ranked[0]==="stats"?"哥们，你的赛后回顾怎么还能按列排序？":ranked[0]==="exit"?"下赛季的阵容深度表怎么已经有四个城市了？":ranked[0]==="glory"?"队友：我们赢了。海报：我听见的是他赢了。":ranked[0]==="mic"?"媒体日主持人：我本来只准备问一个问题。":"这回没刷出任何黑料。评论区决定延长讨论时间。";
  lastPoster={heading,opener,hot,
   players:top.map(({r})=>({name:r.name,title:r.title})),
   badges:ranked.map(k=>({title:badges[k].title,count:a.sums[k],line:a.sums[k]===1?badges[k].one:badges[k].more}))};
  const li=(title,text)=>h("li",null,h("b",null,title),h("p",{class:"chosen"},text));
  return h("section",{class:"card result"},
   h("div",{class:"kicker"},"终场哨 / 生涯结算"),
   h("h1",{tabindex:"-1"},heading),
   h("p",{class:"context"},opener),
   forum(hot,"生涯结算",null,true),
   ranked.length?[h("h2",null,"论坛翻出来的旧账"),h("div",{class:"resultGrid mb"},ranked.map(k=>h("div",{class:"score"},
    h("b",null,badges[k].title),h("p",null,a.sums[k]===1?badges[k].one:badges[k].more),h("p",{class:"small"},badges[k].fan),h("span",{class:"small"},"触发 "+a.sums[k]+" 次"))))]:null,
   h("div",{class:"note"},h("b",null,"更衣室关系："),locker),
   top.length?[h("h2",null,"球场上更像谁"),h("div",{class:"resultGrid"},top.map(({r})=>h("div",{class:"score"},h("b",null,r.name),h("p",null,r.title),h("p",{class:"chosen"},r.description))))]:null,
   h("div",{class:"actions sectionEnd"},btn("primary","poster","晒战绩"),btn("ghost","reset","再开一个生涯"),btn("ghost","back","改最后一站")),
   h("p",{class:"small posterStatus","aria-live":"polite"}),
   a.flagged.length?h("details",null,h("summary",null,"翻看这几笔旧账"),h("ol",null,a.flagged.map(({i,o,tags})=>li(nodes[i].title,o.text+" · "+tags.map(k=>badges[k].title).join("、"))))):null,
   h("details",null,h("summary",null,"看看我的每一步"),h("ol",null,nodes.map((n,i)=>li(n.title,n.options[picks[i]]?.text||special(i)?.text||"")))),
   h("details",null,h("summary",null,"展开 20 位球星路线与史料"),
    h("p",{class:"small"},"剧情、采访台词与论坛回帖是游戏演绎。以下是取材参考。"),
    h("ol",null,routes.map(r=>h("li",null,h("b",null,r.name)," · "+r.title))),
    h("ul",{class:"sources"},sources.map(s=>h("li",null,s.text,host(s.url)?h("span",{class:"small"}," · "+host(s.url)):null)))));
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
   case "continue":case "start":resume();break;
   case "home":page="home";draw(true);break;
   case "reset":picks=[];finished=false;resume();break;
   case "back":if(page==="result"){idx=nodes.length-1;page="play";}else idx=Math.max(0,idx-1);selected=picks[idx]??null;draw(true);break;
   case "next":if(!Number.isInteger(selected))return;picks=picks.slice(0,idx);picks.push(selected);finished=picks.length===nodes.length;if(finished)page="result";else{idx++;selected=null;}draw(true);break;
  }
 });
 draw();
})();
