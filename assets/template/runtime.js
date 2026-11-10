// Render-critical state is driven by a property setter, including suppressed GSAP seeks.
(async function buildGrowth(){
const C=GROWTH_CONFIG,S=C.stages,N=S.length,A=C.atlas,$=id=>document.getElementById(id);
for(const [key,value] of Object.entries(C.palette))document.documentElement.style.setProperty('--'+(key==='background'?'bg':key),value);
for(const line of C.title.lines){const el=document.createElement('span');el.textContent=line;$('title-lines').appendChild(el);}
$('title-zh').textContent=C.title.zh;$('taxon').textContent=C.title.taxon;$('archive-name').textContent=C.title.archive;
$('footer-en').textContent=C.footer.en;$('footer-zh').textContent=C.footer.zh;
C.metrics.forEach((m,i)=>{$('metric-label-'+i).textContent=m.label;document.querySelectorAll('.read-unit')[i].textContent=m.unit;});
const spritePosition=cell=>`${A.columns===1?0:(cell%A.columns)/(A.columns-1)*100}% ${A.rows===1?0:Math.floor(cell/A.columns)/(A.rows-1)*100}%`;
S.forEach((s,i)=>{
 const mini=document.createElement('div');mini.className='mini-step';mini.id='mini-'+i;
 const holder=document.createElement('div');holder.className='mini-image';holder.style.width=Math.min(90,108*A.cellWidth/A.cellHeight)+'px';holder.style.height=Math.min(108,90*A.cellHeight/A.cellWidth)+'px';
 const sprite=document.createElement('div');sprite.className='sprite';sprite.style.backgroundPosition=spritePosition(s.cell);sprite.style.transform=`scale(${.62+.38*i/(N-1)})`;
 if(s.visibleRect){const [x0,y0,x1,y1]=s.visibleRect;sprite.style.clipPath=`inset(${y0/A.cellHeight*100}% ${(1-x1/A.cellWidth)*100}% ${(1-y1/A.cellHeight)*100}% ${x0/A.cellWidth*100}%)`;}
 holder.appendChild(sprite);mini.appendChild(holder);
 const bottom=document.createElement('div');bottom.className='mini-bottom';
 for(const [className,text] of [['mini-id',String(i+1).padStart(2,'0')],['mini-cn',s.zh]]){const el=document.createElement('span');el.className=className;el.textContent=text;bottom.appendChild(el);}
 mini.appendChild(bottom);$('mini-row').appendChild(mini);
 const node=document.createElement('i');node.className='node';node.id='node-'+i;$('timeline-nodes').appendChild(node);
});
const ns='http://www.w3.org/2000/svg';
C.annotations.forEach((a,i)=>{
 const el=document.createElement('div');el.className='annotation';el.style.left=(a.align==='right'?a.label[0]-116:a.label[0])-52+'px';el.style.top=a.label[1]-238+'px';el.style.alignItems=a.align==='right'?'flex-end':'flex-start';
 for(const [tag,className,text] of [['span','anno-num','P.'+String(i+1).padStart(2,'0')],['b','',a.en],['span','',a.zh]]){const child=document.createElement(tag);child.className=className;child.textContent=text;el.appendChild(child);}
 $('annotation-labels').appendChild(el);
 const path=document.createElementNS(ns,'path');path.setAttribute('class','leader');path.id='leader-'+i;$('anatomy').appendChild(path);
 const circle=document.createElementNS(ns,'circle');circle.setAttribute('class','anchor');circle.setAttribute('r','3');circle.id='anchor-'+i;$('anatomy').appendChild(circle);
});
const cage=[[0,0],[A.cellWidth/2,0],[A.cellWidth,0],[A.cellWidth,A.cellHeight/4],[A.cellWidth,A.cellHeight/2],[A.cellWidth,A.cellHeight*.75],[A.cellWidth,A.cellHeight],[A.cellWidth/2,A.cellHeight],[0,A.cellHeight],[0,A.cellHeight*.75],[0,A.cellHeight/2],[0,A.cellHeight/4]].filter(p=>S.every(s=>s.points.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>1e-5)));
const atlas=new Image();atlas.src='assets/atlas.png';await atlas.decode();
const canvas=$('morph-canvas'),mesh=new GrowthMorph(canvas,atlas,S,S.map(s=>s.points.concat(cage)),C);
const lerp=(a,b,t)=>a+(b-a)*t;
const color=(a,b,t)=>{const av=parseInt(a.slice(1),16),bv=parseInt(b.slice(1),16);return `rgb(${[16,8,0].map(s=>Math.round(lerp((av>>s)&255,(bv>>s)&255,t))).join(',')})`;};
let value=0;
function update(g){
 g=Math.max(0,Math.min(N-1,g));value=g;mesh.draw(g);
 const i=Math.min(N-2,Math.floor(g)),t=g-i,index=Math.min(N-1,Math.round(g)),s=S[index],accent=color(S[i].accent,S[i+1].accent,t);
 C.metrics.forEach((m,k)=>{const v=lerp(S[i].metrics[m.key],S[i+1].metrics[m.key],t),max=m.max;
 $(k===0?'size-value':'structure-value').textContent=v.toFixed(m.digits);$(k===0?'size-fill':'structure-fill').style.transform=`scaleX(${Math.max(0,Math.min(1,v/max))})`;});
 $('percent').textContent=String(Math.round(g/(N-1)*100)).padStart(3,'0')+'%';
 $('card-id').textContent=s.id;$('card-id').style.color=accent;$('card-cn').textContent=s.zh;$('card-en').textContent=s.en;
 $('card-count').textContent=`${String(index+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`;$('sequence-count').textContent=`${String(index+1).padStart(2,'0')} — ${String(N).padStart(2,'0')}`;
 $('timeline-fill').style.transform=`scaleX(${g/(N-1)})`;
 for(let k=0;k<N;k++){const distance=Math.abs(g-k);$('mini-'+k).style.opacity=String(.22+.78*Math.max(0,1-distance));$('node-'+k).style.backgroundColor=k<=g?accent:C.palette.background;$('node-'+k).style.borderColor=k<=g?accent:C.palette.muted;}
 C.annotations.forEach((a,k)=>{const p=mesh.coordinate(g,C.landmarkNames.indexOf(a.point)),start=a.lineStart,elbow=a.elbow;
 $('leader-'+k).setAttribute('d',`M${start[0]} ${start[1]}L${elbow[0]} ${elbow[1]}L${p[0]} ${p[1]}`);$('anchor-'+k).setAttribute('cx',p[0]);$('anchor-'+k).setAttribute('cy',p[1]);});
 canvas.dataset.growth=g.toFixed(5);
}
const driver={};Object.defineProperty(driver,'growth',{get:()=>value,set:update});update(0);
const tl=gsap.timeline({paused:true});
gsap.set('#header',{opacity:.16});gsap.set('#morph-canvas',{opacity:0});
gsap.set(['#hud-card','#size-readout','#structure-readout','.annotation','#growth-index','#sequence','#footer','.axis','.axis-label'],{opacity:0});
for(const path of document.querySelectorAll('.hud-brackets path')){const len=path.getTotalLength();tl.fromTo(path,{attr:{'stroke-dasharray':len,'stroke-dashoffset':len}},{attr:{'stroke-dashoffset':0},duration:.55,ease:'power2.inOut'},.25);}
tl.to('#header',{opacity:1,duration:.6,ease:'power3.out'},.12);tl.fromTo('.header-rule',{scaleX:0},{scaleX:1,duration:.72,ease:'expo.out'},.18);
tl.fromTo('#hud-card',{opacity:0,x:-8},{opacity:1,x:0,duration:.28,ease:'power4.out'},.3);tl.to('#morph-canvas',{opacity:1,duration:.55,ease:'sine.out'},.12);
tl.to(['#size-readout','#growth-index'],{opacity:1,duration:.32,ease:'power1.out'},.49);tl.to(['#structure-readout','.annotation','.axis','.axis-label'],{opacity:1,duration:.42,ease:'sine.out',stagger:.035},.58);
tl.to('.leader,.anchor',{opacity:1,duration:.45,ease:'sine.out'},.45);tl.to(['#sequence','#footer'],{opacity:1,duration:.55,ease:'sine.out'},.55);
tl.to(driver,{growth:N-1,duration:C.growth.end-C.growth.start,ease:'none'},C.growth.start);
window.__timelines=window.__timelines||{};window.__timelines[C.id]=tl;tl.seek(0);
if(window.__hfForceTimelineRebind)window.__hfForceTimelineRebind();
})();
