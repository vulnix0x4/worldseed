/* Recorded builds. Ephemera replays these when live conjuring isn't available
   (the page is open outside claude.ai), and opens the sequencer as the first example. */
window.EPHEMERA_DEMOS = [
{
  key: "sequencer",
  match: /beat|drum|music|synth|sequenc|groove|sound|song|melod|loop|rhythm|dj/i,
  prompt: "A step sequencer drum machine with synthesized sounds, tempo and swing, and a box where I describe a groove and Claude writes the pattern.",
  meta: { name: "Pocket Sequencer", tagline: "Six-track step sequencer that takes requests", glyph: "Ps", hue: 48, w: 640, h: 560 },
  code: String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pocket Sequencer</title>
<style>
:root{--bg:#101820;--panel:#17222d;--cell:#223140;--cell2:#2a3b4c;--on:#ffcf3f;--ink:#eef3f7;--mute:#8297aa;--accent:#45d6c3;--bad:#ff7a6b;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#eef1f4;--panel:#ffffff;--cell:#e1e7ed;--cell2:#d2dbe4;--on:#ff8a00;--ink:#14202b;--mute:#5b6d7e;--accent:#0c9a8b;--bad:#c8402f;color-scheme:light}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--ink);font:14px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:12px;padding:16px}
header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
h1{font:800 19px/1 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;margin:0;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}
h1 i{width:10px;height:10px;border-radius:50%;background:var(--mute);display:inline-block;transition:background .2s}
body.playing h1 i{background:var(--on);box-shadow:0 0 10px var(--on)}
.sp{flex:1}
button{font:inherit;font-weight:650;border:0;border-radius:10px;padding:8px 13px;background:var(--cell);color:var(--ink);cursor:pointer;transition:transform .08s ease,background .15s}
button:hover{background:var(--cell2)}
button:active{transform:scale(.97)}
button:focus-visible,input:focus-visible,.c:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{opacity:.5;cursor:default}
button.primary{background:var(--on);color:#161200;min-width:74px}
.knob{display:flex;align-items:center;gap:7px;color:var(--mute);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.knob output{color:var(--ink);min-width:2.6em}
input[type=range]{accent-color:var(--accent);width:92px}
.grid{display:grid;grid-template-columns:64px repeat(16,minmax(0,1fr));gap:5px;background:var(--panel);padding:12px;border-radius:14px;align-content:center;flex:1;min-height:0}
.lab{font-size:11px;color:var(--mute);display:flex;align-items:center;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;user-select:none}
.lab:hover{color:var(--ink)}
.c{aspect-ratio:1;border-radius:6px;background:var(--cell);border:0;padding:0;min-width:0;cursor:pointer;transition:background .12s,transform .08s}
.c.q{background:var(--cell2)}
.c.on{background:var(--on);box-shadow:0 0 14px -2px var(--on)}
.c.now{transform:scale(.86)}
.c.now:not(.on){background:color-mix(in srgb,var(--accent) 45%,var(--cell))}
form{display:flex;gap:8px}
form input{flex:1;min-width:0;font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--cell2);background:var(--panel);color:var(--ink)}
.msg{color:var(--mute);font-size:12px;min-height:1.3em}
.msg.bad{color:var(--bad)}
@media (max-width:540px){.grid{grid-template-columns:44px repeat(16,minmax(0,1fr));gap:2px;padding:8px}.lab{font-size:9px}.c{border-radius:3px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<header>
<h1><i></i>Pocket Sequencer</h1><span class="sp"></span>
<label class="knob" for="bpm">BPM <input id="bpm" type="range" min="70" max="170" value="104"><output id="bpmv">104</output></label>
<label class="knob" for="swing">Swing <input id="swing" type="range" min="0" max="60" value="12"><output id="swingv">12%</output></label>
<button id="play" class="primary">Play</button>
<button id="rand" title="Random pattern">Shuffle</button>
<button id="clear">Clear</button>
</header>
<div class="grid" id="grid" role="grid" aria-label="Pattern"></div>
<form id="aif"><input id="aiq" placeholder="Describe a groove: lazy Sunday bossa, warehouse at 3am…" aria-label="Describe a groove"><button id="aib">Compose</button></form>
<div class="msg" id="msg">Space plays and stops. Click a cell to toggle it, click a track name to hear it.</div>
<script>
(function(){
var TRACKS=["kick","snare","hat","clap","bass","lead"];
var NAMES={kick:"Kick",snare:"Snare",hat:"Hat",clap:"Clap",bass:"Bass",lead:"Lead"};
var SCALE=[0,3,5,7,10,12,15,17];
var DEFAULT={kick:"x.....x...x.....",snare:"....x.......x...",hat:"..x...x...x...xx",clap:"............x..x",bass:"x..x..x...x..x..",lead:"....x.....x.x..."};
var pat={},cells={},step=0,timer=null,ctx=null,next=0,queue=[];
function load(){try{var s=JSON.parse(localStorage.getItem("seq.pattern")||"null");if(s&&s.kick)return s}catch(e){}return null}
function save(){try{localStorage.setItem("seq.pattern",JSON.stringify(toStrings()))}catch(e){}}
function fromStrings(o){TRACKS.forEach(function(t){var s=String(o[t]||"").replace(/[^x.]/gi,"");pat[t]=[];for(var i=0;i<16;i++)pat[t][i]=(s[i]||".").toLowerCase()==="x"})}
function toStrings(){var o={};TRACKS.forEach(function(t){o[t]=pat[t].map(function(b){return b?"x":"."}).join("")});return o}
var grid=document.getElementById("grid");
TRACKS.forEach(function(t){
  var l=document.createElement("div");l.className="lab";l.textContent=NAMES[t];l.title="Preview "+NAMES[t];
  l.onclick=function(){ensure();voice(t,ctx.currentTime+.01,0)};grid.appendChild(l);cells[t]=[];
  for(var i=0;i<16;i++){(function(i){var c=document.createElement("button");c.className="c"+(Math.floor(i/4)%2?" q":"");c.setAttribute("aria-label",NAMES[t]+" step "+(i+1));
    c.onclick=function(){pat[t][i]=!pat[t][i];paint();save();if(pat[t][i]){ensure();voice(t,ctx.currentTime+.01,i)}};cells[t].push(c);grid.appendChild(c)})(i)}
});
function paint(){TRACKS.forEach(function(t){for(var i=0;i<16;i++){cells[t][i].classList.toggle("on",pat[t][i]);cells[t][i].setAttribute("aria-pressed",pat[t][i])}})}
function ensure(){if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.8;var comp=ctx.createDynamicsCompressor();master.connect(comp);comp.connect(ctx.destination);noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);var d=noise.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1}if(ctx.state==="suspended")ctx.resume()}
var master,noise;
function env(g,t,a,peak,dec){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec)}
function nz(t,type,freq,peak,dec,q){var s=ctx.createBufferSource();s.buffer=noise;var f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;var g=ctx.createGain();env(g,t,.002,peak,dec);s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+dec+.05)}
function tone(t,type,freq,peak,dec,cut){var o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,t);var g=ctx.createGain();env(g,t,.005,peak,dec);var n=o;if(cut){var f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.setValueAtTime(cut,t);f.frequency.exponentialRampToValueAtTime(cut/4,t+dec);o.connect(f);n=f}n.connect(g);g.connect(master);o.start(t);o.stop(t+dec+.05);return o}
function voice(t,time,i){
  if(t==="kick"){var o=tone(time,"sine",150,1,.42);o.frequency.exponentialRampToValueAtTime(42,time+.13)}
  else if(t==="snare"){nz(time,"highpass",1200,.55,.17);tone(time,"triangle",190,.35,.09)}
  else if(t==="hat"){nz(time,"highpass",7200,.28,i%2?.035:.06)}
  else if(t==="clap"){[0,.012,.026].forEach(function(d){nz(time+d,"bandpass",1600,.5,.09,1.2)})}
  else if(t==="bass"){var n=SCALE[(i*3+(i>7?2:0))%5];tone(time,"sawtooth",55*Math.pow(2,n/12),.42,.26,900)}
  else if(t==="lead"){var m=SCALE[(i*5+2)%SCALE.length];tone(time,"square",440*Math.pow(2,m/12),.09,.22,3200)}
}
var bpm=document.getElementById("bpm"),swing=document.getElementById("swing");
bpm.oninput=function(){document.getElementById("bpmv").textContent=bpm.value};
swing.oninput=function(){document.getElementById("swingv").textContent=swing.value+"%"};
function tick(){var spb=60/bpm.value/4;while(next<ctx.currentTime+.12){var sw=(step%2?swing.value/100*spb*.66:0);var at=next+sw;TRACKS.forEach(function(t){if(pat[t][step])voice(t,at,step)});queue.push({s:step,t:at});next+=spb;step=(step+1)%16}}
var shown=-1;
function draw(){if(!timer)return;var now=ctx.currentTime;while(queue.length&&queue[0].t<=now){shown=queue.shift().s}TRACKS.forEach(function(t){for(var i=0;i<16;i++)cells[t][i].classList.toggle("now",i===shown)});requestAnimationFrame(draw)}
var playBtn=document.getElementById("play");
function toggle(){ensure();if(timer){clearInterval(timer);timer=null;queue=[];shown=-1;document.querySelectorAll(".c.now").forEach(function(c){c.classList.remove("now")});playBtn.textContent="Play";document.body.classList.remove("playing")}else{step=0;next=ctx.currentTime+.05;timer=setInterval(tick,25);tick();requestAnimationFrame(draw);playBtn.textContent="Stop";document.body.classList.add("playing")}}
playBtn.onclick=toggle;
document.addEventListener("keydown",function(e){if(e.code==="Space"&&e.target.tagName!=="INPUT"){e.preventDefault();toggle()}});
document.getElementById("clear").onclick=function(){TRACKS.forEach(function(t){pat[t]=pat[t].map(function(){return false})});paint();save()};
document.getElementById("rand").onclick=function(){var dens={kick:.3,snare:.15,hat:.55,clap:.08,bass:.3,lead:.18};TRACKS.forEach(function(t){for(var i=0;i<16;i++)pat[t][i]=Math.random()<dens[t]});pat.kick[0]=true;pat.snare[4]=pat.snare[12]=true;paint();save()};
var msg=document.getElementById("msg");
function say(t,bad){msg.textContent=t;msg.classList.toggle("bad",!!bad)}
document.getElementById("aif").onsubmit=function(e){
  e.preventDefault();var q=document.getElementById("aiq").value.trim();if(!q)return;
  if(typeof window.ai!=="function"){say("Composing needs Claude. Open this app inside Ephemera on claude.ai.",true);return}
  var b=document.getElementById("aib");b.disabled=true;b.textContent="Composing…";say("Writing a groove for: "+q);
  window.ai.json("You program a 16-step drum machine. Write a pattern for this vibe: "+JSON.stringify(q)+". Reply with only JSON: {\"title\":string (2-5 words),\"bpm\":integer 70-170,\"swing\":integer 0-60,\"kick\":string,\"snare\":string,\"hat\":string,\"clap\":string,\"bass\":string,\"lead\":string} where each track string is exactly 16 characters of x (hit) or . (rest). Make it musical and idiomatic for the genre.")
  .then(function(r){if(!r||typeof r.kick!=="string")throw new Error("The pattern came back in a shape I couldn't read.");fromStrings(r);paint();save();bpm.value=Math.max(70,Math.min(170,r.bpm|0||104));bpm.oninput();swing.value=Math.max(0,Math.min(60,r.swing|0));swing.oninput();say("Loaded “"+(r.title||q)+"”. Press Play.");if(!timer)toggle()})
  .catch(function(err){say((err&&err.message)||"Couldn't compose that one. Try different words.",true)})
  .then(function(){b.disabled=false;b.textContent="Compose"});
};
fromStrings(load()||DEFAULT);paint();
})();
</script>
</body>
</html>`
},
{
  key: "meter",
  match: /meet|cost|salary|money|budget|calculat|price|spend|time|clock|timer/i,
  prompt: "A live meeting cost meter: attendees with hourly rates, a ticking cost counter, and what that money could have bought instead.",
  meta: { name: "Meeting Meter", tagline: "Watch a meeting's cost tick up in real time", glyph: "$", hue: 150, w: 520, h: 600 },
  code: String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Meter</title>
<style>
:root{--bg:#f3f6f1;--card:#ffffff;--ink:#14231a;--mute:#5d7064;--line:#d9e3dc;--money:#0f8a4a;--hot:#d1452b;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--bg:#0e1511;--card:#151f19;--ink:#e6efe8;--mute:#8aa094;--line:#26342c;--money:#3ddc84;--hot:#ff7a5c;color-scheme:dark}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px;display:grid;gap:16px;align-content:start}
.meter{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;text-align:center}
.lbl{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);font-weight:700}
.big{font:800 clamp(44px,13vw,76px)/1 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--money);margin:10px 0 6px;letter-spacing:-.02em}
.big.hot{color:var(--hot)}
.sub{color:var(--mute);font-variant-numeric:tabular-nums}
.row{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap}
button{font:inherit;font-weight:650;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:10px 16px;cursor:pointer}
button.go{background:var(--ink);color:var(--bg);border-color:var(--ink);min-width:110px}
button:focus-visible,input:focus-visible{outline:2px solid var(--money);outline-offset:2px}
.people{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:10px}
.p{display:grid;grid-template-columns:1fr 110px 34px;gap:8px;align-items:center}
.p input{font:inherit;width:100%;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
.p .x{padding:6px;border:0;background:none;color:var(--mute);font-size:18px}
.instead{color:var(--mute);font-size:14px;text-align:center;min-height:2.6em}
.instead b{color:var(--ink)}
</style>
</head>
<body>
<section class="meter" aria-live="off">
<div class="lbl">This meeting has cost</div>
<div class="big" id="cost">$0.00</div>
<div class="sub" id="sub">00:00:00 · 4 people · $0/min</div>
<div class="row"><button class="go" id="go">Start</button><button id="reset">Reset</button></div>
</section>
<div class="instead" id="instead">Press Start when the meeting does.</div>
<section class="people">
<div class="lbl">Who's here · hourly cost</div>
<div id="list"></div>
<button id="add">Add person</button>
</section>
<script>
(function(){
var people=[{n:"Engineering lead",r:110},{n:"Product manager",r:90},{n:"Designer",r:80},{n:"VP, joined late",r:160}];
try{var s=JSON.parse(localStorage.getItem("mm.people")||"null");if(Array.isArray(s)&&s.length)people=s}catch(e){}
var running=false,elapsed=0,last=0;
var THINGS=[[4.5,"coffees"],[18,"pizzas"],[65,"hours of a contractor"],[140,"nice team dinners"],[1100,"laptops"],[12000,"used cars"]];
function rate(){return people.reduce(function(a,p){return a+(+p.r||0)},0)}
function fmt(n){return "$"+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function hms(s){s=Math.floor(s);var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return [h,m,x].map(function(v){return String(v).padStart(2,"0")}).join(":")}
function save(){try{localStorage.setItem("mm.people",JSON.stringify(people))}catch(e){}}
function render(){
  var c=rate()*elapsed/3600;var el=document.getElementById("cost");el.textContent=fmt(c);el.classList.toggle("hot",c>500);
  document.getElementById("sub").textContent=hms(elapsed)+" · "+people.length+(people.length===1?" person":" people")+" · "+fmt(rate()/60)+"/min";
  var best=null;for(var i=THINGS.length-1;i>=0;i--){if(c>=THINGS[i][0]){best=THINGS[i];break}}
  document.getElementById("instead").innerHTML=best?"So far, that's about <b>"+Math.floor(c/best[0]).toLocaleString()+" "+best[1]+"</b>.":(running?"Not even a coffee yet. Keep it that way.":"Press Start when the meeting does.");
}
function list(){var L=document.getElementById("list");L.innerHTML="";people.forEach(function(p,i){var d=document.createElement("div");d.className="p";
  var a=document.createElement("input");a.value=p.n;a.setAttribute("aria-label","Role");a.oninput=function(){p.n=a.value;save()};
  var b=document.createElement("input");b.type="number";b.min="0";b.value=p.r;b.setAttribute("aria-label","Hourly cost");b.oninput=function(){p.r=Math.max(0,+b.value||0);save();render()};
  var x=document.createElement("button");x.className="x";x.textContent="×";x.setAttribute("aria-label","Remove");x.onclick=function(){people.splice(i,1);save();list();render()};
  d.append(a,b,x);L.appendChild(d)})}
function loop(t){if(!running)return;elapsed+=(t-last)/1000;last=t;render();requestAnimationFrame(loop)}
document.getElementById("go").onclick=function(){running=!running;this.textContent=running?"Pause":"Resume";if(running){last=performance.now();requestAnimationFrame(loop)}render()};
document.getElementById("reset").onclick=function(){running=false;elapsed=0;document.getElementById("go").textContent="Start";render()};
document.getElementById("add").onclick=function(){people.push({n:"Someone",r:75});save();list();render()};
list();render();
})();
</script>
</body>
</html>`
}
];
