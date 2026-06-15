import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://qoaqhkdvcerfsqgjvyll.supabase.co";
const SUPABASE_KEY = "sb_publishable_3fPpy9qSCmCBeSQxZUpAeg_Q4sKpgR3";
const USER_ID = "zak"; // single user app

async function sbGet() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/items?user_id=eq.${USER_ID}&select=data`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
  });
  const rows = await res.json();
  return rows.length > 0 ? rows[0].data : null;
}

async function sbSet(data) {
  // Upsert — insert or update
  await fetch(`${SUPABASE_URL}/rest/v1/items`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify({ id: 1, user_id: USER_ID, data, updated_at: new Date().toISOString() })
  });
}

const FEES = { eBay:0.1325, StockX:0.09, GOAT:0.095, Amazon:0.15, "Facebook Marketplace":0, OfferUp:0, Other:0 };
const STORAGE_KEY = "zaks_resell_v14";

const RETURN_STORES = {
  "Home Depot": { days:90,  color:"#C4784A", bg:"#C4784A14", label:"Home Depot" },
  "Lowe's":     { days:90,  color:"#5B8EC4", bg:"#5B8EC414", label:"Lowe's"     },
  "Amazon":     { days:30,  color:"#A8873A", bg:"#A8873A14", label:"Amazon"      },
  "Walmart":    { days:90,  color:"#5B8EC4", bg:"#5B8EC414", label:"Walmart"     },
  "Target":     { days:30,  color:"#B85C6E", bg:"#B85C6E14", label:"Target"      },
  "Costco":     { days:90,  color:"#5B8EC4", bg:"#5B8EC414", label:"Costco"      },
  "Sam's Club": { days:90,  color:"#5B8EC4", bg:"#5B8EC414", label:"Sam's Club"  },
  "Best Buy":   { days:15,  color:"#A8873A", bg:"#A8873A14", label:"Best Buy"    },
};
// Keywords that map to a known store
const STORE_KEYWORDS = [
  { keys:["home depot","homedepot"],       store:"Home Depot" },
  { keys:["lowe's","lowes","lowe"],        store:"Lowe's"     },
  { keys:["amazon"],                       store:"Amazon"     },
  { keys:["walmart","wal-mart","wal mart"],store:"Walmart"    },
  { keys:["target"],                       store:"Target"     },
  { keys:["costco"],                       store:"Costco"     },
  { keys:["sam's club","sams club","sams"],store:"Sam's Club" },
  { keys:["best buy","bestbuy"],           store:"Best Buy"   },
];
const detectStore = src => {
  if(!src) return "";
  const s=src.toLowerCase();
  for(const {keys,store} of STORE_KEYWORDS) {
    if(keys.some(k=>s.includes(k))) return store;
  }
  return "";
};
const daysLeftReturn = (date, store) => {
  if(!date||!store||!RETURN_STORES[store]) return null;
  const dl=new Date(date+"T00:00:00"); dl.setDate(dl.getDate()+RETURN_STORES[store].days);
  return Math.ceil((dl-new Date())/(864e5));
};

const BLANK = {
  name:"", source:"", cogs:"", qty:"1",
  datePurchased: new Date().toISOString().slice(0,10),
  platform:"eBay", customFee:"", shipping:"", salePrice:"",
  status:"incoming", returnStore:"", notes:"", dateSold:"",
  imageUrl:"", productUrl:"", buyerNote:"",
};

const urgColor   = d => d<=7?"#B85C6E":d<=20?"#C4784A":"#4CAF7D";
const feeRate    = item => item.platform==="Other"?(parseFloat(item.customFee)/100||0):(FEES[item.platform]??0);
const calcProfit = item => { const s=parseFloat(item.salePrice)||0,c=parseFloat(item.cogs)||0,sh=parseFloat(item.shipping)||0; return s-c-sh-s*feeRate(item); };
const fmt        = n => { const a=Math.abs(n); return (n<0?"-":"")+"$"+(a>=1000?(a/1000).toFixed(1)+"k":a.toFixed(2)); };
const fmtInt     = n => n>=1000?(n/1000).toFixed(1)+"k":Math.round(n).toString();
const fmtDate    = d => { if(!d) return ""; return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const daysSince  = d => { if(!d) return null; return Math.floor((new Date()-new Date(d+"T00:00:00"))/(864e5)); };

const STATUS = {
  incoming:{ label:"Incoming", color:"#A8873A", bg:"#A8873A14", icon:"↓" },
  listed:  { label:"Listed",   color:"#6B7EC4", bg:"#6B7EC414", icon:"◈" },
  sold:    { label:"Sold",     color:"#4CAF7D", bg:"#4CAF7D14", icon:"✓" },
};

// Animated counter — exposes onDone callback when animation completes
function Counter({ value, duration=1200, onStart }) {
  const [disp,setDisp] = useState(0);
  const raf = useRef();
  const prev = useRef(0);
  useEffect(()=>{
    if(value===prev.current) return;
    if(onStart && value!==prev.current) onStart();
    prev.current=value;
    const t0=performance.now(), from=disp;
    // Expo ease-out — smooth deceleration
    const tick=now=>{
      const p=Math.min((now-t0)/duration,1);
      const e=1-Math.pow(1-p,5);
      setDisp(from+(value-from)*e);
      if(p<1) raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[value]);
  const a=Math.abs(disp);
  return <span>{disp<0?"-":""}${a>=1000?(a/1000).toFixed(1)+"k":a.toFixed(0)}</span>;
}

// Floating sale profit tag — floats up then fades as it "transfers" into the counter
function SaleTag({ profit, fmt, onDone }) {
  const [phase,setPhase] = useState("rise"); // rise → fade → done
  useEffect(()=>{
    const t1=setTimeout(()=>setPhase("fade"),900);
    const t2=setTimeout(()=>{ setPhase("done"); if(onDone) onDone(); },1400);
    return()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[]);
  if(phase==="done") return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      fontSize:14, fontWeight:700, color:"#4CAF7D",
      fontVariantNumeric:"tabular-nums",
      marginLeft:10, verticalAlign:"middle",
      opacity: phase==="fade"?0:1,
      transform: phase==="rise"?"translateY(0)":"translateY(-14px)",
      transition: phase==="fade"
        ? "opacity 0.5s cubic-bezier(0.4,0,1,1), transform 0.5s ease"
        : "transform 0.9s cubic-bezier(0.22,1,0.36,1)",
      pointerEvents:"none",
    }}>
      +{fmt(profit)}
    </span>
  );
}

export default function App() {
  const [items,setItems]         = useState([]);
  const [view,setView]           = useState("dashboard");
  const [form,setForm]           = useState({...BLANK});
  const [editId,setEditId]       = useState(null);
  const [filter,setFilter]       = useState("all");
  const [sync,setSync]           = useState("idle");
  const [loaded,setLoaded]       = useState(false);
  const [toast,setToast]         = useState(null);
  const [deleteId,setDeleteId]   = useState(null);
  const [sellModal,setSellModal] = useState(null);
  const [sellForm,setSellForm]   = useState({price:"",platform:"eBay",customFee:"",shipping:"",qty:"1",buyerNote:""});
  const [newItemId,setNewItemId] = useState(null);
  const [exitingId,setExitingId] = useState(null);
  const [exitType,setExitType]   = useState(null);
  const [flashId,setFlashId]     = useState(null);
  const [saleTag,setSaleTag]     = useState(null);
  const [urlInput,setUrlInput]   = useState("");
  const [monthDetail,setMonthDetail] = useState(null); // key like '2026-06'
  const [alertDismissed,setAlertDismissed] = useState(false);
  const [alertDismissing,setAlertDismissing] = useState(false);
  const [urlLoading,setUrlLoading] = useState(false);
  const [urlError,setUrlError]   = useState("");

  const SEED = [{"id": 1000001, "name": "Lowes Trimmers", "source": "Lowe's", "cogs": "19.99", "qty": "1", "datePurchased": "2026-01-01", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "45.00", "status": "sold", "returnStore": "Lowe's", "notes": "", "buyerNote": "", "dateSold": "2026-02-17", "imageUrl": "", "productUrl": ""}, {"id": 1000002, "name": "Lowes Trimmers", "source": "Lowe's", "cogs": "19.99", "qty": "1", "datePurchased": "2026-01-01", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "", "status": "listed", "returnStore": "Lowe's", "notes": "", "buyerNote": "", "dateSold": "", "imageUrl": "", "productUrl": ""}, {"id": 1000003, "name": "27 Inch Dell 1440p Monitor", "source": "", "cogs": "0.00", "qty": "1", "datePurchased": "2026-02-15", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "120.00", "status": "sold", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "2026-03-19", "imageUrl": "", "productUrl": ""}, {"id": 1000004, "name": "Ryobi Cultivator", "source": "", "cogs": "125.00", "qty": "1", "datePurchased": "2026-03-01", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "130.00", "status": "sold", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "2026-06-04", "imageUrl": "", "productUrl": ""}, {"id": 1000005, "name": "DeWalt Battery 3 Pack", "source": "", "cogs": "85.00", "qty": "1", "datePurchased": "2026-03-01", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "120.00", "status": "sold", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "2026-03-18", "imageUrl": "", "productUrl": ""}, {"id": 1000006, "name": "DeWalt Battery 3 Pack", "source": "", "cogs": "85.00", "qty": "1", "datePurchased": "2026-03-01", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "110.00", "status": "sold", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "2026-04-05", "imageUrl": "", "productUrl": ""}, {"id": 1000007, "name": "Acer Monitor", "source": "", "cogs": "0.00", "qty": "1", "datePurchased": "2026-04-20", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "", "status": "listed", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "", "imageUrl": "", "productUrl": ""}, {"id": 1000008, "name": "Acer Monitor", "source": "", "cogs": "0.00", "qty": "1", "datePurchased": "2026-04-20", "platform": "eBay", "customFee": "", "shipping": "", "salePrice": "", "status": "listed", "returnStore": "", "notes": "", "buyerNote": "", "dateSold": "", "imageUrl": "", "productUrl": ""}, {"id": 1000009, "name": "BoaZ Dabble", "source": "", "cogs": "0.00", "qty": "1", "datePurchased": "2026-06-12", "platform": "Other", "customFee": "0", "shipping": "", "salePrice": "4.89", "status": "sold", "returnStore": "", "notes": "Sports betting \u2014 match deposit/rewards profit", "buyerNote": "", "dateSold": "2026-06-12", "imageUrl": "", "productUrl": ""}, {"id": 1000010, "name": "BoaZ Chalkboard/Boom/Pick6", "source": "", "cogs": "125.00", "qty": "1", "datePurchased": "2026-06-12", "platform": "Other", "customFee": "0", "shipping": "", "salePrice": "277.29", "status": "sold", "returnStore": "", "notes": "Sports betting \u2014 match deposit/rewards profit", "buyerNote": "", "dateSold": "2026-06-12", "imageUrl": "", "productUrl": ""}, {"id": 1000011, "name": "BoaZ Wanna/Parlayplay/Smacktok", "source": "", "cogs": "400.00", "qty": "1", "datePurchased": "2026-06-12", "platform": "Other", "customFee": "0", "shipping": "", "salePrice": "", "status": "listed", "returnStore": "", "notes": "Sports betting \u2014 match deposit/rewards profit", "buyerNote": "", "dateSold": "", "imageUrl": "", "productUrl": ""}];

  useEffect(()=>{
    (async()=>{
      try{
        const saved = await sbGet();
        if(saved) {
          // Merge: seed provides base, saved items override/add on top
          const seedIds = new Set(SEED.map(i=>i.id));
          const userAdded = saved.filter(i=>!seedIds.has(i.id));
          const savedMap = Object.fromEntries(saved.map(i=>[i.id,i]));
          const merged = SEED.map(i=>savedMap[i.id]||i).concat(userAdded);
          setItems(merged);
        } else {
          setItems(SEED);
          await sbSet(SEED);
        }
      } catch(e) {
        console.error(e);
        setItems(SEED);
      }
      setLoaded(true);
    })();
  },[]);
  useEffect(()=>{
    if(!loaded) return;
    (async()=>{ setSync("saving"); try{ await sbSet(items); setSync("saved"); setTimeout(()=>setSync("idle"),2000); }catch{ setSync("error"); } })();
  },[items,loaded]);

  const pop = msg => { setToast(msg); setTimeout(()=>setToast(null),2200); };
  const f   = (k,v) => setForm(p=>({...p,[k]:v}));

  const fetchFromUrl = async () => {
    if(!urlInput.trim()) return;
    setUrlLoading(true); setUrlError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:1000,
          messages:[{
            role:"user",
            content:[
              {
                type:"text",
                text:`Look at this product URL and return ONLY a JSON object (no markdown, no explanation) with exactly these two fields:
- "title": the clean product name/title only (e.g. "Milwaukee M18 FUEL 1/2 in. Hammer Drill Driver"). Just the product name, no store name, no SKU, no extra text.
- "image": the best product image URL from the page (a direct .jpg/.png/.webp URL). If you cannot find one, use "".

URL: ${urlInput.trim()}

Respond with only the raw JSON object.`
              }
            ]
          }]
        })
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text||"";
      const clean = text.replace(/\`\`\`json|\`\`\`/g,"").trim();
      const parsed = JSON.parse(clean);
      if(parsed.title) f("name", parsed.title);
      if(parsed.image) f("imageUrl", parsed.image);
      f("productUrl", urlInput.trim());
    } catch(e) {
      setUrlError("Couldn't read that URL — fill in manually");
    }
    setUrlLoading(false);
  };

  const saveForm = () => {
    if(!form.name.trim()) { pop("Give this item a name"); return; }
    if(editId!=null) {
      setItems(p=>p.map(i=>i.id===editId?{...form,id:editId}:i));
      pop("Changes saved"); setEditId(null);
    } else {
      const id=Date.now();
      setItems(p=>[...p,{...form,id}]);
      setNewItemId(id);
      setTimeout(()=>setNewItemId(null),600);
      pop("Item added");
    }
    setForm({...BLANK}); setUrlInput(""); setUrlError(""); setView("inventory");
  };

  const advanceStatus = item => {
    if(item.status==="incoming") {
      setFlashId(item.id); setTimeout(()=>setFlashId(null),700);
      setItems(p=>p.map(i=>i.id===item.id?{...i,status:"listed"}:i));
      pop("Marked as listed");
    } else if(item.status==="listed") {
      setSellModal(item);
      setSellForm({price:item.salePrice||"",platform:item.platform||"eBay",customFee:item.customFee||"",shipping:item.shipping||"",qty:"1",buyerNote:item.buyerNote||""});
    }
  };
  const confirmSell = () => {
    if(!sellForm.price) { pop("Enter the sale price"); return; }
    const today     = new Date().toISOString().slice(0,10);
    const id        = sellModal.id;
    const totalQty  = parseFloat(sellModal.qty)||1;
    const sellQty   = Math.min(Math.max(parseFloat(sellForm.qty)||1, 1), totalQty);
    const isAll     = sellQty >= totalQty;
    const pricePerUnit = parseFloat(sellForm.price)||0;
    const sp           = pricePerUnit * sellQty; // total batch revenue
    const cgBatch      = (parseFloat(sellModal.cogs)||0) * sellQty;
    const sh           = parseFloat(sellForm.shipping)||0;
    const fr           = sellForm.platform==="Other"?(parseFloat(sellForm.customFee)/100||0):(FEES[sellForm.platform]??0);
    const tagProfit    = sp - cgBatch - sh - sp*fr;
    setSellModal(null);
    if(isAll) {
      setExitingId(id); setExitType("sold");
      setTimeout(()=>{
        setItems(p=>p.map(i=>i.id===id?{...i,status:"sold",salePrice:String(sp),qty:String(sellQty),platform:sellForm.platform,customFee:sellForm.customFee,shipping:sellForm.shipping,dateSold:today,buyerNote:sellForm.buyerNote}:i));
        setExitingId(null); setExitType(null);
      },380);
      pop("Sold 💸");
    } else {
      const remainQty = totalQty - sellQty;
      const soldId    = Date.now();
      setItems(p=>{
        const updated   = p.map(i=>i.id===id?{...i,qty:String(remainQty)}:i);
        const soldEntry = {...sellModal,id:soldId,qty:String(sellQty),status:"sold",
          salePrice:String(sp),platform:sellForm.platform,customFee:sellForm.customFee,
          shipping:sellForm.shipping,dateSold:today,buyerNote:sellForm.buyerNote};
        return [...updated,soldEntry];
      });
      setNewItemId(soldId); setTimeout(()=>setNewItemId(null),600);
      pop(`Sold ${sellQty} — ${remainQty} still in stock`);
    }
    if(tagProfit>0){ setView("dashboard"); setTimeout(()=>setSaleTag({profit:tagProfit}),200); }
  };
  const revertStatus = item => {
    if(item.status==="sold")   { setItems(p=>p.map(i=>i.id===item.id?{...i,status:"listed",salePrice:"",dateSold:""}:i)); pop("Moved back to Listed"); }
    if(item.status==="listed") { setItems(p=>p.map(i=>i.id===item.id?{...i,status:"incoming"}:i)); pop("Moved back to Incoming"); }
  };

  const soldItems     = items.filter(i=>i.status==="sold");
  const listedItems   = items.filter(i=>i.status==="listed");
  const incomingItems = items.filter(i=>i.status==="incoming");
  const activeItems   = items.filter(i=>i.status!=="sold");
  const totalProfit   = soldItems.reduce((s,i)=>s+calcProfit(i),0);
  const totalRev      = soldItems.reduce((s,i)=>s+(parseFloat(i.salePrice)||0),0);
  const totalSpend    = items.reduce((s,i)=>s+(parseFloat(i.cogs)||0)*(parseFloat(i.qty)||1)+(parseFloat(i.shipping)||0),0);
  const locked        = activeItems.reduce((s,i)=>s+(parseFloat(i.cogs)||0)*(parseFloat(i.qty)||1),0);
  const returnItems   = activeItems.filter(i=>i.returnStore&&RETURN_STORES[i.returnStore]);
  const urgentReturn  = returnItems.filter(i=>{ const d=daysLeftReturn(i.datePurchased,i.returnStore); return d!==null&&d>0&&d<=10; });
  const margin        = totalRev>0?(totalProfit/totalRev*100):0;

  const sellPreview = sellModal ? (()=>{
    const pricePerUnit = parseFloat(sellForm.price)||0;
    const sq = Math.min(Math.max(parseFloat(sellForm.qty)||1,1),parseFloat(sellModal.qty)||1);
    const s  = pricePerUnit * sq; // total revenue for batch
    const c  = (parseFloat(sellModal.cogs)||0)*sq;
    const sh = parseFloat(sellForm.shipping)||0;
    const fr = sellForm.platform==="Other"?(parseFloat(sellForm.customFee)/100||0):(FEES[sellForm.platform]??0);
    return s-c-sh-s*fr;
  })() : 0;

  const STATUS_ORDER = {incoming:0,listed:1,sold:2};
  const filtered = items.filter(i=>{
    if(filter==="incoming") return i.status==="incoming";
    if(filter==="listed")   return i.status==="listed";
    if(filter==="sold")     return i.status==="sold";
    if(filter==="returns")  return !!i.returnStore&&i.status!=="sold";
    return true;
  }).sort((a,b)=>filter==="all"?(STATUS_ORDER[a.status]??0)-(STATUS_ORDER[b.status]??0):0);

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body { margin: 0; background: #09090D; }
        #root { display: flex; min-height: 100vh; }
        .app-shell { flex: 1; display: flex; }
        @media (min-width: 768px) {
          .app-shell { display: grid; grid-template-columns: 260px 1fr; max-width: 1200px; margin: 0 auto; width: 100%; }
          .mobile-nav { display: none !important; }
          .desktop-nav { display: flex !important; }
          .main-content { border-left: 1px solid #15151D; }
        }
        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .app-shell { flex-direction: column; width: 100%; }
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder { color: #3A3A4A; }
        select option { background: #0E0E12; }

        @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes slideIn   { from{opacity:0;transform:translateX(-10px) scale(0.97)} to{opacity:1;transform:translateX(0) scale(1)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px);max-height:0} to{opacity:1;transform:translateY(0);max-height:120px} }
        @keyframes soldOut   { 0%{opacity:1;transform:translateX(0) scale(1);max-height:220px}
                               50%{opacity:0;transform:translateX(22px) scale(0.97)}
                               100%{opacity:0;max-height:0;margin-bottom:0;padding:0} }
        @keyframes deleteOut { 0%{opacity:1;transform:translateX(0) scale(1);max-height:220px}
                               45%{opacity:0;transform:translateX(-28px) scale(0.96)}
                               100%{opacity:0;max-height:0;margin-bottom:0;padding:0} }
        @keyframes greenFlash{ 0%{background:rgba(52,217,134,0.16)} 100%{background:transparent} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes returnSlide{ from{opacity:0;transform:translateY(-6px);max-height:0} to{opacity:1;transform:translateY(0);max-height:90px} }
        @keyframes alertSlideIn { from{opacity:0;transform:translateY(-10px);max-height:0;margin-bottom:0} to{opacity:1;transform:translateY(0);max-height:120px;margin-bottom:14px} }
        @keyframes alertSlideOut{ 0%{opacity:1;transform:translateX(0);max-height:120px;margin-bottom:14px} 60%{opacity:0;transform:translateX(60px)} 100%{opacity:0;max-height:0;margin-bottom:0;padding:0} }
        @keyframes navPop    { 0%{transform:scale(1)} 40%{transform:scale(0.88)} 100%{transform:scale(1)} }

        .item-card  { transition: background 0.2s ease, box-shadow 0.2s ease; }
        .item-card:hover { background:#131318!important; box-shadow:0 0 0 1px #1E1E28; }
        .item-new   { animation: slideIn 0.38s cubic-bezier(0.34,1.3,0.64,1) both; }
        .item-sold  { animation: soldOut 0.45s cubic-bezier(0.4,0,0.6,1) forwards; pointer-events:none; overflow:hidden; }
        .item-delete{ animation: deleteOut 0.38s cubic-bezier(0.4,0,1,1) forwards; pointer-events:none; overflow:hidden; }
        .status-bar { transition: background 0.45s cubic-bezier(0.4,0,0.2,1); }
        .sold-flash { animation: greenFlash 0.7s ease; }
        .return-card{ animation: returnSlide 0.32s cubic-bezier(0.34,1.2,0.64,1) both; overflow:hidden; }
        .ghost-btn  { transition: opacity 0.12s, transform 0.12s cubic-bezier(0.34,1.5,0.64,1); }
        .ghost-btn:hover  { opacity:0.78; }
        .ghost-btn:active { transform:scale(0.94); opacity:0.7; }
        .primary-btn{ transition: transform 0.12s cubic-bezier(0.34,1.5,0.64,1), opacity 0.12s; }
        .primary-btn:active { transform:scale(0.97); opacity:0.88; }
        .nav-btn    { transition: opacity 0.15s; }
        .nav-btn:active .nav-icon { animation: navPop 0.25s ease; }
        .nav-btn:hover  .nav-icon { color:#6B7EC4!important; }
        .add-btn    { transition: transform 0.12s cubic-bezier(0.34,1.5,0.64,1), opacity 0.12s; }
        .add-btn:active { transform:scale(0.94); }
        .filter-btn { transition: background 0.2s cubic-bezier(0.4,0,0.2,1), color 0.2s; }
        .hero-card  { transition: box-shadow 0.3s ease; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={S.toast}>
          <div style={S.toastDot}/>
          {toast}
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteId && (
        <div style={S.overlay}>
          <div style={S.sheet}>
            <div style={S.sheetHandle}/>
            <div style={S.sheetTitle}>Delete item?</div>
            <div style={S.sheetSub}>This action is permanent and cannot be undone.</div>
            <div style={{display:"flex",gap:10,marginTop:24}}>
              <button style={S.btnGhost} onClick={()=>setDeleteId(null)}>Cancel</button>
              <button style={S.btnDanger} onClick={()=>{
                const id=deleteId; setDeleteId(null);
                setExitingId(id); setExitType("delete");
                setTimeout(()=>{ setItems(p=>p.filter(i=>i.id!==id)); setExitingId(null); setExitType(null); },320);
                pop("Deleted");
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* SELL MODAL */}
      {sellModal && (()=>{
        const itemQty = parseFloat(sellModal.qty)||1;
        const isMulti = itemQty > 1;
        const sellQtyNum = Math.min(Math.max(parseFloat(sellForm.qty)||1,1),itemQty);
        return (
        <div style={S.overlay}>
          <div style={S.sheet}>
            <div style={S.sheetHandle}/>
            <div style={S.sheetTitle}>Confirm sale</div>
            <div style={{...S.sheetSub,marginBottom:0}}>{sellModal.name}</div>

            <div style={{marginTop:18}}>
              {/* Qty picker — only shows when item has qty > 1 */}
              {isMulti && (
                <div style={{marginBottom:16}}>
                  <InputLabel>How many are you selling?</InputLabel>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {/* qty input */}
                    <input style={{...S.input,width:80,textAlign:"center",fontSize:18,fontWeight:700,flexShrink:0}}
                      type="number" min="1" max={itemQty} value={sellForm.qty}
                      onChange={e=>setSellForm(p=>({...p,qty:e.target.value}))}/>
                    <div style={{fontSize:12,color:"#404050"}}>of {itemQty}</div>
                    {/* All button */}
                    <button className="ghost-btn"
                      style={{marginLeft:"auto",background:sellQtyNum>=itemQty?"#4CAF7D20":"#1A1A24",color:sellQtyNum>=itemQty?"#4CAF7D":"#606070",border:`1px solid ${sellQtyNum>=itemQty?"#4CAF7D40":"#1E1E2A"}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}
                      onClick={()=>setSellForm(p=>({...p,qty:String(itemQty)}))}>
                      All {itemQty}
                    </button>
                  </div>
                  {sellQtyNum < itemQty && (
                    <div style={{fontSize:11,color:"#404050",marginTop:6}}>
                      {itemQty-sellQtyNum} unit{itemQty-sellQtyNum>1?"s":""} will stay in inventory
                    </div>
                  )}
                </div>
              )}

              <InputLabel>Price per item{isMulti&&sellQtyNum>1?` × ${sellQtyNum} units`:""}</InputLabel>
              <div style={S.priceInputWrap}>
                <span style={S.priceSymbol}>$</span>
                <input style={S.priceInput} type="number" placeholder="0.00" value={sellForm.price} autoFocus={!isMulti} 
                  onChange={e=>setSellForm(p=>({...p,price:e.target.value}))}/>
              </div>

              <InputLabel>Platform</InputLabel>
              <select style={{...S.input,marginBottom:12}} value={sellForm.platform} onChange={e=>setSellForm(p=>({...p,platform:e.target.value}))}>
                {Object.entries(FEES).map(([p,r])=><option key={p} value={p}>{p} — {(r*100).toFixed(1)}% fee</option>)}
              </select>

              {sellForm.platform==="Other" && <>
                <InputLabel>Custom fee %</InputLabel>
                <input style={{...S.input,marginBottom:12}} type="number" placeholder="8.5" value={sellForm.customFee} onChange={e=>setSellForm(p=>({...p,customFee:e.target.value}))}/>
              </>}

              <InputLabel>Shipping cost</InputLabel>
              <input style={{...S.input,marginBottom:12}} type="number" placeholder="$0.00" value={sellForm.shipping} onChange={e=>setSellForm(p=>({...p,shipping:e.target.value}))}/>

              <InputLabel>Buyer <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:"#2E2E3E"}}>(optional)</span></InputLabel>
              <input style={{...S.input,marginBottom:16}} placeholder="e.g. Mike from Facebook" value={sellForm.buyerNote||""} onChange={e=>setSellForm(p=>({...p,buyerNote:e.target.value}))}/>

              {sellForm.price && (
                <div style={{...S.profitPreview,borderColor:sellPreview>=0?"#4CAF7D30":"#B85C6E30",background:sellPreview>=0?"#4CAF7D08":"#B85C6E08"}}>
                  <div style={{fontSize:11,color:"#505060",fontWeight:500,letterSpacing:"0.3px",textTransform:"uppercase",marginBottom:4}}>
                    Your profit{isMulti&&sellQtyNum>1?` on ${sellQtyNum} units`:""}
                  </div>
                  <div style={{fontSize:32,fontWeight:800,letterSpacing:"-1px",color:sellPreview>=0?"#4CAF7D":"#B85C6E",fontVariantNumeric:"tabular-nums"}}>
                    {sellPreview>=0?"+":""}{fmt(sellPreview)}
                  </div>
                  {isMulti&&sellQtyNum>1&&sellForm.price&&(
                    <div style={{fontSize:11,color:"#404050",marginTop:3}}>
                      ${((parseFloat(sellForm.price)||0)/sellQtyNum).toFixed(2)} per unit
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button style={S.btnGhost} onClick={()=>setSellModal(null)}>Cancel</button>
              <button style={S.btnSuccess} onClick={confirmSell}>Lock it in</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ADD / EDIT FORM */}
      {view==="add" ? (
        <div style={S.formPage}>
          <div style={S.formHeader}>
            <button style={S.backBtn} onClick={()=>{ setView("inventory"); setEditId(null); setForm({...BLANK}); setUrlInput(""); setUrlError(""); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            <span style={S.formTitle}>{editId?"Edit item":"New item"}</span>
            <div style={{width:32}}/>
          </div>

          <div style={S.formScroll}>
            {/* URL lookup */}
            <Lbl>Paste a product URL <span style={{color:"#2E2E3E",fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional — auto-fills name + image)</span></Lbl>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input
                style={{...S.input,flex:1,fontSize:13}}
                placeholder="https://homedepot.com/p/…"
                value={urlInput}
                onChange={e=>{ setUrlInput(e.target.value); setUrlError(""); }}
                onKeyDown={e=>e.key==="Enter"&&fetchFromUrl()}
              />
              <button className="ghost-btn" disabled={urlLoading||!urlInput.trim()}
                style={{background:"#6B7EC414",color:"#6B7EC4",border:"1px solid #6B7EC428",borderRadius:10,padding:"0 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",opacity:urlLoading||!urlInput.trim()?0.45:1,transition:"opacity 0.15s"}}
                onClick={fetchFromUrl}>
                {urlLoading?"…":"Look up"}
              </button>
            </div>
            {urlError && <div style={{fontSize:11,color:"#B85C6E",marginBottom:12}}>{urlError}</div>}

            {/* Product image preview */}
            {form.imageUrl && (
              <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10,background:"#0D0D12",border:"1px solid #1A1A24",borderRadius:10,padding:"10px 12px",animation:"fadeIn 0.3s ease"}}>
                <img src={form.imageUrl} alt="" onError={e=>e.target.style.display="none"}
                  style={{width:52,height:52,objectFit:"contain",borderRadius:7,background:"#fff",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:"#404050",marginBottom:2}}>Product image</div>
                  <div style={{fontSize:11,color:"#2E2E3E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{form.productUrl}</div>
                </div>
                <button className="ghost-btn" style={{background:"none",border:"none",color:"#404050",cursor:"pointer",padding:4,fontSize:14}} onClick={()=>{ f("imageUrl",""); f("productUrl",""); setUrlInput(""); }}>✕</button>
              </div>
            )}

            <Lbl>Item name</Lbl>
            <input style={{...S.input,fontSize:16,fontWeight:500,marginBottom:20}} placeholder="e.g. Milwaukee M18 Drill" value={form.name} onChange={e=>f("name",e.target.value)}/>

            <Lbl>Purchased from</Lbl>
            <input style={{...S.input,marginBottom:6}} placeholder="Home Depot, Walmart, garage sale…" value={form.source} onChange={e=>{ const val=e.target.value; const detected=detectStore(val); setForm(p=>({...p,source:val,returnStore:detected})); }}/>
            {!form.returnStore && form.source.length>2 && (
              <div style={{fontSize:11,color:"#2E2E3E",marginBottom:20,paddingLeft:2}}>No return tracking for this source</div>
            )}
            {!form.source && <div style={{marginBottom:20}}/>}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div>
                <Lbl>Amount paid</Lbl>
                <div style={S.inputIconWrap}>
                  <span style={S.inputIcon}>$</span>
                  <input style={S.inputWithIcon} type="number" placeholder="0.00" value={form.cogs} onChange={e=>f("cogs",e.target.value)}/>
                </div>
              </div>
              <div>
                <Lbl>Quantity</Lbl>
                <input style={S.input} type="number" placeholder="1" min="1" value={form.qty} onChange={e=>f("qty",e.target.value)}/>
              </div>
            </div>

            <Lbl>Date purchased</Lbl>
            <input style={{...S.input,marginBottom:20}} type="date" value={form.datePurchased} onChange={e=>f("datePurchased",e.target.value)}/>

            {/* Auto return tracking — shows when source matches a known store */}
            {form.returnStore && RETURN_STORES[form.returnStore] && (()=>{
              const meta=RETURN_STORES[form.returnStore];
              const d=daysLeftReturn(form.datePurchased,form.returnStore);
              return (
                <div className="return-card" style={{background:meta.bg,border:`1px solid ${meta.color}30`,borderRadius:10,padding:"11px 14px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:3,height:32,borderRadius:2,background:meta.color,flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:12,color:meta.color,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                        ↩ Return tracking on
                        <span style={{fontSize:10,color:"#404050",fontWeight:400}}>· {meta.days} days</span>
                      </div>
                      <div style={{fontSize:11,color:"#404050",marginTop:2}}>{meta.label} return window</div>
                    </div>
                  </div>
                  {d!==null&&<div style={{textAlign:"right"}}>
                    <div style={{fontSize:20,fontWeight:800,color:urgColor(d),fontVariantNumeric:"tabular-nums",lineHeight:1}}>{Math.max(d,0)}</div>
                    <div style={{fontSize:9,color:"#404050",marginTop:1}}>days left</div>
                  </div>}
                </div>
              );
            })()}

            <Lbl>Notes</Lbl>
            <input style={{...S.input,marginBottom:16}} placeholder="Condition, size, anything useful…" value={form.notes} onChange={e=>f("notes",e.target.value)}/>

            <button className="primary-btn" style={{...S.btnPrimary,marginTop:12}} onClick={saveForm}>{editId?"Save changes":"Add to inventory"}</button>
          </div>
        </div>

      ) : (
        <div>
          {/* HEADER */}
          <header style={S.header}>
            <div style={S.headerInner}>
              <div style={S.logo}>
                <span style={S.logoText}>Zak</span>
                <span style={S.logoAccent}> Reselling</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={S.syncIndicator}>
                  {sync==="saving" && <><div style={{...S.syncDot,background:"#505060",animation:"pulse 1s ease-in-out infinite"}}/><span>saving</span></>}
                  {sync==="saved"  && <><div style={{...S.syncDot,background:"#4CAF7D"}}/><span style={{color:"#4CAF7D"}}>synced</span></>}
                  {sync==="error"  && <><div style={{...S.syncDot,background:"#B85C6E"}}/><span style={{color:"#B85C6E"}}>error</span></>}
                </div>
                {view==="inventory" && (
                  <button className="add-btn" style={S.addBtn} onClick={()=>{ setForm({...BLANK}); setEditId(null); setView("add"); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                    Add item
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* CONTENT */}
          <main style={S.main}>
            {!loaded ? (
              <div style={S.loadingWrap}><div style={S.spinner}/></div>
            ) : view==="dashboard" ? (
              <Dashboard items={items} soldItems={soldItems} listedItems={listedItems} incomingItems={incomingItems}
                totalProfit={totalProfit} totalRev={totalRev} totalSpend={totalSpend} locked={locked}
                margin={margin} returnItems={returnItems} urgentReturn={urgentReturn}
                saleTag={saleTag} onSaleTagDone={()=>setSaleTag(null)}
                calcProfit={calcProfit} fmt={fmt} fmtInt={fmtInt} urgColor={urgColor} fmtDate={fmtDate} daysSince={daysSince}
                onEdit={item=>{ setForm({...BLANK,...item}); setEditId(item.id); setView("add"); }}/>
            ) : view==="monthly" ? (
              <Monthly soldItems={soldItems} calcProfit={calcProfit} fmt={fmt} fmtInt={fmtInt} fmtDate={fmtDate} onOpenMonth={setMonthDetail}/>
            ) : (
              <Inventory filtered={filtered} filter={filter} setFilter={setFilter} urgentReturn={urgentReturn}
                calcProfit={calcProfit} fmt={fmt} urgColor={urgColor} fmtDate={fmtDate} daysSince={daysSince}
                newItemId={newItemId} exitingId={exitingId} exitType={exitType} flashId={flashId}
                alertDismissed={alertDismissed} alertDismissing={alertDismissing}
                onDismissAlert={()=>{ setAlertDismissing(true); setTimeout(()=>{ setAlertDismissed(true); setAlertDismissing(false); },380); }}
                onEdit={item=>{ setForm({...BLANK,...item}); setEditId(item.id); setView("add"); }}
                onDelete={id=>setDeleteId(id)}
                onAdvance={advanceStatus}
                onRevert={revertStatus}
                onAdd={()=>{ setForm({...BLANK}); setEditId(null); setView("add"); }}/>
            )}
          </main>

          {/* BOTTOM NAV — mobile only */}
          <nav className="mobile-nav" style={S.nav}>
            {[
              {id:"dashboard",label:"Overview",  icon:<DashIco/>},
              {id:"inventory",label:"Inventory", icon:<BoxIco/>},
              {id:"monthly",  label:"Monthly",   icon:<CalIco/>},
            ].map(tab=>(
              <button key={tab.id} className="nav-btn" style={S.navBtn} onClick={()=>setView(tab.id)}>
                <div className="nav-icon" style={{color:view===tab.id?"#6B7EC4":"#3A3A50",transition:"color 0.2s"}}>{tab.icon}</div>
                <span style={{fontSize:10,fontWeight:view===tab.id?600:400,color:view===tab.id?"#6B7EC4":"#3A3A50",letterSpacing:"0.3px",transition:"color 0.2s"}}>{tab.label}</span>
              </button>
            ))}
          </nav>
          </div>{/* end main column */}
        </div>{/* end app-shell */}
      </div>
      {/* Month detail overlay — root level so it covers everything */}
      {monthDetail && (
        <MonthDetail
          monthKey={monthDetail}
          soldItems={soldItems}
          calcProfit={calcProfit} fmt={fmt} fmtInt={fmtInt} fmtDate={fmtDate}
          onClose={()=>setMonthDetail(null)}
        />
      )}
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ items, soldItems, listedItems, incomingItems, totalProfit, totalRev, totalSpend, locked, margin, returnItems, urgentReturn, saleTag, onSaleTagDone, calcProfit, fmt, fmtInt, urgColor, fmtDate, daysSince, onEdit }) {
  return (
    <div style={{paddingBottom:24,animation:"fadeUp 0.3s ease"}}>

      {/* Hero card */}
      {(() => {
        const currentProfit = totalProfit - locked;
        const cpColor = currentProfit>=0?"#4CAF7D":"#B85C6E";
        const tpColor = totalProfit>=0?"#4CAF7D":"#B85C6E";
        const thisMonthKey = new Date().toISOString().slice(0,7);
        const monthProfit  = soldItems.filter(i=>i.dateSold&&i.dateSold.slice(0,7)===thisMonthKey).reduce((s,i)=>s+calcProfit(i),0);
        const mpColor  = monthProfit>=0?"#4CAF7D":"#B85C6E";
        const monthName= new Date().toLocaleDateString("en-US",{month:"short"});
        return (
          <div className="hero-card" style={S.heroCard}>
            {/* Current profit — the star */}
            <div style={S.heroEyebrow}>All-time profit</div>
            <div style={{fontSize:46,fontWeight:800,letterSpacing:"-2px",fontVariantNumeric:"tabular-nums",lineHeight:1,color:tpColor,marginBottom:4,display:"flex",alignItems:"center",flexWrap:"nowrap"}}>
              <Counter value={totalProfit}/>
              {saleTag && <SaleTag profit={saleTag.profit} fmt={fmt} onDone={onSaleTagDone}/>}
            </div>
            <div style={{fontSize:11,color:"#353545",marginBottom:16}}>total earned across all sales</div>

            {/* Divider */}
            <div style={{height:1,background:"#15151D",marginBottom:14}}/>

            {/* All-time + this month + pipeline */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:10,color:"#353545",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>Current</div>
                <div style={{fontSize:18,fontWeight:700,letterSpacing:"-0.8px",fontVariantNumeric:"tabular-nums",color:cpColor}}>{currentProfit>=0?"+":""}{fmt(currentProfit)}</div>
              </div>
              <div style={{width:1,height:32,background:"#15151D"}}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:"#353545",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>{monthName}</div>
                <div style={{fontSize:18,fontWeight:700,letterSpacing:"-0.8px",fontVariantNumeric:"tabular-nums",color:mpColor}}>{monthProfit>=0?"+":""}{fmt(monthProfit)}</div>
              </div>
              <div style={{width:1,height:32,background:"#15151D"}}/>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:10,color:"#353545",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>Incoming</div>
                <div style={{fontSize:20,fontWeight:700,color:"#A8873A"}}>{incomingItems.length}</div>
              </div>
              <div style={{width:1,height:32,background:"#15151D"}}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:"#353545",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>Listed</div>
                <div style={{fontSize:20,fontWeight:700,color:"#6B7EC4"}}>{listedItems.length}</div>
              </div>
              <div style={{width:1,height:32,background:"#15151D"}}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:"#353545",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>Sold</div>
                <div style={{fontSize:20,fontWeight:700,color:"#C0C0D0"}}>{soldItems.length}</div>
              </div>
            </div>

            {totalRev>0 && (
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14}}>
                <div style={{flex:1,height:2,background:"#1A1A22",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(Math.max(margin,0),100)}%`,background:margin>20?"#4CAF7D":margin>10?"#C4784A":"#B85C6E",borderRadius:2,transition:"width 1s cubic-bezier(0.34,1.56,0.64,1)"}}/>
                </div>
                <span style={{fontSize:10,fontWeight:600,color:margin>20?"#4CAF7D":margin>10?"#C4784A":"#B85C6E",fontVariantNumeric:"tabular-nums",minWidth:34,textAlign:"right"}}>{margin.toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
        {[{l:"Revenue",v:"$"+fmtInt(totalRev),c:"#6B7EC4"},{l:"Spent",v:"$"+fmtInt(totalSpend),c:"#C4784A"},{l:"Locked",v:"$"+fmtInt(locked),c:"#A8873A"}].map(s=>(
          <div key={s.l} style={S.statTile}>
            <div style={S.statTileLabel}>{s.l}</div>
            <div style={{...S.statTileVal,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Return Tracking */}
      {returnItems.filter(i=>(daysLeftReturn(i.datePurchased,i.returnStore)??1)>0).length>0&&(
        <section style={{marginTop:24}}>
          <SHead title="Return Tracking" sub={`${returnItems.length} item${returnItems.length!==1?"s":""}`}/>
          {/* Group by store */}
          {Object.keys(RETURN_STORES).map(store=>{
            const storeItems=[...returnItems].filter(i=>i.returnStore===store&&(daysLeftReturn(i.datePurchased,store)??1)>0).sort((a,b)=>{
              const da=daysLeftReturn(a.datePurchased,store)??999;
              const db=daysLeftReturn(b.datePurchased,store)??999;
              return da-db;
            });
            if(!storeItems.length) return null;
            const meta=RETURN_STORES[store];
            return (
              <div key={store} style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:3,height:12,borderRadius:2,background:meta.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:meta.color,fontWeight:600,letterSpacing:"0.4px",textTransform:"uppercase"}}>{meta.label}</span>
                  <span style={{fontSize:10,color:"#2E2E3E"}}>· {meta.days}-day window</span>
                </div>
                {storeItems.map(item=>{
                  const d=daysLeftReturn(item.datePurchased,store);
                  const urgent=d!==null&&d<=14;
                  return (
                    <div key={item.id} style={{...S.rowCard,cursor:"pointer",borderColor:urgent?"#B85C6E20":"#15151D",marginBottom:6}} onClick={()=>onEdit(item)}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={S.rowTitle}>{item.name}</div>
                        <div style={S.rowMeta}>${parseFloat(item.cogs||0).toFixed(2)} · <StatusBadge s={item.status}/></div>
                      </div>
                      {d!==null?(
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:24,fontWeight:800,color:urgColor(d),fontVariantNumeric:"tabular-nums",lineHeight:1}}>{Math.max(d,0)}</div>
                          <div style={{fontSize:9,color:"#404050",letterSpacing:"0.3px",marginTop:1}}>days left</div>
                        </div>
                      ):<span style={{fontSize:11,color:"#404050"}}>No date</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {/* Recently sold */}
      {soldItems.length>0&&(
        <section style={{marginTop:24}}>
          <SHead title="Recently sold"/>
          {[...soldItems].sort((a,b)=>new Date(b.dateSold||0)-new Date(a.dateSold||0)).slice(0,5).map(item=>{
            const p=calcProfit(item); const ds=item.dateSold?daysSince(item.dateSold):null;
            return (
              <div key={item.id} className="item-card" style={{...S.rowCard,cursor:"pointer"}} onClick={()=>onEdit(item)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={S.rowTitle}>{item.name}</div>
                  <div style={S.rowMeta}>{item.platform}{item.dateSold?` · ${ds===0?"today":ds===1?"yesterday":fmtDate(item.dateSold)}`:""}</div>
                </div>
                <ProfitBadge p={p} fmt={fmt}/>
              </div>
            );
          })}
        </section>
      )}

      {/* All items */}
      {items.length>0&&(
        <section style={{marginTop:24}}>
          <SHead title="All items"/>
          {items.map(item=>{
            const p=calcProfit(item);
            return (
              <div key={item.id} className="item-card" style={{...S.rowCard,cursor:"pointer",opacity:item.status==="sold"?0.55:1}} onClick={()=>onEdit(item)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={S.rowTitle}>{item.name}</div>
                  <div style={S.rowMeta}>{item.source||item.platform} · <StatusBadge s={item.status}/></div>
                </div>
                <ProfitBadge p={p} fmt={fmt} dash={!item.salePrice}/>
              </div>
            );
          })}
        </section>
      )}

      {items.length===0&&<EmptyState icon="◈" title="Nothing tracked yet" sub="Head to Inventory to log your first item"/>}
    </div>
  );
}

// ── Inventory ───────────────────────────────────────────────────────────────
function Inventory({ filtered, filter, setFilter, urgentReturn, calcProfit, fmt, urgColor, fmtDate, daysSince, newItemId, exitingId, exitType, flashId, alertDismissed, alertDismissing, onDismissAlert, onEdit, onDelete, onAdvance, onRevert, onAdd }) {
  const nextLabel = item => {
    if(item.status==="incoming") return { label:"Mark as listed", color:"#6B7EC4" };
    if(item.status==="listed")   return { label:"Confirm sold",   color:"#4CAF7D" };
    return null;
  };

  return (
    <div style={{paddingBottom:24,animation:"fadeUp 0.3s ease"}}>
      {urgentReturn.length>0&&!alertDismissed&&(
        <div style={{
          ...S.alertBanner,
          position:"relative",
          overflow:"hidden",
          animation: alertDismissing
            ? "alertSlideOut 0.38s cubic-bezier(0.4,0,1,1) forwards"
            : "alertSlideIn 0.35s cubic-bezier(0.34,1.2,0.64,1) both",
        }}>
          <div style={{fontSize:12,fontWeight:600,color:"#B85C6E",marginBottom:4}}>Return deadline{urgentReturn.length>1?"s":""} approaching</div>
          {urgentReturn.map(i=>{ const d=daysLeftReturn(i.datePurchased,i.returnStore); return(
            <div key={i.id} style={{fontSize:12,color:"#808090"}}>{i.name} <span style={{color:urgColor(d??0),fontWeight:600}}>· {d}d left ({i.returnStore})</span></div>
          );
          })}
          <button onClick={onDismissAlert} style={{position:"absolute",top:8,right:10,background:"none",border:"none",color:"#505060",cursor:"pointer",fontSize:15,lineHeight:1,padding:4,transition:"color 0.15s"}}
            onMouseEnter={e=>e.target.style.color="#B85C6E"} onMouseLeave={e=>e.target.style.color="#505060"}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div style={S.filterRow}>
        {[["all","All"],["incoming","Incoming"],["listed","Listed"],["sold","Sold"],["returns","Returns"]].map(([v,l])=>(
          <button key={v} className="filter-btn" style={filter===v?S.filterActive:S.filterIdle} onClick={()=>setFilter(v)}>{l}</button>
        ))}
      </div>

      {filtered.length===0?(
        <EmptyState
          icon={filter==="returns"?"↩":filter==="sold"?"✓":filter==="listed"?"◈":"↓"}
          title={filter==="returns"?"No return-tracked items":filter==="sold"?"Nothing sold yet":filter==="listed"?"Nothing listed":filter==="incoming"?"Nothing incoming":"No items yet"}
          action={filter==="all"?{label:"Add your first item",fn:onAdd}:null}
        />
      ):filtered.map(item=>{
        const p=calcProfit(item);
        // return badge handled inline below
        const sc=STATUS[item.status].color;
        const next=nextLabel(item);
        const sitting=item.datePurchased&&item.status!=="sold"?daysSince(item.datePurchased):null;
        const ds=item.dateSold?daysSince(item.dateSold):null;

        const isNew     = newItemId===item.id;
        const isExiting = exitingId===item.id;
        const isFlash   = flashId===item.id;
        const exitClass = isExiting?(exitType==="sold"?"item-sold":"item-delete"):"";
        const cardClass = `item-card${isNew?" item-new":""}${exitClass?" "+exitClass:""}`;

        return (
          <div key={item.id} className={cardClass}
            style={{...S.itemCard, opacity:item.status==="sold"&&!isExiting?0.65:1, animation: isFlash?"greenFlash 0.6s ease":undefined}}>
            {/* Status bar */}
            <div className="status-bar" style={{...S.itemStatusBar,background:sc}}/>

            <div style={S.itemBody}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3,gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                  {item.imageUrl&&<img src={item.imageUrl} alt="" onError={e=>e.target.style.display="none"} style={{width:36,height:36,objectFit:"contain",borderRadius:6,background:"#fff",flexShrink:0}}/>}
                  <div style={S.itemName}>{item.name}</div>
                </div>
                {item.salePrice&&<ProfitBadge p={p} fmt={fmt}/>}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <StatusBadge s={item.status}/>
                {item.source&&<span style={S.metaChip}>{item.source}</span>}
                {parseFloat(item.qty)>1&&<span style={S.metaChip}>×{item.qty}</span>}
              </div>

              <div style={S.itemDates}>
                {item.datePurchased&&<span>Bought {fmtDate(item.datePurchased)}</span>}
                {sitting!==null&&<span style={{color:sitting>30?"#C4784A":"#3A3A50"}}> · {sitting}d in stock</span>}
                {item.dateSold&&<span style={{color:"#4CAF7D"}}> · Sold {ds===0?"today":ds===1?"yesterday":fmtDate(item.dateSold)}</span>}
                {item.status==="sold"&&item.platform&&<span style={{color:"#3A3A50"}}> via {item.platform}</span>}
                {item.buyerNote&&<span style={{color:"#505060"}}> · {item.buyerNote}</span>}
              </div>

              {item.returnStore&&RETURN_STORES[item.returnStore]&&item.status!=="sold"&&(()=>{
                const d=daysLeftReturn(item.datePurchased,item.returnStore);
                const meta=RETURN_STORES[item.returnStore];
                if(d===null) return null;
                return (
                  <div style={{marginTop:6,marginBottom:2}}>
                    <span style={{background:meta.color+"18",color:d<=7?"#B85C6E":d<=20?"#C4784A":meta.color,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:600,letterSpacing:"0.3px"}}>
                      {meta.label} · {d>0?`${d}d to return`:"expired"}
                    </span>
                  </div>
                );
              })()}

              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
                {next&&<ActionBtn color={next.color} onClick={()=>onAdvance(item)}>{next.label}</ActionBtn>}
                {item.status!=="incoming"&&<ActionBtn color="#3A3A50" onClick={()=>onRevert(item)}>Revert</ActionBtn>}
                <ActionBtn color="#4A4A60" onClick={()=>onEdit(item)}>Edit</ActionBtn>
                <ActionBtn color="#6E3A42" onClick={()=>onDelete(item.id)}>Delete</ActionBtn>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Micro-components ────────────────────────────────────────────────────────
const Lbl        = ({children}) => <div style={{fontSize:11,color:"#404050",fontWeight:500,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>{children}</div>;
const InputLabel = ({children}) => <div style={{fontSize:11,color:"#404050",fontWeight:500,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>{children}</div>;
const Tog        = ({on}) => <div style={{width:46,height:26,borderRadius:13,background:on?"#6B7EC4":"#1C1C28",position:"relative",transition:"background 0.25s",flexShrink:0,boxShadow:on?"0 0 12px #6B7EC440":"none"}}><div style={{position:"absolute",top:3,left:on?23:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left 0.25s",boxShadow:"0 1px 4px #0008"}}/></div>;
const StatusBadge= ({s}) => <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.4px",color:STATUS[s].color,background:STATUS[s].bg,borderRadius:4,padding:"2px 6px",textTransform:"uppercase",transition:"color 0.3s,background 0.3s"}}>{STATUS[s].label}</span>;
const ProfitBadge= ({p,fmt,dash}) => <span style={{fontSize:12,fontWeight:700,fontVariantNumeric:"tabular-nums",color:p>=0?"#4CAF7D":"#B85C6E",background:(p>=0?"#4CAF7D":"#B85C6E")+"14",borderRadius:5,padding:"3px 8px",whiteSpace:"nowrap",flexShrink:0}}>{dash?"—":p>=0?"+"+fmt(p):fmt(p)}</span>;
const ActionBtn  = ({color,onClick,children}) => <button className="ghost-btn" style={{background:color+"18",color,border:`1px solid ${color}28`,borderRadius:6,padding:"5px 11px",fontSize:11,fontWeight:500,cursor:"pointer",letterSpacing:"0.2px",transition:"opacity 0.15s"}} onClick={onClick}>{children}</button>;
const SHead      = ({title,sub}) => <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}><span style={{fontSize:11,color:"#404050",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.6px"}}>{title}</span>{sub&&<span style={{fontSize:10,color:"#2E2E3E"}}>{sub}</span>}</div>;
const EmptyState = ({icon,title,sub,action}) => <div style={{textAlign:"center",padding:"64px 20px"}}><div style={{fontSize:28,marginBottom:12,color:"#2A2A38"}}>{icon}</div><div style={{fontSize:15,fontWeight:600,color:"#505060",marginBottom:4}}>{title}</div>{sub&&<div style={{fontSize:12,color:"#353545"}}>{sub}</div>}{action&&<button style={{...S.btnPrimary,marginTop:20,maxWidth:180,margin:"20px auto 0",display:"block",fontSize:13,padding:"11px"}} onClick={action.fn}>{action.label}</button>}</div>;
const DashIco    = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
const CalIco     = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
const BoxIco     = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

// ── Monthly list ────────────────────────────────────────────────────────────
function Monthly({ soldItems, calcProfit, fmt, fmtInt, fmtDate, onOpenMonth }) {
  const grouped = {};
  soldItems.forEach(item => {
    const key = item.dateSold ? item.dateSold.slice(0,7) : "unknown";
    if(!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  const months = Object.keys(grouped).filter(k=>k!=="unknown").sort((a,b)=>b.localeCompare(a));
  if(grouped["unknown"]) months.push("unknown");

  const fmtMonth = key => {
    if(key==="unknown") return "Unknown date";
    const [y,m] = key.split("-");
    return new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  };
  const bestMonth = months.reduce((best,k)=>{
    const p = grouped[k].reduce((s,i)=>s+calcProfit(i),0);
    return p>(best.profit||0)?{key:k,profit:p}:best;
  },{});

  if(months.length===0) return (
    <div style={{paddingBottom:24,animation:"fadeUp 0.3s ease"}}>
      <div style={{textAlign:"center",padding:"64px 20px"}}>
        <div style={{fontSize:28,marginBottom:12,color:"#2A2A38"}}>📅</div>
        <div style={{fontSize:15,fontWeight:600,color:"#505060"}}>No sales yet</div>
        <div style={{fontSize:12,color:"#353545",marginTop:4}}>Monthly breakdown appears once you start selling</div>
      </div>
    </div>
  );

  return (
    <div style={{paddingBottom:24,animation:"fadeUp 0.3s ease"}}>
      {bestMonth.key && (
        <div style={{background:"linear-gradient(135deg,#6B7EC412,#4CAF7D08)",border:"1px solid #6B7EC425",borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#404050",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:500,marginBottom:3}}>Best month</div>
            <div style={{fontSize:14,fontWeight:700,color:"#C0C0D0"}}>{fmtMonth(bestMonth.key)}</div>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#4CAF7D",fontVariantNumeric:"tabular-nums"}}>+{fmt(bestMonth.profit)}</div>
        </div>
      )}

      <div style={{fontSize:11,color:"#404050",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:10,marginTop:6}}>Months</div>
      {months.map(key=>{
        const its     = grouped[key];
        const revenue = its.reduce((s,i)=>s+(parseFloat(i.salePrice)||0),0);
        const profit  = its.reduce((s,i)=>s+calcProfit(i),0);
        const isBest  = key===bestMonth.key;
        return (
          <button key={key} className="ghost-btn" onClick={()=>onOpenMonth(key)}
            style={{width:"100%",background:"#0D0D12",border:`1px solid ${isBest?"#6B7EC428":"#15151D"}`,borderRadius:14,marginBottom:8,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",transition:"background 0.15s, box-shadow 0.15s",color:"inherit",fontFamily:"inherit"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:700,color:"#D0D0E0",letterSpacing:"-0.2px"}}>{fmtMonth(key)}</div>
                {isBest&&<span style={{fontSize:9,background:"#6B7EC420",color:"#6B7EC4",borderRadius:4,padding:"1px 6px",fontWeight:600,letterSpacing:"0.3px",textTransform:"uppercase"}}>Best</span>}
              </div>
              <div style={{fontSize:11,color:"#404050"}}>{its.length} sale{its.length!==1?"s":""} · ${fmtInt(revenue)} revenue</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:18,fontWeight:800,color:profit>=0?"#4CAF7D":"#B85C6E",fontVariantNumeric:"tabular-nums"}}>{profit>=0?"+":""}{fmt(profit)}</div>
            </div>
            <div style={{color:"#2E2E3E",fontSize:14,flexShrink:0}}>›</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Month detail page ────────────────────────────────────────────────────────
function MonthDetail({ monthKey, soldItems, calcProfit, fmt, fmtInt, fmtDate, onClose }) {
  const fmtMonth = key => {
    const [y,m] = key.split("-");
    return new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  };
  const its     = soldItems.filter(i=>i.dateSold&&i.dateSold.slice(0,7)===monthKey)
                           .sort((a,b)=>new Date(b.dateSold)-new Date(a.dateSold));
  const revenue = its.reduce((s,i)=>s+(parseFloat(i.salePrice)||0),0);
  const profit  = its.reduce((s,i)=>s+calcProfit(i),0);
  const spend   = its.reduce((s,i)=>s+(parseFloat(i.cogs)||0)*(parseFloat(i.qty)||1),0);

  return (
    <div style={{position:"fixed",inset:0,background:"#09090D",zIndex:40,display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",animation:"slideInRight 0.32s cubic-bezier(0.34,1.1,0.64,1)"}}>
      <style>{`@keyframes slideInRight{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{background:"#09090Dee",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid #15151D",padding:"15px 20px",position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#6B6B7E",cursor:"pointer",padding:4,display:"flex",alignItems:"center",fontSize:20,lineHeight:1}}>‹</button>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700,color:"#F0F0F8",letterSpacing:"-0.3px"}}>{fmtMonth(monthKey)}</div>
          <div style={{fontSize:11,color:"#404050",marginTop:1}}>{its.length} sale{its.length!==1?"s":" "}</div>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{display:"flex",borderBottom:"1px solid #15151D"}}>
        {[{l:"Profit",v:(profit>=0?"+":"")+fmt(profit),c:profit>=0?"#4CAF7D":"#B85C6E"},{l:"Revenue",v:"$"+fmtInt(revenue),c:"#6B7EC4"},{l:"Spent",v:"$"+fmtInt(spend),c:"#C4784A"}].map(s=>(
          <div key={s.l} style={{flex:1,padding:"12px 0",textAlign:"center",borderRight:"1px solid #15151D"}}>
            <div style={{fontSize:9,color:"#404050",textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:500,marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:15,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Order history scroll */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px 80px"}}>
        {its.length===0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:"#404050",fontSize:14}}>No sales this month</div>
        ) : its.map((item,idx)=>{
          const p=calcProfit(item);
          return (
            <div key={item.id} style={{background:"#0D0D12",border:"1px solid #15151D",borderRadius:14,padding:"14px 16px",marginBottom:10,animation:`fadeUp 0.3s ${idx*0.04}s both ease`}}>
              {/* Top row */}
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                {item.imageUrl&&<img src={item.imageUrl} alt="" onError={e=>e.target.style.display="none"} style={{width:44,height:44,objectFit:"contain",borderRadius:8,background:"#fff",flexShrink:0}}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#D0D0E0",letterSpacing:"-0.2px",marginBottom:2}}>{item.name}</div>
                  <div style={{fontSize:11,color:"#404050"}}>
                    {item.dateSold&&fmtDate(item.dateSold)}
                    {item.platform&&` · ${item.platform}`}
                    {parseFloat(item.qty)>1&&` · ×${item.qty}`}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:p>=0?"#4CAF7D":"#B85C6E",fontVariantNumeric:"tabular-nums"}}>{p>=0?"+":""}{fmt(p)}</div>
                  <div style={{fontSize:10,color:"#404050",marginTop:1}}>profit</div>
                </div>
              </div>

              {/* Detail row */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {parseFloat(item.cogs)>0&&<span style={{fontSize:10,color:"#404050",background:"#15151D",borderRadius:4,padding:"2px 7px"}}>Cost ${parseFloat(item.cogs).toFixed(2)}{parseFloat(item.qty)>1?` ×${item.qty}`:""}</span>}
                {parseFloat(item.salePrice)>0&&<span style={{fontSize:10,color:"#404050",background:"#15151D",borderRadius:4,padding:"2px 7px"}}>Sold ${parseFloat(item.salePrice).toFixed(2)}</span>}
                {item.source&&<span style={{fontSize:10,color:"#404050",background:"#15151D",borderRadius:4,padding:"2px 7px"}}>{item.source}</span>}
                {item.buyerNote&&<span style={{fontSize:10,color:"#505060",background:"#15151D",borderRadius:4,padding:"2px 7px"}}>👤 {item.buyerNote}</span>}
                {item.notes&&<span style={{fontSize:10,color:"#404050",background:"#15151D",borderRadius:4,padding:"2px 7px"}}>{item.notes}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  root: { background:"#09090D", minHeight:"100vh", fontFamily:"'Inter',system-ui,-apple-system,sans-serif", color:"#C8C8D8", display:"flex", flexDirection:"column", maxWidth:"100vw", margin:"0 auto", position:"relative" },

  // Header
  header:      { background:"#09090Dee", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderBottom:"1px solid #15151D", padding:"15px 20px", position:"sticky", top:0, zIndex:10 },
  headerInner: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  logo:        { display:"flex", alignItems:"baseline", gap:0 },
  logoText:    { fontSize:16, fontWeight:800, color:"#F0F0F8", letterSpacing:"-0.5px" },
  logoAccent:  { fontSize:16, fontWeight:800, color:"#F0F0F8", letterSpacing:"-0.5px" },
  syncIndicator:{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#404050", letterSpacing:"0.3px" },
  syncDot:     { width:5, height:5, borderRadius:"50%", flexShrink:0 },
  addBtn:      { display:"flex", alignItems:"center", gap:6, background:"#6B7EC4", color:"#fff", border:"none", borderRadius:8, padding:"7px 13px", fontWeight:600, fontSize:12, cursor:"pointer", letterSpacing:"0.2px" },

  main: { flex:1, padding:"16px 16px 88px", overflowY:"auto" },

  // Nav
  nav:    { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"#0D0D12", borderTop:"1px solid #15151D", display:"flex", zIndex:20, paddingBottom:"env(safe-area-inset-bottom,0px)" },
  navBtn: { flex:1, background:"none", border:"none", cursor:"pointer", padding:"11px 0 13px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 },

  // Hero
  heroCard:    { background:"linear-gradient(145deg,#0F0F16 0%,#0C0C14 100%)", border:"1px solid #16161F", borderRadius:20, padding:"24px 22px 22px", marginBottom:10 },
  heroEyebrow: { fontSize:10, color:"#404050", textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:500, marginBottom:10 },

  // Stat tiles
  statTile:      { background:"#0D0D12", border:"1px solid #15151D", borderRadius:14, padding:"13px 14px" },
  statTileLabel: { fontSize:9, color:"#353545", textTransform:"uppercase", letterSpacing:"0.6px", fontWeight:500, marginBottom:5 },
  statTileVal:   { fontSize:17, fontWeight:800, fontVariantNumeric:"tabular-nums", letterSpacing:"-0.5px" },

  // Row cards (dashboard list items)
  rowCard:  { background:"#0D0D12", border:"1px solid #15151D", borderRadius:12, padding:"13px 14px", marginBottom:6, display:"flex", alignItems:"center", gap:12, transition:"background 0.15s" },
  rowTitle: { fontWeight:600, fontSize:13, color:"#C0C0D0", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  rowMeta:  { fontSize:11, color:"#404050", display:"flex", alignItems:"center", gap:5 },

  // Inventory item cards
  itemCard:    { background:"#0D0D12", border:"1px solid #15151D", borderRadius:14, marginBottom:8, overflow:"hidden", display:"flex", transition:"background 0.15s" },
  itemStatusBar:{ width:3, flexShrink:0 },
  itemBody:    { flex:1, padding:"13px 14px" },
  itemName:    { fontWeight:600, fontSize:14, color:"#D0D0E0", flex:1, marginRight:8, lineHeight:1.3, letterSpacing:"-0.2px" },
  itemDates:   { fontSize:10, color:"#353545", lineHeight:1.7, letterSpacing:"0.1px" },
  metaChip:    { fontSize:10, color:"#404050", background:"#15151D", borderRadius:4, padding:"1px 6px", fontWeight:500 },

  // Form
  formPage:   { minHeight:"100vh", background:"#09090D", display:"flex", flexDirection:"column" },
  formHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 20px", borderBottom:"1px solid #15151D", position:"sticky", top:0, background:"#09090Dee", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", zIndex:10 },
  backBtn:    { background:"none", border:"none", color:"#404050", cursor:"pointer", padding:4, display:"flex", alignItems:"center", borderRadius:6 },
  formTitle:  { fontSize:15, fontWeight:600, color:"#D0D0E0", letterSpacing:"-0.3px" },
  formScroll: { padding:"22px 20px 48px", flex:1 },
  input:      { width:"100%", background:"#0D0D12", border:"1px solid #1A1A24", borderRadius:10, padding:"12px 14px", color:"#D0D0E0", fontSize:14, outline:"none", fontFamily:"inherit", WebkitAppearance:"none", transition:"border-color 0.15s", display:"block" },
  inputIconWrap:{ position:"relative" },
  inputIcon:  { position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", color:"#404050", fontSize:14, pointerEvents:"none" },
  inputWithIcon:{ width:"100%", background:"#0D0D12", border:"1px solid #1A1A24", borderRadius:10, padding:"12px 14px 12px 24px", color:"#D0D0E0", fontSize:14, outline:"none", fontFamily:"inherit", WebkitAppearance:"none", boxSizing:"border-box" },
  toggleRow:  { display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0D0D12", border:"1px solid #1A1A24", borderRadius:12, padding:"14px 16px", cursor:"pointer", marginBottom:20, userSelect:"none" },

  // Buttons
  btnPrimary: { width:"100%", background:"#6B7EC4", color:"#fff", border:"none", borderRadius:11, padding:"14px", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.1px" },
  btnGhost:   { flex:1, background:"#13131A", color:"#808090", border:"1px solid #1C1C28", borderRadius:10, padding:"13px", fontWeight:500, fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnDanger:  { flex:1, background:"#B85C6E14", color:"#B85C6E", border:"1px solid #B85C6E28", borderRadius:10, padding:"13px", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnSuccess: { flex:1, background:"#4CAF7D18", color:"#4CAF7D", border:"1px solid #4CAF7D30", borderRadius:10, padding:"13px", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" },

  // Modals / sheets
  overlay:      { position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)", zIndex:50, display:"flex", alignItems:"flex-end" },
  sheet:        { background:"#0E0E14", border:"1px solid #1A1A24", borderTop:"1px solid #22222E", borderRadius:"20px 20px 0 0", padding:"16px 20px 36px", width:"100%", animation:"fadeUp 0.25s ease" },
  sheetHandle:  { width:36, height:4, background:"#22222E", borderRadius:2, margin:"0 auto 20px" },
  sheetTitle:   { fontSize:17, fontWeight:700, color:"#E0E0F0", letterSpacing:"-0.4px" },
  sheetSub:     { fontSize:13, color:"#505060", marginTop:4, marginBottom:0 },

  // Sell modal
  priceInputWrap:{ position:"relative", marginBottom:16 },
  priceSymbol:   { position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:22, fontWeight:700, color:"#404050" },
  priceInput:    { width:"100%", background:"#0D0D12", border:"1px solid #1A1A24", borderRadius:12, padding:"14px 14px 14px 34px", color:"#D0D0E0", fontSize:24, fontWeight:800, outline:"none", fontFamily:"inherit", WebkitAppearance:"none", fontVariantNumeric:"tabular-nums", boxSizing:"border-box" },
  profitPreview: { border:"1px solid", borderRadius:12, padding:"14px", textAlign:"center", marginBottom:4 },

  // Filters
  filterRow:   { display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 },
  filterActive:{ background:"#6B7EC4", color:"#fff", border:"none", borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, letterSpacing:"0.2px" },
  filterIdle:  { background:"#0D0D12", color:"#404050", border:"1px solid #15151D", borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:400, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, letterSpacing:"0.2px" },

  alertBanner: { background:"#B85C6E0A", border:"1px solid #B85C6E1E", borderRadius:12, padding:"12px 14px", marginBottom:14 },

  // Misc
  toast:       { position:"fixed", bottom:96, left:"50%", transform:"translateX(-50%)", background:"#16161E", border:"1px solid #22222E", color:"#C0C0D0", borderRadius:20, padding:"9px 16px", fontSize:12, fontWeight:500, zIndex:100, boxShadow:"0 8px 32px rgba(0,0,0,0.6)", display:"flex", alignItems:"center", gap:7, whiteSpace:"nowrap", pointerEvents:"none", letterSpacing:"0.2px" },
  toastDot:    { width:5, height:5, borderRadius:"50%", background:"#6B7EC4", flexShrink:0 },
  loadingWrap: { display:"flex", alignItems:"center", justifyContent:"center", minHeight:300 },
  spinner:     { width:24, height:24, border:"2px solid #1A1A24", borderTopColor:"#6B7EC4", borderRadius:"50%", animation:"spin 0.7s linear infinite" },
};
