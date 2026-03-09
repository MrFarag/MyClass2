(function(){
  const SECRET = '135';

  firebase.initializeApp({
    apiKey:"AIzaSyB7E4NsGQbCehVSQ3Kj97yExRZwpHzTOl8",
    databaseURL:"https://myclaive-default-rtdb.firebaseio.com"
  });
  const db = firebase.database();

  // حالة الاتصال
  const fbStatus = document.getElementById('fbStatus');
  db.ref('.info/connected').on('value', snap => {
    if(fbStatus){
      fbStatus.textContent = snap.val() ? '🟢' : '🔴';
    }
  });

  // =============================================
  // أبعاد السبورة الثابتة
  // =============================================
  const CW = 1280, CH = 720;

  // سبورة المدرس (طبقة واحدة - قراءة فقط)
  const cT = document.getElementById('cT');
  const xT = cT.getContext('2d');
  cT.width = CW; cT.height = CH;
  xT.fillStyle = '#fff'; xT.fillRect(0,0,CW,CH);

  // سبورة الطالب: طبقتان
  // cSBG = طبقة الصورة (لا تُمسح بالاستيكة العادية)
  // cS   = طبقة الرسم فوق الصورة
  const cSBG = document.getElementById('cSBG');
  const cS   = document.getElementById('cS');
  const xSBG = cSBG.getContext('2d');
  const xS   = cS.getContext('2d');
  cSBG.width = CW; cSBG.height = CH;
  cS.width   = CW; cS.height   = CH;

  function ic(ctx){ ctx.lineCap='round'; ctx.lineJoin='round'; }
  ic(xT); ic(xS);

  // =============================================
  // التكبير / التصغير
  // =============================================
  const sc = {T:1, S:1};

  function applyScale(id, s){
    s = Math.min(5, Math.max(0.15, s));
    sc[id] = s;
    const cv  = id==='T' ? cT : cS;
    const wr  = document.getElementById('wrap'+id);
    const W   = CW*s, H = CH*s;
    cv.style.width  = W+'px';
    cv.style.height = H+'px';
    if(id==='S'){
      cSBG.style.width  = W+'px';
      cSBG.style.height = H+'px';
    }
    // تمركز أفقياً/رأسياً فقط إذا كانت السبورة أصغر من الحاوية
    wr.style.alignItems     = H < wr.clientHeight ? 'center' : 'flex-start';
    wr.style.justifyContent = W < wr.clientWidth  ? 'center' : 'flex-start';
    document.getElementById('zv'+id).textContent = Math.round(s*100)+'%';
  }

  function fitId(id){
    const wr = document.getElementById('wrap'+id);
    let W = wr.clientWidth, H = wr.clientHeight;
    if(!W||!H){ W=window.innerWidth; H=window.innerHeight-46-38-64; }
    // نملأ الحيز كاملاً (الجانب الفائض يُكشف بالـ scroll)
    applyScale(id, Math.max(W/CW, H/CH));
  }

  window.Z   = (id,d) => applyScale(id, sc[id]+d);
  window.fit = id => fitId(id);
  // تطبيق الحجم عند التحميل فقط — لا نعيد resize مع المتصفح
  setTimeout(()=>{ fitId('T'); fitId('S'); }, 200);

  // =============================================
  // التبويبات
  // =============================================
  let activeTab = 'T';
  window.goTab = function(t){
    if(activeTab===t) return;
    activeTab = t;
    ['T','S'].forEach(x=>{
      document.getElementById('pane'+x).classList.toggle('on', x===t);
      document.getElementById('sb'+x).classList.toggle('active', x===t);
    });
    document.getElementById('botS').style.display = t==='S' ? 'flex' : 'none';
    if(t==='S') document.getElementById('sbBadgeS').classList.remove('on');
    setTimeout(()=>fitId(t), 80);
  };

  function badge(){ document.getElementById('sbBadgeS').classList.add('on'); }

  // =============================================
  // متغيرات الحالة
  // =============================================
  const myId = 's'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  let myName='', myPhone='', approved=false, handRaised=false;
  let tool='pen', clr='#000', sz=4;
  let drawing=false, strokeId=0, pts=[], ptimer=null;
  let micOn=false, tPc=null, sPc=null, sStream=null;
  let tLP=null, tLS=null;
  let lastMyBoardImg=null;
  let teacherLP=null, teacherLS=null;
  const recentTeacherStrokes=new Set();
  let teacherPeerConnection=null;

  // =============================================
  // دالة دمج الطبقتين → snapshot
  // =============================================
  function mergedSnapshot(){
    const tmp=document.createElement('canvas'); tmp.width=CW; tmp.height=CH;
    const tx=tmp.getContext('2d');
    tx.drawImage(cSBG,0,0); // الصورة أولاً
    tx.drawImage(cS,0,0);   // ثم الرسم فوقها
    return tmp.toDataURL('image/jpeg',0.85);
  }

  // =============================================
  // شاشة الدخول
  // =============================================
  // دخول سريع: اسم مؤقت بدون رقم سري
  window.quickEntry = function(){
    const nameEl = document.getElementById('studentName');
    const name = nameEl.value.trim();
    if(!name){ nameEl.focus(); nameEl.style.borderColor='#e53935'; return; }
    nameEl.style.borderColor='';
    // استخدام اسم الطالب بدون تحقق من الرقم السري
    document.getElementById('studentSecret').value = SECRET;
    document.getElementById('studentPhone').value = document.getElementById('studentPhone').value||'0000000000';
    submitEntry();
  };

  window.submitEntry = function(){
    const name  = document.getElementById('studentName').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();
    const sec   = document.getElementById('studentSecret').value.trim();
    const errEl = document.getElementById('secretErr');
    if(!name){ alert('الرجاء إدخال الاسم'); return; }
    if(sec!==SECRET){
      errEl.style.display='block';
      document.getElementById('studentSecret').style.borderColor='#ff6b6b';
      return;
    }
    errEl.style.display='none';
    myName=name; myPhone=phone;

    document.getElementById('entryBtn').style.display='none';
    document.getElementById('studentName').style.display='none';
    document.getElementById('studentPhone').parentElement.style.display='none';
    document.getElementById('studentSecret').style.display='none';
    document.getElementById('waitMsg').style.display='block';

    db.ref('joinRequests/'+myId).set({id:myId,name:myName,phone:myPhone,ts:Date.now()})
      .then(()=>{
        setTimeout(()=>{ if(!approved) alert('⏳ المدرس لم يستجب بعد.'); },15000);
      })
      .catch(err=>{
        alert('خطأ في الاتصال: '+err.message);
        document.getElementById('entryBtn').style.display='block';
        document.getElementById('studentName').style.display='block';
        document.getElementById('studentPhone').parentElement.style.display='flex';
        document.getElementById('studentSecret').style.display='block';
        document.getElementById('waitMsg').style.display='none';
      });

    db.ref('approvedStudents/'+myId).on('value', snap=>{
      if(!snap.exists()||approved) return;
      approved=true;
      document.getElementById('entryScreen').classList.add('hidden');
      db.ref('onlineStudents/'+myId).set({name:myName,online:true});
      db.ref('joinRequests/'+myId).remove();
      db.ref('onlineStudents/'+myId).onDisconnect().remove();
      toast('✅ تمت الموافقة! مرحباً '+myName,'g');
      go();
    });
  };

  function go(){ listen(); connectAudio(); setupDataChannelReceiver(); watchMicPermission(); }

  // =============================================
  // Toast
  // =============================================
  function toast(msg,type){
    const el=document.createElement('div');
    el.className='toast '+type; el.textContent=msg;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .5s'; el.style.opacity='0'; setTimeout(()=>el.remove(),500); },4000);
  }

  // =============================================
  // الاستماع لبيانات المدرس
  // =============================================
  function listen(){
    // رسم المدرس على سبورته الرئيسية
    db.ref('draw_t').on('child_added', snap=>{
      const d=snap.val(); if(!d||!d.pts||!d.pts.length) return;
      const p=d.pts, c=d.c, sz2=d.s||4, id=d.sid;
      const isEra = d.era===true || c===null; // era flag أو c===null = استيكة
      ic(xT);
      if(isEra){
        xT.globalCompositeOperation='destination-out';
        xT.strokeStyle='rgba(0,0,0,1)';
        xT.lineWidth=sz2;
      } else {
        xT.globalCompositeOperation='source-over';
        xT.strokeStyle=c;
        xT.lineWidth=sz2;
      }
      xT.beginPath();
      if(tLP&&id&&id===tLS) xT.moveTo(tLP.x,tLP.y);
      else                  xT.moveTo(p[0].x*CW,p[0].y*CH);
      p.forEach(pt=>xT.lineTo(pt.x*CW,pt.y*CH));
      xT.stroke();
      xT.globalCompositeOperation='source-over';
      const last=p[p.length-1];
      tLP={x:last.x*CW,y:last.y*CH}; tLS=id;
    });

    // صورة سبورة المدرس (بعد رفع صورة)
    db.ref('boardImg').on('value', snap=>{
      const d=snap.val(); if(!d||!d.data) return;
      tLP=null; tLS=null;
      const img=new Image();
      img.onload=()=>{ xT.clearRect(0,0,CW,CH); xT.drawImage(img,0,0,CW,CH); };
      img.src=d.data;
    });

    // رسم المدرس على سبورة الطالب (Firebase fallback)
    db.ref('teacher_draw_on_student').child(myId).on('child_added', snap=>{
      const d=snap.val(); if(!d||!d.pts||!d.pts.length) return;
      applyTeacherStroke(d, teacherLastPoints);
    });

    // تصحيح المدرس (صورة كاملة)
    db.ref('correctedImg/'+myId).on('value', snap=>{
      const d=snap.val(); if(!d||!d.data) return;
      teacherLP=null; teacherLS=null;
      recentTeacherStrokes.clear();
      // الصورة المصححة تذهب لطبقة الخلفية
      const img=new Image();
      img.onload=()=>{ xSBG.clearRect(0,0,CW,CH); xSBG.drawImage(img,0,0,CW,CH); xS.clearRect(0,0,CW,CH); };
      img.src=d.data;
      lastMyBoardImg=d.data;
      toast('✅ وصل تصحيح المدرس!','g');
      badge(); goTab('S');
    });

    // أوامر السبورة
    db.ref('boardCmd').on('child_added', snap=>{
      const cmd=snap.val(); if(!cmd) return;
      if(cmd.type==='clear'){
        xT.fillStyle='#fff'; xT.fillRect(0,0,CW,CH); tLP=null; tLS=null;
      }
      if(cmd.type==='show_student_board'){
        if(cmd.studentId===myId) return;
        const img=new Image();
        img.onload=()=>{ xT.clearRect(0,0,CW,CH); xT.drawImage(img,0,0,CW,CH); };
        img.src=cmd.data;
        toast('📋 المدرس يعرض سبورة: '+cmd.studentName,'a');
        goTab('T');
      }
    });

    // عدد الطلاب
    db.ref('onlineStudents').on('value', snap=>{
      document.getElementById('cnt').textContent=Object.keys(snap.val()||{}).length;
    });
  }

  // =============================================
  // رسم المدرس على سبورة الطالب عبر DataChannel
  // =============================================
  // دالة موحدة لتطبيق ضربة المدرس على سبورة الطالب
  // تتعامل مع القلم والاستيكة (era = تمسح الرسم، eraBG = تمسح الصورة)
  const teacherLastPoints={};
  function applyTeacherStroke(d, lpMap){
    const pts=d.pts, c=d.c, s=d.s||4, sid=d.sid;
    const isEra   = d.era   === true;
    const isEraBG = d.eraBG === true;

    if(isEraBG){
      // المدرس يمسح من طبقة الصورة
      ic(xSBG);
      xSBG.globalCompositeOperation='destination-out';
      xSBG.strokeStyle='rgba(0,0,0,1)';
      xSBG.lineWidth=s;
      xSBG.beginPath();
      if(sid&&lpMap[sid+'_bg']) xSBG.moveTo(lpMap[sid+'_bg'].x,lpMap[sid+'_bg'].y);
      else xSBG.moveTo(pts[0].x*CW,pts[0].y*CH);
      pts.forEach(p=>xSBG.lineTo(p.x*CW,p.y*CH));
      xSBG.stroke();
      xSBG.globalCompositeOperation='source-over';
      const last=pts[pts.length-1];
      if(sid) lpMap[sid+'_bg']={x:last.x*CW,y:last.y*CH};
    } else {
      // قلم عادي أو استيكة الرسم
      ic(xS);
      if(isEra){
        xS.globalCompositeOperation='destination-out';
        xS.strokeStyle='rgba(0,0,0,1)';
      } else {
        xS.globalCompositeOperation='source-over';
        xS.strokeStyle=c===null?'rgba(0,0,0,0)':c;
      }
      xS.lineWidth=s;
      xS.beginPath();
      if(sid&&lpMap[sid]) xS.moveTo(lpMap[sid].x,lpMap[sid].y);
      else xS.moveTo(pts[0].x*CW,pts[0].y*CH);
      pts.forEach(p=>xS.lineTo(p.x*CW,p.y*CH));
      xS.stroke();
      xS.globalCompositeOperation='source-over';
      const last=pts[pts.length-1];
      if(sid) lpMap[sid]={x:last.x*CW,y:last.y*CH};
    }
    lastMyBoardImg=mergedSnapshot();
  }

  function drawTeacherStroke(d){
    applyTeacherStroke(d, teacherLastPoints);
  }

  // =============================================
  // WebRTC
  // =============================================
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

  function setupDataChannelReceiver(){
    db.ref('rtc/teacherDraw/'+myId+'/offer').on('value', async snap=>{
      const offer=snap.val();
      if(!offer||teacherPeerConnection) return;
      teacherPeerConnection=new RTCPeerConnection(RTCConfig);
      teacherPeerConnection.ondatachannel=event=>{
        const ch=event.channel;
        ch.onmessage=e=>{
          try{
            const data=JSON.parse(e.data);
            if(!data||!data.pts||!data.pts.length) return;
            if(data.sid&&recentTeacherStrokes.has(data.sid)) return;
            if(data.sid){ recentTeacherStrokes.add(data.sid); setTimeout(()=>recentTeacherStrokes.delete(data.sid),3000); }
            drawTeacherStroke(data);
          }catch(err){}
        };
      };
      teacherPeerConnection.onicecandidate=e=>{
        if(e.candidate) db.ref('rtc/teacherDraw/'+myId+'/candidate').push(e.candidate.toJSON());
      };
      await teacherPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer=await teacherPeerConnection.createAnswer();
      await teacherPeerConnection.setLocalDescription(answer);
      db.ref('rtc/teacherDraw/'+myId+'/answer').set({sdp:answer.sdp,type:answer.type});
    });
    db.ref('rtc/teacherDraw/'+myId+'/candidate').on('child_added', async snap=>{
      const cand=snap.val();
      if(cand&&teacherPeerConnection){
        try{ await teacherPeerConnection.addIceCandidate(new RTCIceCandidate(cand)); }catch(e){}
        snap.ref.remove();
      }
    });
  }

  // =============================================
  // إحداثيات الرسم على cS
  // =============================================
  function xy(e){
    const r=cS.getBoundingClientRect(), t=e.touches?e.touches[0]:e;
    return{x:(t.clientX-r.left)*(CW/r.width), y:(t.clientY-r.top)*(CH/r.height)};
  }

  cS.addEventListener('mousedown', e=>startD(e));
  cS.addEventListener('mousemove', e=>moveD(e));
  cS.addEventListener('mouseup',   ()=>stopD());
  cS.addEventListener('mouseleave',()=>stopD());
  cS.addEventListener('touchstart',e=>startD(e),{passive:false});
  cS.addEventListener('touchmove', e=>moveD(e), {passive:false});
  cS.addEventListener('touchend',  ()=>stopD());

  function startD(e){
    e.preventDefault(); if(!approved) return;
    drawing=true; strokeId=Date.now(); pts=[];
    const p=xy(e);
    ic(xS);
    // إعداد composite حسب الأداة
    if(tool==='eraser'){
      xS.globalCompositeOperation='destination-out';
      xS.strokeStyle='rgba(0,0,0,1)';
    } else if(tool==='eraserBG'){
      xSBG.globalCompositeOperation='destination-out';
    } else {
      xS.globalCompositeOperation='source-over';
      xS.strokeStyle=clr;
    }
    xS.beginPath(); xS.moveTo(p.x,p.y);
    pts.push({x:p.x/CW, y:p.y/CH});
  }

  function moveD(e){
    e.preventDefault(); if(!drawing||!approved) return;
    const p=xy(e);
    const lw=tool==='eraser'||tool==='eraserBG' ? sz*5 : sz;
    if(tool==='eraserBG'){
      // تمسح من طبقة الصورة مباشرة
      ic(xSBG);
      xSBG.globalCompositeOperation='destination-out';
      xSBG.strokeStyle='rgba(0,0,0,1)';
      xSBG.lineWidth=lw;
      xSBG.lineTo(p.x,p.y); xSBG.stroke(); xSBG.beginPath(); xSBG.moveTo(p.x,p.y);
    } else {
      xS.lineWidth=lw;
      xS.lineTo(p.x,p.y); xS.stroke(); xS.beginPath(); xS.moveTo(p.x,p.y);
    }
    pts.push({x:p.x/CW, y:p.y/CH});
    if(!ptimer) ptimer=setTimeout(flush,30);
  }

  function flush(){
    ptimer=null; if(!pts.length) return;
    const isEra   = tool==='eraser';
    const isEraBG = tool==='eraserBG';
    db.ref('draw_st').push({
      pts:  pts.slice(),
      c:    (isEra||isEraBG) ? null : clr,
      s:    (isEra||isEraBG) ? sz*5 : sz,
      era:  isEra,    // استيكة الرسم فقط
      eraBG:isEraBG,  // استيكة الصورة
      studentId: myId,
      sid:  strokeId,
      ts:   Date.now()
    });
    pts=[];
  }

  function stopD(){
    if(!drawing||!approved) return;
    drawing=false;
    if(ptimer){clearTimeout(ptimer);ptimer=null;} flush();
    xS.globalCompositeOperation='source-over';
    xSBG.globalCompositeOperation='source-over';
    // ✅ تحديث boardImg_stu بعد كل stroke
    // يضمن أن المدرس يرى الصورة + كل الرسم عند المعاينة
    lastMyBoardImg = mergedSnapshot();
    db.ref('boardImg_stu/'+myId).set({data:lastMyBoardImg, ts:Date.now()});
  }

  // =============================================
  // أدوات الرسم
  // =============================================
  // الأدوات: pen | eraser (تمسح الرسم) | eraserBG (تمسح الصورة)
  window.setTool = t => {
    tool=t;
    document.querySelectorAll('.ti').forEach(el=>el.classList.remove('on'));
    const map={pen:'tiPen',eraser:'tiEra',eraserBG:'tiEraBG',
               line:'tiLine',rect:'tiRect',circ:'tiCirc',arr:'tiArr',txt:'tiTxt'};
    if(map[t]){const el=document.getElementById(map[t]);if(el)el.classList.add('on');}
    if(t==='eraser')     cS.style.cursor='cell';
    else if(t==='eraserBG') cS.style.cursor='not-allowed';
    else                  cS.style.cursor='crosshair';
  };

  window.adjSz = d=>{
    sz=Math.max(1,Math.min(30,sz+d));
    const el=document.getElementById('szV'); if(el)el.textContent=sz;
  };

  window.setClr = (c,el)=>{
    clr=c;
    document.querySelectorAll('.dot').forEach(d=>d.classList.remove('on'));
    el.classList.add('on');
  };

  // مسح طبقة الرسم فقط (الصورة تبقى)
  window.clearS = ()=>{
    xS.globalCompositeOperation='source-over';
    xS.clearRect(0,0,CW,CH);
    teacherLP=null; teacherLS=null; recentTeacherStrokes.clear();
    lastMyBoardImg=mergedSnapshot();
    db.ref('boardImg_stu/'+myId).set({data:lastMyBoardImg,ts:Date.now()});
  };

  // مسح كل شيء (الرسم + الصورة)
  window.clearAll = ()=>{
    xS.globalCompositeOperation='source-over';
    xS.clearRect(0,0,CW,CH);
    xSBG.clearRect(0,0,CW,CH);
    teacherLP=null; teacherLS=null; recentTeacherStrokes.clear();
    lastMyBoardImg=mergedSnapshot();
    db.ref('boardImg_stu/'+myId).set({data:lastMyBoardImg,ts:Date.now()});
  };

  window.saveS = ()=>{ const a=document.createElement('a'); a.download='my-board.png'; a.href=mergedSnapshot(); a.click(); };
  window.goFS  = ()=>{ document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(); };

  // =============================================
  // رفع الواجب (صورة واحدة فقط)
  // =============================================
  window.uploadHW = function(input){
    if(!input.files[0]||!approved) return;
    const file=input.files[0];
    input.value=''; // إعادة تعيين الـ input فوراً لمنع أي إعادة إطلاق
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        // رسم الصورة بحجمها الطبيعي على طبقة الخلفية فقط
        xSBG.clearRect(0,0,CW,CH);
        // الصورة بحجمها الطبيعي (لا تمتد لملء السبورة)
        const drawW=Math.min(img.width,CW);
        const drawH=Math.min(img.height,CH);
        const ratio=Math.min(drawW/img.width, drawH/img.height);
        const fw=img.width*ratio, fh=img.height*ratio;
        xSBG.drawImage(img, (CW-fw)/2, (CH-fh)/2, fw, fh);
        // مسح طبقة الرسم
        xS.globalCompositeOperation='source-over';
        xS.clearRect(0,0,CW,CH);
        // snapshot ودفع مرة واحدة فقط
        const url=mergedSnapshot();
        lastMyBoardImg=url;
        db.ref('boardImg_stu/'+myId).set({data:url,ts:Date.now()});
        // رفع الواجب للمدرس (push واحدة)
        db.ref('studentImages/'+myId).set({studentId:myId,studentName:myName,data:url,ts:Date.now()});
        goTab('S');
      };
      img.src=e.target.result;
    };
    r.readAsDataURL(file);
  };

  // =============================================
  // رفع اليد
  // =============================================
  window.toggleHand = ()=>{
    if(!approved) return;
    handRaised=!handRaised;
    const hb=document.getElementById('handBtn');
    if(hb) hb.classList.toggle('hand-on',handRaised);
    handRaised ? db.ref('handRaised/'+myId).set(true) : db.ref('handRaised/'+myId).remove();
  };

  // =============================================
  // صوت المدرس ← الطالب
  // =============================================
  function connectAudio(){
    db.ref('rtc/join_notify').push(myId);
    db.ref('rtc/t2s_offer/'+myId).on('value', async snap=>{
      const off=snap.val(); if(!off||tPc) return;
      tPc=new RTCPeerConnection(RTCConfig);
      tPc.ontrack=e=>{
        const a=document.getElementById('audioEl');
        if(a.srcObject!==e.streams[0]){
          a.srcObject=e.streams[0];
          a.play().catch(()=>{});
        }
      };
      tPc.onicecandidate=e=>{ if(e.candidate) db.ref('rtc/s2t_ice/'+myId).push(e.candidate.toJSON()); };
      db.ref('rtc/t2s_ice/'+myId).on('child_added', async s2=>{
        const ice=s2.val(); if(ice){try{await tPc.addIceCandidate(new RTCIceCandidate(ice));}catch(e){} s2.ref.remove();}
      });
      await tPc.setRemoteDescription(new RTCSessionDescription(off));
      const ans=await tPc.createAnswer();
      await tPc.setLocalDescription(ans);
      db.ref('rtc/s2t_answer/'+myId).set({sdp:ans.sdp,type:ans.type});
    });
  }

  // =============================================
  // مايك الطالب
  // =============================================
  // ---- مساعد: إنشاء اتصال WebRTC لإرسال صوت الطالب ----
  async function startMicRTC(){
    if(!sStream) return;
    if(sPc){sPc.close();sPc=null;}

    // مسح كل بيانات جلسة سابقة أولاً
    await Promise.all([
      db.ref('rtc/s2t_stu_offer/'+myId).remove(),
      db.ref('rtc/s2t_stu_ice/'+myId).remove(),
      db.ref('rtc/t2s_stu_answer/'+myId).remove(),
      db.ref('rtc/t2s_stu_ice/'+myId).remove(),
    ]);

    // إلغاء listeners قديمة لتجنب التراكم
    db.ref('rtc/t2s_stu_ice/'+myId).off();
    db.ref('rtc/t2s_stu_answer/'+myId).off();

    sPc = new RTCPeerConnection(RTCConfig);
    sStream.getTracks().forEach(tr=>{
      const sender = sPc.addTrack(tr,sStream);
      // تحسين معدل البث وتقليل الكمون
      if(sender.setParameters){
        const params = sender.getParameters();
        if(!params.encodings) params.encodings=[{}];
        params.encodings[0].maxBitrate = 64000; // 64kbps كافي للصوت
        params.encodings[0].priority = 'high';
        sender.setParameters(params).catch(()=>{});
      }
    });

    sPc.onicecandidate = e=>{
      if(e.candidate) db.ref('rtc/s2t_stu_ice/'+myId).push(e.candidate.toJSON());
    };

    db.ref('rtc/t2s_stu_ice/'+myId).on('child_added', async snap2=>{
      const ice=snap2.val();
      if(ice && sPc){try{await sPc.addIceCandidate(new RTCIceCandidate(ice));}catch(e){} snap2.ref.remove();}
    });

    db.ref('rtc/t2s_stu_answer/'+myId).on('value', async snap2=>{
      const ans=snap2.val();
      if(ans && sPc && sPc.signalingState==='have-local-offer')
        await sPc.setRemoteDescription(new RTCSessionDescription(ans)).catch(()=>{});
    });

    const off = await sPc.createOffer({offerToReceiveAudio:false,offerToReceiveVideo:false});
    await sPc.setLocalDescription(off);
    await new Promise(r=>setTimeout(r,200));
    db.ref('rtc/s2t_stu_offer/'+myId).set({sdp:off.sdp, type:off.type, ts:Date.now()});
  }

  // ---- مراقبة الإذن بشكل دائم (تُسجَّل مرة عند go()) ----
  function watchMicPermission(){
    db.ref('micPermissions/'+myId).on('value', async snap=>{
      if(snap.val()?.allowed && micOn && sStream){
        await startMicRTC();
      } else if(!snap.val() && sPc){
        sPc.close(); sPc=null;
      }
    });
  }

  window.toggleMic = async ()=>{
    if(!approved) return;
    const btn  = document.getElementById('micBtn');
    const icon = document.getElementById('micIcon');
    const lbl  = document.getElementById('micLabel');
    if(!micOn){
      try{
        sStream = await navigator.mediaDevices.getUserMedia({
          audio:{
            echoCancellation:true,
            noiseSuppression:true,
            autoGainControl:true,
            sampleRate:48000,
            channelCount:1,
            latency:0,
            googHighpassFilter:true,
            googNoiseReduction:true
          },
          video:false
        });
        micOn=true;
        if(btn)  btn.classList.add('mic-on');
        if(icon) icon.className='fas fa-microphone';
        if(lbl)  lbl.textContent='مايك 🔴';
        // احذف القديم ثم أضف جديداً لضمان إطلاق child_added و child_changed
        db.ref('micRequests/'+myId).remove().then(()=>{
          db.ref('micRequests/'+myId).set({studentId:myId,studentName:myName,ts:Date.now()});
        });
      }catch(err){ alert('تعذر المايك:\n'+err.message); }
    } else {
      micOn=false;
      if(btn)  btn.classList.remove('mic-on');
      if(icon) icon.className='fas fa-microphone-slash';
      if(lbl)  lbl.textContent='مايك';
      if(sStream){sStream.getTracks().forEach(tr=>tr.stop());sStream=null;}
      if(sPc){sPc.close();sPc=null;}
      db.ref('micRequests/'+myId).remove();
      db.ref('micPermissions/'+myId).remove();
      db.ref('rtc/s2t_stu_offer/'+myId).remove();
      db.ref('rtc/s2t_stu_ice/'+myId).remove();
    }
  };

  // =============================================
  // قياس زمن الاستجابة
  // =============================================
  setInterval(()=>{
    const t=Date.now(); db.ref('ping_s').set(t);
    setTimeout(()=>db.ref('ping_s').once('value',()=>{
      document.getElementById('lat').textContent=(Date.now()-t)+'ms';
    }),600);
  },6000);

})();
