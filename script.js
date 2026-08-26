import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig, THRESHOLDS, FIREBASE_DATA_PATH } from "./config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const sensorInfo = {
  temperature: { title: "DS18B20 — Temperature", key: "temperature", image: "assets/ds18b20.png", text: "A digital temperature sensor with a waterproof probe, suitable for continuous temperature monitoring in aquatic environments." },
  turbidity: { title: "MD0591 — Clarity / Turbidity", key: "turbidity", image: "assets/md0591.png", text: "A turbidity sensor used to assess the cloudiness or clarity of water caused by suspended particles." },
  depth: { title: "JSN-SR04T — Depth", key: "depth", image: "assets/jsn-sr04t.png", text: "A waterproof ultrasonic distance sensor used to estimate water depth or water level." },
  tds: { title: "MD0838 — TDS", key: "tds", image: "assets/md0838.png", text: "A Total Dissolved Solids sensor used to measure dissolved substances in water and support water-quality assessment." },
  pir: { title: "MD0979 — Motion Detection", key: "pir", image: "assets/md0979.png", text: "A Passive Infrared motion sensor used to detect movement in a monitored area and support unauthorized-movement alerts." }
};

const state = { data: {}, tempUnit: "c", connected: false };

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

function animateNumber(el, target, formatter, duration = 850) {
  const from = Number(el.dataset.value ?? target);
  if (!Number.isFinite(target)) return;
  el.dataset.value = String(target);
  const start = performance.now();
  function tick(now){
    const p = Math.min(1, (now-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = formatter(from + (target-from)*eased);
    if(p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function getTemperatureC(){
  return num(state.data.temperatureC ?? state.data.temperature ?? state.data.tempC);
}

function getTurbidity(){
  const value = num(state.data.turbidity ?? state.data.clarity);
  // Wokwi potentiometer simulation can send a raw 12-bit ADC value.
  // Convert that to the same 0–100 clarity/turbidity scale used by the UI.
  if (value != null && value > 100) return Math.max(0, Math.min(100, value / 4095 * 100));
  return value;
}

function getDepth(){
  if (state.data.depthM != null) return num(state.data.depthM);
  if (state.data.depth != null) return num(state.data.depth);
  // The Wokwi sketch can send waterDepth in centimetres.
  if (state.data.waterDepth != null) {
    const cm = num(state.data.waterDepth);
    return cm == null ? null : cm / 100;
  }
  return null;
}

function getTds(){
  const value = num(state.data.tdsPpm ?? state.data.tds ?? state.data.tdsValue);
  // For the Wokwi potentiometer simulation, map the 12-bit ADC range
  // to a simple 0–1000 ppm demonstration range. A real MD0838 must be
  // calibrated against a reference solution before treating this as ppm.
  if (value != null && value > 1000) return value / 4095 * 1000;
  return value;
}

function getMovement(){
  return bool(state.data.movement ?? state.data.motion ?? state.data.pir ?? state.data.movementDetected);
}
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function bool(v){ if(typeof v === "boolean") return v; if(typeof v === "number") return v === 1; if(typeof v === "string") return ["true","1","yes","detected","alert","movement"].includes(v.toLowerCase()); return false; }

function classifyTemperature(v){
  const t=THRESHOLDS.temperatureC; if(v==null || (t.min==null&&t.max==null)) return "neutral";
  return (t.min!=null&&v<t.min)||(t.max!=null&&v>t.max) ? "alert":"ok";
}
function classifyTurbidity(v){
  const t=THRESHOLDS.turbidity; if(v==null || t.max==null) return "neutral"; return v>t.max?"alert":"ok";
}
function classifyTds(v){
  const t=THRESHOLDS.tdsPpm; if(v==null || t.max==null) return "neutral"; return v>t.max?"alert":"ok";
}
function classifyDepth(v){
  const t=THRESHOLDS.depthM; if(v==null || (t.min==null&&t.max==null)) return "neutral";
  return (t.min!=null&&v<t.min)||(t.max!=null&&v>t.max)?"alert":"ok";
}
function setSensorState(name, cls){
  const card = $(`.sensor-card[data-sensor="${name}"]`); if(!card) return;
  card.classList.remove("ok","alert","unknown"); card.classList.add(cls === "neutral" ? "unknown":cls);
}

function render(){
  const tc=getTemperatureC(), turb=getTurbidity(), depth=getDepth(), tds=getTds(), movement=getMovement();
  if(tc!=null){ const c=state.tempUnit==="c"?tc:(tc*9/5)+32; animateNumber($("#tempValue"),c,v=>`${v.toFixed(1)}°${state.tempUnit.toUpperCase()}`); }
  else $("#tempValue").textContent="—";
  if(turb!=null) $("#turbidityValue").textContent = Number.isFinite(turb) ? turb.toFixed(1) : String(turb);
  else $("#turbidityValue").textContent="—";
  if(depth!=null) animateNumber($("#depthValue"),depth,v=>`${v.toFixed(2)} m`); else $("#depthValue").textContent="—";
  if(tds!=null) animateNumber($("#tdsValue"),tds,v=>`${Math.round(v)} ppm`); else $("#tdsValue").textContent="—";
  $("#pirValue").textContent = state.data.movement==null && state.data.motion==null && state.data.pir==null ? "—" : (movement?"DETECTED":"CLEAR");

  setSensorState("temperature", classifyTemperature(tc));
  setSensorState("turbidity", classifyTurbidity(turb));
  setSensorState("tds", classifyTds(tds));
  setSensorState("depth", classifyDepth(depth));
  setSensorState("pir", state.data.movement==null && state.data.motion==null && state.data.pir==null ? "neutral" : (movement?"alert":"ok"));

  const configured=[classifyTemperature(tc),classifyTurbidity(turb),classifyTds(tds),classifyDepth(depth)];
  const hasData=configured.some(x=>x!=="neutral") || state.data.movement!=null || state.data.motion!=null || state.data.pir!=null;
  const anyWaterAlert=configured.includes("alert");
  const overall=movement||anyWaterAlert ? "unsafe" : (hasData && configured.every(x=>x!=="neutral") ? "safe":"neutral");
  const overallCard=$("#overallCard"), overallStatus=$("#overallStatus");
  overallCard.classList.remove("safe","unsafe","neutral"); overallCard.classList.add(overall);
  overallStatus.classList.remove("safe-text","unsafe-text");
  if(overall==="safe"){ overallStatus.textContent="SAFE"; overallStatus.classList.add("safe-text"); $("#overallSub").textContent="All configured monitored conditions are currently within their thresholds."; $("#heroStatus").textContent="SAFE"; $("#heroStatusText").textContent="No active safety alert"; $("#heroDot").style.background="var(--safe)"; }
  else if(overall==="unsafe"){ overallStatus.textContent="UNSAFE"; overallStatus.classList.add("unsafe-text"); $("#overallSub").textContent=movement?"Movement alert is active.":"One or more monitored values are outside configured thresholds."; $("#heroStatus").textContent="ALERT"; $("#heroStatusText").textContent=movement?"Movement detected — attention required":"One or more sensor alerts are active"; $("#heroDot").style.background="var(--unsafe)"; }
  else { overallStatus.textContent="—"; $("#overallSub").textContent="Waiting for live measurements and configured thresholds."; $("#heroStatus").textContent="—"; $("#heroStatusText").textContent="Waiting for sensor data"; $("#heroDot").style.background="var(--neutral)"; }

  const movementCard=$("#movementCard"), mv=$("#movementValue"); movementCard.classList.remove("safe","unsafe","neutral");
  if(state.data.movement==null && state.data.motion==null && state.data.pir==null){ movementCard.classList.add("neutral"); mv.textContent="—"; $("#movementSub").textContent="Waiting for the PIR sensor."; }
  else if(movement){ movementCard.classList.add("unsafe"); mv.textContent="ALERT"; mv.classList.add("unsafe-text"); $("#movementSub").textContent="Movement detected in the monitored area."; }
  else { movementCard.classList.add("safe"); mv.textContent="CLEAR"; mv.classList.add("safe-text"); $("#movementSub").textContent="No movement detected."; }
  if(state.lastUpdated){ $("#lastUpdate").textContent = new Date(state.lastUpdated).toLocaleString(); }
}

function updateConnection(connected, message){
  state.connected = connected;
  $("#connectionText").textContent = message;
  $("#connectionDot").style.background = connected ? "var(--safe)" : "var(--neutral)";
}

async function connectLive(){
  updateConnection(false, "Connecting to Firebase…");

  try {
    // Anonymous sign-in lets the public GitHub Pages dashboard read Firebase
    // without exposing the Wokwi email/password in the website code.
    await signInAnonymously(auth);

    const waterRef = ref(database, FIREBASE_DATA_PATH);

    onValue(
      waterRef,
      (snapshot) => {
        const data = snapshot.val();

        if (!data || typeof data !== "object") {
          state.data = {};
          state.lastUpdated = Date.now();
          updateConnection(true, "Connected · waiting for sensor data");
          render();
          return;
        }

        state.data = data;
        state.lastUpdated = data.lastUpdate
          ? new Date(data.lastUpdate).getTime()
          : Date.now();

        updateConnection(true, "Connected · Firebase live updates active");
        render();
      },
      (error) => {
        console.error("Firebase Realtime Database error:", error);
        updateConnection(false, "Firebase read error — check database rules");
      }
    );
  } catch (error) {
    console.error("Firebase connection error:", error);
    updateConnection(false, "Firebase connection failed");
  }
}

function setupNavigation(){
  const nav=$("#navLinks"), btn=$("#menuBtn");
  btn.addEventListener("click",()=>{ const open=nav.classList.toggle("open"); btn.setAttribute("aria-expanded",String(open)); });
  $$("#navLinks a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("open")));
  const sections=$$("main .section-anchor");
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{ if(e.isIntersecting){ $$("#navLinks a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")===`#${e.target.id}`)); }}),{threshold:.42});
  sections.forEach(s=>observer.observe(s));
}

function setupReveal(){ const io=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle("visible",e.isIntersecting)),{threshold:.14}); $$(".reveal").forEach(el=>io.observe(el)); }
function setupParallax(){ window.addEventListener("scroll",()=>document.documentElement.style.setProperty("--grid-y",`${window.scrollY*.08}px`),{passive:true}); }
function setupScrollCue(){
  const cue=$(".scroll-cue"); if(!cue)return;
  let hasLeftTop=false;
  cue.style.transition="opacity .55s var(--ease), transform .55s var(--ease)";
  const setHidden=hidden=>{ cue.style.opacity=hidden?"0":"1"; cue.style.transform=`translateX(-50%) scale(${hidden?.92:1})`; cue.style.pointerEvents=hidden?"none":"auto"; };
  cue.addEventListener("click",()=>{ hasLeftTop=true; setHidden(true); });
  window.addEventListener("scroll",()=>{
    if(window.scrollY<=4){ if(hasLeftTop){ setHidden(false); hasLeftTop=false; } return; }
    hasLeftTop=true;
    setHidden(cue.getBoundingClientRect().top<=window.innerHeight/2);
  },{passive:true});
}
function setupTempSwitch(){ $$(".unit").forEach(btn=>btn.addEventListener("click",()=>{ state.tempUnit=btn.dataset.unit; $$(".unit").forEach(x=>x.classList.remove("active-c","active-f")); btn.classList.add(btn.dataset.unit==="c"?"active-c":"active-f"); render(); })); }
function setupModal(){
  const modal=$("#modal"), img=$("#modalImage"), title=$("#modalTitle"), text=$("#modalText"), reading=$("#modalReading");
  $$(".info-btn,.info-btn-inline").forEach(btn=>btn.addEventListener("click",()=>{
    const item=sensorInfo[btn.dataset.info]; if(!item)return; title.textContent=item.title; text.textContent=item.text; img.src=item.image; img.alt=item.title;
    reading.textContent=item.key==="temperature"?$("#tempValue").textContent:item.key==="turbidity"?$("#turbidityValue").textContent:item.key==="depth"?$("#depthValue").textContent:item.key==="tds"?$("#tdsValue").textContent:$("#pirValue").textContent;
    modal.classList.add("open"); modal.setAttribute("aria-hidden","false");
  }));
  const close=()=>{modal.classList.remove("open");modal.setAttribute("aria-hidden","true")}; $("#closeModal").addEventListener("click",close); modal.addEventListener("click",e=>{if(e.target===modal)close()}); window.addEventListener("keydown",e=>e.key==="Escape"&&close());
}

window.addEventListener("load",async()=>{
  await sleep(700); $("#loader").classList.add("done"); document.body.classList.add("ready"); await sleep(300);
  setupNavigation(); setupReveal(); setupParallax(); setupScrollCue(); setupTempSwitch(); setupModal(); render(); connectLive();
});
