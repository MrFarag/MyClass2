(function(){
  firebase.initializeApp({
    apiKey:"AIzaSyB7E4NsGQbCehVSQ3Kj97yExRZwpHzTOl8",
    databaseURL:"https://myclaive-default-rtdb.firebaseio.com"
  });
  const db=firebase.database();

  const KEYS=['joinRequests','approvedStudents','onlineStudents','handRaised',
    'micRequests','micPermissions','studentImages','draw_t','draw_st',
    'boardCmd','boardImg','boardImg_stu','correctedImg','rtc','teacher_draw_on_student','boardView'];
  Promise.all(KEYS.map(k=>db.ref(k).remove())).then(()=>console.log('✓ جلسة نظيفة'));

  const CW=1280, CH=720;
  const mc=document.getElementById('mc');
  const mx=mc.getContext('2d');
  mc.width=CW; mc.height=CH;
  function ic(ctx){ctx.lineCap='round';ctx.lineJoin='round';}
  ic(mx); mx.fillStyle='#fff'; mx.fillRect(0,0,CW,CH);
  // homeFab مخفي افتراضياً بالـ CSS

  // Offscreen canvas للصورة الخلفية (صورة الطالب)
  // mc = طبقة الرسم فوق الصورة
  // mcBG = صورة الطالب (لا تُمسح بالاستيكة)
  const mcBG = document.createElement('canvas');
  mcBG.width=CW; mcBG.height=CH;
  const mxBG = mcBG.getContext('2d');
  mxBG.fillStyle='#fff'; mxBG.fillRect(0,0,CW,CH);

  // دمج الطبقتين على mc الظاهر
  function compositeTeacher(){
    mx.globalCompositeOperation='source-over'; // ضروري دائماً
    mx.fillStyle='#fff'; mx.fillRect(0,0,CW,CH);
    mx.drawImage(mcBG,0,0);
    mx.drawImage(mcDraw,0,0);
  }

  // offscreen canvas للرسم (المدرس + الطالب)
  const mcDraw = document.createElement('canvas');
  mcDraw.width=CW; mcDraw.height=CH;
  const mxD = mcDraw.getContext('2d');
  ic(mxD);

  let scale=1;
  const bWrap=document.getElementById('bWrap');
  function applyScale(s){
    s=Math.max(0.15,Math.min(5,s)); scale=s;
    const W=CW*s, H=CH*s;
    mc.style.width=W+'px'; mc.style.height=H+'px';
    bWrap.style.alignItems    = H<bWrap.clientHeight?'center':'flex-start';
    bWrap.style.justifyContent= W<bWrap.clientWidth ?'center':'flex-start';
    bWrap.style.direction='ltr'; // scroll يبدأ من اليسار
    document.getElementById('zv').textContent=Math.round(s*100)+'%';
  }
  function fit(){
    let W=bWrap.clientWidth, H=bWrap.clientHeight;
    if(!W||!H){W=window.innerWidth-200;H=window.innerHeight-46-40-68;}
    // نملأ الحيز كاملاً - الجانب الفائض يُكشف بالـ scroll
    applyScale(Math.max(W/CW, H/CH));
  }
  window.Z = d => applyScale(scale+d);
  window.fit = fit;
  setTimeout(fit,200);
  // لا نعيد fit مع resize المتصفح

  function xy(e){
    const r=mc.getBoundingClientRect(),t=e.touches?e.touches[0]:e;
    return{x:(t.clientX-r.left)*(CW/r.width), y:(t.clientY-r.top)*(CH/r.height)};
  }

  let tool='pen',clr='#000',sz=4;
  let drawing=false,strokeId=0,pts=[],ptimer=null;
  let shapeStart=null;
  let shapePreview=null;
  let hlSnap=null; // snapshot للفسفوري
  let students={},waiting={},images={};
  let currentSpeaker=null, currentBoard='main';
  let lastMainImg=null;
  let lastStuImg={};
  const peerConnections={};
  const dataChannels={};

  /* ===== أحداث الرسم ===== */
  mc.addEventListener('mousedown', e=>startD(e));
  mc.addEventListener('mousemove', e=>moveD(e));
  mc.addEventListener('mouseup',   ()=>stopD());
  mc.addEventListener('mouseleave',()=>stopD());
  mc.addEventListener('touchstart',e=>startD(e),{passive:false});
  mc.addEventListener('touchmove', e=>moveD(e), {passive:false});
  mc.addEventListener('touchend',  ()=>stopD());

  const SHAPE_LIST=['line','arrow','rect','circle','tri'];
  function isShape(){ return SHAPE_LIST.includes(tool); }

  function startD(e){
    e.preventDefault(); drawing=true; strokeId=Date.now(); pts=[];
    const p=xy(e);
    if(isShape()){
      shapeStart={x:p.x,y:p.y};
      // احفظ snapshot للمعاينة
      shapePreview = document.createElement('canvas');
      shapePreview.width=CW; shapePreview.height=CH;
      const ctx=shapePreview.getContext('2d');
      if(currentBoard==='main') ctx.drawImage(mc,0,0);
      else { ctx.drawImage(mcBG,0,0); ctx.drawImage(mcDraw,0,0); }
      return;
    }
    // snapshot للفسفوري
    if(tool==='highlight'){
      hlSnap = document.createElement('canvas');
      hlSnap.width=CW; hlSnap.height=CH;
      const hc=hlSnap.getContext('2d');
      if(currentBoard==='main') hc.drawImage(mc,0,0);
      else { hc.drawImage(mcBG,0,0); hc.drawImage(mcDraw,0,0); }
    }
    if(currentBoard==='main'){
      ic(mx); mx.globalCompositeOperation='source-over';
      if(tool!=='highlight') { mx.beginPath(); mx.moveTo(p.x,p.y); }
    } else {
      ic(mxD); mxD.globalCompositeOperation='source-over';
      if(tool!=='highlight') { mxD.beginPath(); mxD.moveTo(p.x,p.y); }
    }
    pts.push({x:p.x/CW,y:p.y/CH});
  }
  function drawShapePreview(x2,y2){
    // أعد الـ canvas للحالة قبل الشكل
    const ctx = currentBoard==='main' ? mx : null;
    if(currentBoard==='main'){
      mx.globalCompositeOperation='source-over';
      mx.clearRect(0,0,CW,CH); mx.drawImage(shapePreview,0,0);
      renderShape(mx,shapeStart.x,shapeStart.y,x2,y2);
    } else {
      mxD.globalCompositeOperation='source-over';
      mxD.clearRect(0,0,CW,CH); mxD.drawImage(shapePreview,0,0);
      // shapePreview للـ mxD فقط
      renderShape(mxD,shapeStart.x,shapeStart.y,x2,y2);
      compositeTeacher();
    }
  }

  function renderShape(ctx,x1,y1,x2,y2){
    ctx.save();
    ctx.strokeStyle=clr; ctx.lineWidth=sz;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    if(tool==='line'){
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    } else if(tool==='arrow'){
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      const angle=Math.atan2(y2-y1,x2-x1);
      const hs=Math.max(12,sz*3);
      ctx.beginPath();
      ctx.moveTo(x2,y2);
      ctx.lineTo(x2-hs*Math.cos(angle-0.4),y2-hs*Math.sin(angle-0.4));
      ctx.lineTo(x2-hs*Math.cos(angle+0.4),y2-hs*Math.sin(angle+0.4));
      ctx.closePath(); ctx.fillStyle=clr; ctx.fill();
    } else if(tool==='rect'){
      ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
    } else if(tool==='circle'){
      const rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
      ctx.ellipse(Math.min(x1,x2)+rx,Math.min(y1,y2)+ry,rx,ry,0,0,Math.PI*2);
      ctx.stroke();
    } else if(tool==='tri'){
      const mx2=(x1+x2)/2;
      ctx.moveTo(mx2,Math.min(y1,y2));
      ctx.lineTo(Math.min(x1,x2),Math.max(y1,y2));
      ctx.lineTo(Math.max(x1,x2),Math.max(y1,y2));
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  function moveD(e){
    e.preventDefault(); if(!drawing)return;
    const p=xy(e);
    const isEra = tool==='eraser';
    if(isShape()){ if(shapeStart){ drawShapePreview(p.x,p.y); pts=[{x:p.x/CW,y:p.y/CH}]; } return; }
    const isHL = tool==='highlight';
    if(isHL){
      // أضف النقطة أولاً ثم ارسم من snapshot
      pts.push({x:p.x/CW,y:p.y/CH});
      if(hlSnap && pts.length>=2){
        const tgt = currentBoard==='main' ? mx : mxD;
        tgt.clearRect(0,0,CW,CH);
        tgt.drawImage(hlSnap,0,0);
        tgt.save();
        tgt.globalAlpha=0.38;
        tgt.strokeStyle=clr;
        tgt.lineWidth=sz*5;
        tgt.lineCap='round'; tgt.lineJoin='round';
        tgt.beginPath();
        tgt.moveTo(pts[0].x*CW,pts[0].y*CH);
        for(let i=1;i<pts.length;i++) tgt.lineTo(pts[i].x*CW,pts[i].y*CH);
        tgt.stroke();
        tgt.restore();
        if(currentBoard!=='main') compositeTeacher();
      }
      if(!ptimer) ptimer=setTimeout(flush,10);
      return;
    } else if(currentBoard==='main'){
      mx.globalCompositeOperation='source-over';
      mx.globalAlpha=1.0;
      mx.strokeStyle = isEra ? '#fff' : clr;
      mx.lineWidth   = isEra ? sz*5 : sz;
      mx.lineTo(p.x,p.y); mx.stroke(); mx.beginPath(); mx.moveTo(p.x,p.y);
    } else {
      const lw = isEra ? sz*5 : sz;
      if(isEra){
        mxD.lineCap='round'; mxD.lineJoin='round';
        mxD.globalCompositeOperation='destination-out';
        mxD.strokeStyle='rgba(0,0,0,1)';
        mxD.lineWidth=lw;
        mxD.lineTo(p.x,p.y); mxD.stroke();
        mxD.globalCompositeOperation='source-over';
        mxD.beginPath(); mxD.moveTo(p.x,p.y);
      } else {
        mxD.lineCap='round'; mxD.lineJoin='round';
        mxD.globalCompositeOperation='source-over';
        mxD.strokeStyle=clr;
        mxD.lineWidth=lw;
        mxD.lineTo(p.x,p.y); mxD.stroke();
        mxD.beginPath(); mxD.moveTo(p.x,p.y);
      }
      compositeTeacher();
    }
    pts.push({x:p.x/CW,y:p.y/CH});
    if(!ptimer) ptimer=setTimeout(flush, 10);
  }
  function flush(){
    ptimer=null; if(!pts.length)return;
    const isEra = tool==='eraser';
    const isHL  = tool==='highlight';
    const data = {
      pts:  pts.slice(),
      c:    isEra ? null : clr,
      s:    isEra ? sz*5 : isHL ? sz*5 : sz,
      era:  isEra,
      hl:   isHL,
      sid:  strokeId,
      ts:   Date.now()
    };
    if(currentBoard !== 'main'){
      db.ref('teacher_draw_on_student/'+currentBoard).push(data);
    } else {
      db.ref('draw_t').push(data);
    }
    // للفسفوري: لا نصفّر pts — الرسم يحتاج كل النقاط من البداية
    if(!isHL) pts=[];
  }
  function stopD(){
    if(!drawing)return; drawing=false;
    // تثبيت الفسفوري
    if(tool==='highlight' && hlSnap && pts.length>=1){
      const tgt = currentBoard==='main' ? mx : mxD;
      tgt.clearRect(0,0,CW,CH);
      tgt.drawImage(hlSnap,0,0);
      tgt.save();
      tgt.globalAlpha=0.38;
      tgt.strokeStyle=clr;
      tgt.lineWidth=sz*5;
      tgt.lineCap='round'; tgt.lineJoin='round';
      tgt.beginPath();
      tgt.moveTo(pts[0].x*CW,pts[0].y*CH);
      pts.forEach(pt=>tgt.lineTo(pt.x*CW,pt.y*CH));
      tgt.stroke();
      tgt.restore();
      hlSnap=null;
      if(currentBoard==='main') lastMainImg=mc.toDataURL('image/jpeg',0.85);
      return;
    }
    if(isShape() && shapeStart){
      // لا نرسل pts للأشكال - نرسل بيانات الشكل مباشرة
      const endP=pts[pts.length-1]||{x:shapeStart.x/CW,y:shapeStart.y/CH};
      const data={
        shape:tool, x1:shapeStart.x/CW, y1:shapeStart.y/CH,
        x2:endP.x, y2:endP.y,
        c:clr, s:sz, sid:strokeId, ts:Date.now()
      };
      if(currentBoard!=='main') db.ref('teacher_draw_on_student/'+currentBoard).push(data);
      else { db.ref('draw_t').push(data); lastMainImg=mc.toDataURL('image/jpeg',0.85); }
      shapeStart=null; shapePreview=null;
      mxD.globalCompositeOperation='source-over';
      return;
    }
    if(ptimer){clearTimeout(ptimer);ptimer=null;} flush();
    mxD.globalCompositeOperation='source-over';
    mx.globalCompositeOperation='source-over';
    if(currentBoard==='main') lastMainImg=mc.toDataURL('image/jpeg',0.85);
  }

  /* ===== WebRTC DataChannel (للرسم المباشر — اختياري) ===== */
  const RTCConfig={
    iceServers:[
      {urls:'stun:stun.l.google.com:19302'},
      {urls:'stun:stun1.l.google.com:19302'},
      {urls:'stun:stun2.l.google.com:19302'},
      {urls:'stun:stun.cloudflare.com:3478'}
    ],
    bundlePolicy:'max-bundle',
    rtcpMuxPolicy:'require'
  };

  async function setupDataChannelWithStudent(studentId){
    if(peerConnections[studentId]){
      if(dataChannels[studentId]&&dataChannels[studentId].readyState==='open') return;
    }
    const pc=new RTCPeerConnection(RTCConfig);
    peerConnections[studentId]=pc;
    const dc=pc.createDataChannel('teacherDraw',{ordered:false,maxRetransmits:0});
    dataChannels[studentId]=dc;
    pc.onicecandidate=e=>{if(e.candidate)db.ref('rtc/teacherDraw/'+studentId+'/candidate').push(e.candidate.toJSON());};
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
    db.ref('rtc/teacherDraw/'+studentId+'/offer').set({sdp:offer.sdp,type:offer.type});
    db.ref('rtc/teacherDraw/'+studentId+'/answer').on('value',async snap=>{
      const answer=snap.val();
      if(answer&&pc.signalingState==='have-local-offer')
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    db.ref('rtc/teacherDraw/'+studentId+'/candidate').on('child_added',async snap=>{
      const cand=snap.val();
      if(cand){try{await pc.addIceCandidate(new RTCIceCandidate(cand));}catch(e){} snap.ref.remove();}
    });
  }

  db.ref('approvedStudents').on('child_added',snap=>{
    const sid=snap.key;
    if(sid&&students[sid]&&students[sid].online) setupDataChannelWithStudent(sid);
  });
  db.ref('onlineStudents').on('child_removed',snap=>{
    const sid=snap.key;
    if(peerConnections[sid]){peerConnections[sid].close();delete peerConnections[sid];delete dataChannels[sid];}
  });

  /* ===== رسم stroke طالب (دالة مشتركة) ===== */
  const sLP={},sLS={};
  function drawStudentStroke(d, lpMap, lsMap){
    const pts=d.pts,c=d.c,s=d.s||4,id=d.sid,key=d.studentId;
    const isEra   = d.era   === true;
    const isEraBG = d.eraBG === true;
    if(isEraBG){
      ic(mxBG);
      mxBG.globalCompositeOperation='destination-out';
      mxBG.strokeStyle='rgba(0,0,0,1)';
      mxBG.lineWidth=s;
      mxBG.beginPath();
      if(lpMap[key+'_bg']&&id&&id===lsMap[key+'_bg']) mxBG.moveTo(lpMap[key+'_bg'].x,lpMap[key+'_bg'].y);
      else mxBG.moveTo(pts[0].x*CW,pts[0].y*CH);
      pts.forEach(p=>mxBG.lineTo(p.x*CW,p.y*CH));
      mxBG.stroke();
      mxBG.globalCompositeOperation='source-over';
      const last=pts[pts.length-1];
      lpMap[key+'_bg']={x:last.x*CW,y:last.y*CH}; lsMap[key+'_bg']=id;
    } else {
      ic(mxD);
      if(isEra){
        mxD.globalCompositeOperation='destination-out';
        mxD.strokeStyle='rgba(0,0,0,1)';
      } else {
        mxD.globalCompositeOperation='source-over';
        mxD.strokeStyle=c===null?'rgba(0,0,0,0)':c;
      }
      mxD.lineWidth=s;
      mxD.beginPath();
      if(lpMap[key]&&id&&id===lsMap[key]) mxD.moveTo(lpMap[key].x,lpMap[key].y);
      else                                 mxD.moveTo(pts[0].x*CW,pts[0].y*CH);
      pts.forEach(p=>mxD.lineTo(p.x*CW,p.y*CH));
      mxD.stroke();
      mxD.globalCompositeOperation='source-over';
      const last=pts[pts.length-1];
      lpMap[key]={x:last.x*CW,y:last.y*CH}; lsMap[key]=id;
    }
  }

  /* ===== استقبال رسم الطالب (live + ذاكرة) ===== */
  // نخزّن كل stroke لكل طالب في الذاكرة
  const stuStrokes = {}; // {studentId: [{d}, ...]}

  db.ref('draw_st').on('child_added',snap=>{
    const d=snap.val();
    if(!d||!d.pts||!d.studentId) return;
    // خزّن دائماً بغض النظر عن currentBoard
    const sid=d.studentId;
    if(!stuStrokes[sid]) stuStrokes[sid]=[];
    stuStrokes[sid].push(d);
    // ارسم فقط إذا كنا نعاين هذا الطالب الآن
    if(currentBoard===sid){
      drawStudentStroke(d, sLP, sLS);
      compositeTeacher();
    }
  });

  /* ===== أدوات الرسم ===== */
  const SHAPE_TOOLS=['pen','eraser','highlight','line','arrow','rect','circle','tri'];
  const SHAPE_IDS={pen:'tiPen',eraser:'tiEra',highlight:'tiHL',line:'tiLine',arrow:'tiArrow',rect:'tiRect',circle:'tiCircle',tri:'tiTri'};
  window.setTool=t=>{
    tool=t;
    SHAPE_TOOLS.forEach(k=>{ const el=document.getElementById(SHAPE_IDS[k]); if(el) el.classList.toggle('on',k===t); });
  };
  window.setClr=(c,el)=>{clr=c;document.querySelectorAll('.dot').forEach(d=>d.classList.remove('on'));el.classList.add('on');};
  window.clearB=()=>{mx.fillStyle='#fff';mx.fillRect(0,0,CW,CH);db.ref('boardCmd').push({type:'clear',ts:Date.now()});lastMainImg=null;};
  window.saveB =()=>{const a=document.createElement('a');a.download='board.png';a.href=mc.toDataURL();a.click();};
  window.goFS  =()=>{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();};

  window.uploadImg=function(input){
    if(!input.files[0])return;
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image(); img.onload=()=>{
        const ir=img.width/img.height,cr=CW/CH; let dw,dh;
        if(ir>cr){dw=CW;dh=CW/ir;}else{dh=CH;dw=CH*ir;}
        mx.fillStyle='#fff'; mx.fillRect(0,0,CW,CH);
        mx.drawImage(img,(CW-dw)/2,(CH-dh)/2,dw,dh);
        const url=mc.toDataURL('image/jpeg',0.85);
        lastMainImg=url;
        db.ref('boardImg').set({data:url,ts:Date.now()});
      }; img.src=e.target.result;
    };
    r.readAsDataURL(input.files[0]); input.value='';
  };

  function loadOnCanvas(dataUrl, clearDrawLayer=false){
    // clearDrawLayer=true فقط عند تغيير الطالب (viewStudentBoard/mainBoard)
    // عند تحديث صورة الطالب (updateStu) لا نمسح الرسم الحي
    if(clearDrawLayer) mxD.clearRect(0,0,CW,CH);
    mxBG.fillStyle='#fff'; mxBG.fillRect(0,0,CW,CH);
    if(!dataUrl){ compositeTeacher(); return; }
    const img=new Image();
    img.onload=()=>{
      mxBG.fillStyle='#fff'; mxBG.fillRect(0,0,CW,CH);
      mxBG.drawImage(img,0,0,CW,CH);
      compositeTeacher();
    };
    img.src=dataUrl;
  }

  window.mainBoard=()=>{
    document.getElementById('homeFab').classList.remove('visible'); // أخف زر Home
    currentBoard='main';
    document.getElementById('bTitle').textContent='السبورة الرئيسية';
    loadOnCanvas(lastMainImg, true);
    db.ref('boardCmd').push({type:'teacher_returned_main',ts:Date.now()});
  };
  window.viewStudentBoard=(sid,name)=>{
    document.getElementById('homeFab').classList.add('visible'); // أظهر زر Home
    currentBoard=sid;
    // إعادة تعيين نقاط الاستمرارية للطالب الجديد
    Object.keys(sLP).forEach(k=>delete sLP[k]);
    Object.keys(sLS).forEach(k=>delete sLS[k]);
    document.getElementById('bTitle').innerHTML=
      `سبورة ${name} &nbsp;<button onclick="shareBoard('${sid}','${name}')" style="background:#ffaa00;color:#000;border:none;padding:2px 10px;border-radius:16px;font-size:10px;cursor:pointer;font-family:Cairo,sans-serif;vertical-align:middle"><i class="fas fa-share-alt"></i> مشاركة للكل</button>`;
    // تحميل الصورة (تمسح mxD)
    loadOnCanvas(lastStuImg[sid]||null, true);
    // إعادة رسم كل strokes من الذاكرة بعد تحميل الصورة
    setTimeout(()=>{
      const rows=(stuStrokes[sid]||[]).slice().sort((a,b)=>(a.ts||0)-(b.ts||0));
      rows.forEach(d=>drawStudentStroke(d, sLP, sLS));
      compositeTeacher();
    }, 150);
  };
  window.sendTab=(sid,tab)=>{
    db.ref('boardCmd').push({type:'goto_tab', tab, targetId:sid, ts:Date.now()});
  };
  window.shareBoard=(sid,name)=>{
    if(!lastStuImg[sid]){alert('لا توجد صورة بعد.');return;}
    db.ref('boardCmd').push({type:'show_student_board',studentId:sid,studentName:name,data:lastStuImg[sid],ts:Date.now()});
  };

  db.ref('boardImg_stu').on('child_added',  snap=>{const d=snap.val();if(d)updateStu(snap.key,d);});
  db.ref('boardImg_stu').on('child_changed',snap=>{const d=snap.val();if(d)updateStu(snap.key,d);});
  // تتبع أي سبورة يشاهدها الطالب
  db.ref('boardView').on('child_added',  snap=>{if(students[snap.key]){students[snap.key].boardView=snap.val();render();}});
  db.ref('boardView').on('child_changed',snap=>{if(students[snap.key]){students[snap.key].boardView=snap.val();render();}});
  function updateStu(sid,d){
    lastStuImg[sid]=d.data;
    if(currentBoard===sid){
      // الصورة الجديدة تحمل الرسم مدموجاً → امسح mxD لمنع التضاعف
      mxD.clearRect(0,0,CW,CH);
      loadOnCanvas(d.data);
    }
    render();
  }

  /* ===== إدارة قائمة الطلاب ===== */
  function render(){
    let h='';
    Object.values(waiting).forEach(s=>{
      h+=`<div class="si si-wait">
        <div class="scard-name" title="${s.name}">${s.name}</div>
        <div class="sact">
          <i class="fas fa-check-circle" style="color:#4CAF50" title="قبول" onclick="approveS('${s.id}')"></i>
          <i class="fas fa-times-circle" style="color:#b71c1c" title="رفض" onclick="rejectS('${s.id}')"></i>
        </div></div>`;
    });
    Object.values(students).forEach(s=>{
      if(!s.online)return;
      const spk=currentSpeaker===s.id,hand=s.handRaised;
      const hasImg=!!lastStuImg[s.id];
      const bv = s.boardView||'T'; // T=سبورة المدرس  S=سبورة الطالب
      // أيقونة الحالة (مايك/يد/سماعة) ضمن نفس صف الأكشن
      const stIco = hand
        ? `<i class="fas fa-hand-paper blink" style="color:#f59e0b" title="رافع اليد"></i>`
        : spk
          ? `<i class="fas fa-microphone" style="color:#22c55e" title="يتحدث"></i>`
          : `<i class="fas fa-headphones" style="color:#666" title="يستمع"></i>`;
      h+=`<div class="si">
        <div class="scard-name" title="${s.name}">${s.name}</div>
        <div class="sact">
          ${stIco}
          ${s.wantsMic&&!spk?`<i class="fas fa-microphone sact-mic-req" title="السماح بالمايك" onclick="allowMic('${s.id}')"></i>`:''}
          ${spk?`<i class="fas fa-microphone-slash" style="color:#e53935" title="إلغاء المايك" onclick="revokeMic('${s.id}')"></i>`:''}
          ${images[s.id]?.length?`<i class="fas fa-image" title="الواجب" onclick="openCorr('${s.id}','${s.name}')"></i>`:''}
          <i class="fas fa-eye" title="سبورته" onclick="viewStudentBoard('${s.id}','${s.name}')"></i>
          ${hasImg?`<i class="fas fa-share-alt" style="color:#4CAF50" title="مشاركة للكل" onclick="shareBoard('${s.id}','${s.name}')"></i>`:''}
          <i class="fas fa-sign-out-alt" style="color:#b71c1c" title="طرد" onclick="kickS('${s.id}')"></i>
        </div></div>`;
    });
    document.getElementById('sList').innerHTML=h||'<div style="color:#aaa;text-align:center;padding:12px;font-size:11px">لا يوجد طلاب</div>';
    const n=Object.values(students).filter(s=>s.online).length;
    document.getElementById('cnt').textContent=n;
    document.getElementById('cntP').textContent=n;
  }

  db.ref('joinRequests').on('child_added', snap=>{const s=snap.val();if(s){waiting[s.id]=s;render();}});
  db.ref('joinRequests').on('child_removed',snap=>{const s=snap.val();if(s){delete waiting[s.id];render();}});
  db.ref('approvedStudents').on('value',snap=>{students=snap.val()||{};render();});
  db.ref('onlineStudents').on('value',snap=>{
    const o=snap.val()||{};
    Object.keys(students).forEach(id=>{if(students[id])students[id].online=!!o[id];});
    render();
  });
  db.ref('handRaised').on('value',snap=>{
    const h=snap.val()||{};
    Object.keys(students).forEach(id=>{if(students[id])students[id].handRaised=!!h[id];});
    render();
  });
  // micRequests: نخزّن الطلبات ونُظهرها في UI بدل confirm()
  db.ref('micRequests').on('child_added', snap=>{
    const req=snap.val(); if(!req) return;
    // نضيف علامة "يطلب المايك" للطالب في students
    if(students[req.studentId]) students[req.studentId].wantsMic=true;
    render();
  });
  db.ref('micRequests').on('child_removed', snap=>{
    const req=snap.val(); if(!req) return;
    if(students[req.studentId]) students[req.studentId].wantsMic=false;
    render();
  });

  // دالة الإذن بالمايك (تُستدعى من زر في قائمة الطلاب)
  window.allowMic = id => {
    if(currentSpeaker && currentSpeaker!==id) db.ref('micPermissions/'+currentSpeaker).remove();
    currentSpeaker=id;
    // نمسح الـ offer القديم لضمان إطلاق child_added من جديد
    db.ref('rtc/s2t_stu_offer/'+id).remove();
    db.ref('rtc/t2s_stu_answer/'+id).remove();
    db.ref('micPermissions/'+id).set({allowed:true, ts:Date.now()});
    db.ref('handRaised/'+id).remove();
    db.ref('micRequests/'+id).remove();
    if(students[id]) students[id].wantsMic=false;
    render();
  };
  db.ref('studentImages').on('child_changed',snap=>{
    const img=snap.val(); if(!img?.studentId)return;
    images[img.studentId]=[img]; render();
  });
  db.ref('studentImages').on('child_added',snap=>{
    const img=snap.val(); if(!img?.studentId)return;
    if(!images[img.studentId]) images[img.studentId]=[];
    images[img.studentId].push(img); render();
  });

  window.approveS=id=>{
    const s=waiting[id];if(!s)return;
    delete waiting[id];
    db.ref('approvedStudents/'+id).set({id,name:s.name});
    db.ref('joinRequests/'+id).remove();
    setTimeout(()=>setupDataChannelWithStudent(id), 1000);
    render();
  };
  window.rejectS=id=>{delete waiting[id];db.ref('joinRequests/'+id).remove();render();};
  window.kickS=id=>{if(currentSpeaker===id){currentSpeaker=null;db.ref('micPermissions/'+id).remove();}delete students[id];db.ref('approvedStudents/'+id).remove();db.ref('onlineStudents/'+id).remove();render();};
  window.revokeMic=id=>{currentSpeaker=null;db.ref('micPermissions/'+id).remove();render();};

  /* ===== نافذة معاينة الواجب ===== */
  let corrStuId=null;
  window.openCorr=(sid,name)=>{
    const imgs=images[sid]; if(!imgs?.length)return;
    corrStuId=sid;
    document.getElementById('corrTitle').textContent='واجب '+name;
    const wrap=document.getElementById('corrImgWrap');
    wrap.innerHTML='';
    const img=document.createElement('img');
    img.src=imgs[imgs.length-1].data;
    wrap.appendChild(img);
    document.getElementById('corrModal').classList.add('on');
  };
  window.closeCorr=()=>document.getElementById('corrModal').classList.remove('on');
  window.sendCorr=()=>{
    if(!corrStuId)return;
    const imgs=images[corrStuId]; if(!imgs?.length)return;
    db.ref('correctedImg/'+corrStuId).set({data:imgs[imgs.length-1].data,ts:Date.now()});
    alert('✅ تم إرسال الواجب لسبورة الطالب');
    closeCorr();
  };

  /* ===== WebRTC صوت ===== */
  let tStream=null,micOn=false;
  const peers={};
  let stuPc=null;

  async function callStu(sid){
    if(peers[sid])return;
    const pc=new RTCPeerConnection(RTCConfig); peers[sid]=pc;
    if(tStream) tStream.getTracks().forEach(t=>pc.addTrack(t,tStream));
    pc.onicecandidate=e=>{if(e.candidate)db.ref('rtc/t2s_ice/'+sid).push(e.candidate.toJSON());};
    pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){pc.close();delete peers[sid];}};
    const off=await pc.createOffer(); await pc.setLocalDescription(off);
    db.ref('rtc/t2s_offer/'+sid).set({sdp:off.sdp,type:off.type});
    db.ref('rtc/s2t_answer/'+sid).on('value',async snap=>{const a=snap.val();if(a&&pc.signalingState==='have-local-offer')await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(()=>{});});
    db.ref('rtc/s2t_ice/'+sid).on('child_added',async snap=>{const ice=snap.val();if(ice){try{await pc.addIceCandidate(new RTCIceCandidate(ice));}catch(e){}snap.ref.remove();}});
  }

  window.toggleMic=async()=>{
    const btn=document.getElementById('micBtn');
    if(!micOn){
      try{
        tStream=await navigator.mediaDevices.getUserMedia({
          audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1},
          video:false
        });
        micOn=true; btn.classList.add('mic-on'); btn.innerHTML='<i class="fas fa-microphone"></i>';
        Object.keys(students).forEach(sid=>{if(students[sid]?.online)callStu(sid);});
        db.ref('rtc/join_notify').on('child_added',snap=>{const sid=snap.val();if(sid&&micOn)callStu(sid);snap.ref.remove();});
      }catch(err){alert('تعذر المايك:\n'+err.message);}
    }else{
      micOn=false; btn.classList.remove('mic-on'); btn.innerHTML='<i class="fas fa-microphone-slash"></i>';
      if(tStream){tStream.getTracks().forEach(t=>t.stop());tStream=null;}
      Object.values(peers).forEach(pc=>pc.close()); Object.keys(peers).forEach(k=>delete peers[k]);
      db.ref('rtc/t2s_offer').remove(); db.ref('rtc/t2s_ice').remove();
    }
  };

  // ── استقبال صوت الطالب ──
  const stuPcMap = {}; // RTCPeerConnection لكل طالب

  async function answerStuOffer(sid, off){
    if(!off || !off.sdp) return;
    // أغلق اتصالاً قديماً
    if(stuPcMap[sid]){ try{ stuPcMap[sid].close(); }catch(e){} delete stuPcMap[sid]; }
    db.ref('rtc/s2t_stu_ice/'+sid).off(); // ألغِ listeners ICE القديمة

    const pc = new RTCPeerConnection(RTCConfig);
    stuPcMap[sid] = pc;
    stuPc = pc;

    pc.ontrack = e=>{
      const a = document.getElementById('audioEl');
      a.srcObject = e.streams[0];
      a.play().catch(()=>{});
      // تقليل التقطع
      try{
        pc.getReceivers().forEach(r=>{
          if(r.track?.kind==='audio' && r.jitterBufferTarget!==undefined)
            r.jitterBufferTarget=80;
        });
      }catch(_){}
    };

    pc.onicecandidate = e=>{
      if(e.candidate) db.ref('rtc/t2s_stu_ice/'+sid).push(e.candidate.toJSON());
    };

    // استقبال ICE من الطالب
    db.ref('rtc/s2t_stu_ice/'+sid).on('child_added', async s2=>{
      const ice = s2.val();
      if(ice && pc.remoteDescription){
        try{ await pc.addIceCandidate(new RTCIceCandidate(ice)); }catch(_){}
        s2.ref.remove();
      }
    });

    try{
      await pc.setRemoteDescription(new RTCSessionDescription(off));
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await db.ref('rtc/t2s_stu_answer/'+sid).set({sdp:ans.sdp, type:ans.type});
    } catch(err){ console.warn('answerStuOffer:', err); }
  }

  // استمع على child_added و child_changed معاً
  db.ref('rtc/s2t_stu_offer').on('child_added',   s=>{ if(s.val()?.sdp) answerStuOffer(s.key, s.val()); });
  db.ref('rtc/s2t_stu_offer').on('child_changed',  s=>{ if(s.val()?.sdp) answerStuOffer(s.key, s.val()); });

  db.ref('micPermissions').on('child_removed', snap=>{
    const sid = snap.key;
    if(stuPcMap[sid]){ try{ stuPcMap[sid].close(); }catch(_){} delete stuPcMap[sid]; }
    if(!Object.keys(stuPcMap).length){
      stuPc = null;
      const a = document.getElementById('audioEl');
      a.srcObject = null;
    }
  });

  window.endClass=()=>{if(confirm('إنهاء الحصة؟'))window.location.reload();};
  window.resetAll=()=>{
    if(!confirm('حذف جميع بيانات الجلسة الحالية؟'))return;
    if(tStream){tStream.getTracks().forEach(t=>t.stop());tStream=null;}
    Object.values(peers).forEach(pc=>pc.close());
    Object.values(peerConnections).forEach(pc=>pc.close());
    KEYS.forEach(k=>db.ref(k).remove());
    students={};waiting={};images={};currentSpeaker=null;currentBoard='main';
    mainBoard(); render();
  };

  setInterval(()=>{
    const t=Date.now(); db.ref('ping_t').set(t);
    setTimeout(()=>db.ref('ping_t').once('value',()=>{document.getElementById('lat').textContent=(Date.now()-t)+'ms';}),600);
  },6000);
})();