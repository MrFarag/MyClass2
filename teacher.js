/* ================================================ */
/* [001] بداية التنفيذ الذاتي وإعداد Firebase       */
/* ================================================ */
(function() {
  // تهيئة Firebase باستخدام بيانات المشروع
  firebase.initializeApp({
    apiKey: "AIzaSyB7E4NsGQbCehVSQ3Kj97yExRZwpHzTOl8",
    databaseURL: "https://myclaive-default-rtdb.firebaseio.com"
  });
  const db = firebase.database();

  // تنظيف جميع المسارات الرئيسية في كل جلسة جديدة (بداية جديدة)
  const KEYS = ['joinRequests', 'approvedStudents', 'onlineStudents', 'handRaised',
    'micRequests', 'micPermissions', 'studentImages', 'draw_t', 'draw_st',
    'boardCmd', 'boardImg', 'boardImg_stu', 'correctedImg', 'rtc',
    'teacher_draw_on_student', 'boardView', 'studentAnswers', 'studentExamSlides'];
  Promise.all(KEYS.map(k => db.ref(k).remove())).then(() => console.log('✅ جلسة نظيفة'));

  /* ================================================ */
  /* [002] إعداد Canvas السبورة (حجم متغير للشرائح)  */
  /* ================================================ */
  // CW, CH أصبحا متغيرين (let) لإمكانية تغييرهما حسب حجم الشريحة
  let CW = 1280, CH = 720;
  const mc = document.getElementById('mc');
  const mx = mc.getContext('2d');
  mc.width = CW; mc.height = CH;

  // Canvas خلفية ثابتة (صور وخلفيات) – سيتم إعادة إنشائها عند تغيير الحجم
  let mcBG = document.createElement('canvas');
  let mxBG = mcBG.getContext('2d');
  mcBG.width = CW; mcBG.height = CH;

  // Canvas طبقة الرسم الحي (القلم، الأشكال، الممحاة)
  let mcDraw = document.createElement('canvas');
  let mxD = mcDraw.getContext('2d');
  mcDraw.width = CW; mcDraw.height = CH;

  /* ================================================ */
  /* [002b] Canvas المعاينة — يُوضع فوق mc مباشرة    */
  /* الحجم يُضبط في applyScale مثل mc تماماً          */
  /* ================================================ */
  const spCv = document.createElement('canvas');
  spCv.width = CW; spCv.height = CH;
  // لا نضبط width/height بـ CSS هنا — applyScale تتولى ذلك
  // spCv offscreen فقط — لا يُضاف للـ DOM
  const spX = spCv.getContext('2d');

  /* ================================================ */
  /* [002c] نظام الأشكال القابلة للتحرير              */
  /* كل شكل = object { id,type,x1,y1,x2,y2,color,lw }*/
  /* يمكن تحديده ونقله وتغيير حجمه ولونه وحذفه       */
  /* ================================================ */
  let shapes = [];           // الأشكال غير المدمجة بعد
  let selectedShape = null;  // الشكل المحدد حالياً
  let shapeAction = null;    // 'move'|'resize-tl/tr/bl/br'|'delete'|'color'
  let shapeDragStart = null; // نقطة بداية السحب

  /* رسم جميع الأشكال على spX */
  function redrawShapes() {
    spX.clearRect(0, 0, CW, CH);
    shapes.forEach(sh => {
      drawShapeObj(spX, sh, sh.id === (selectedShape && selectedShape.id));
    });
  }

  /* رسم شكل واحد — highlighted=true يرسم مقابض التحكم */
  function drawShapeObj(ctx, sh, highlighted) {
    ctx.save();
    ctx.strokeStyle = sh.color;
    ctx.fillStyle = sh.color;
    ctx.lineWidth = sh.lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const { type: t, x1, y1, x2, y2 } = sh;
    if (t === 'line') {
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    } else if (t === 'arrow') {
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      const a = Math.atan2(y2-y1, x2-x1), h = 16 + sh.lw;
      ctx.beginPath();
      ctx.moveTo(x2,y2);
      ctx.lineTo(x2 - h*Math.cos(a-0.4), y2 - h*Math.sin(a-0.4));
      ctx.lineTo(x2 - h*Math.cos(a+0.4), y2 - h*Math.sin(a+0.4));
      ctx.closePath(); ctx.fill();
    } else if (t === 'rect') {
      ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    } else if (t === 'circle') {
      ctx.ellipse((x1+x2)/2,(y1+y2)/2, Math.abs(x2-x1)/2, Math.abs(y2-y1)/2, 0, 0, Math.PI*2);
      ctx.stroke();
    } else if (t === 'tri') {
      ctx.moveTo((x1+x2)/2,y1); ctx.lineTo(x2,y2); ctx.lineTo(x1,y2);
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
    if (highlighted) drawShapeHandles(ctx, sh);
  }

  /* مقابض التحكم حول الشكل المحدد */
  function drawShapeHandles(ctx, sh) {
    const minX=Math.min(sh.x1,sh.x2), minY=Math.min(sh.y1,sh.y2);
    const maxX=Math.max(sh.x1,sh.x2), maxY=Math.max(sh.y1,sh.y2);
    ctx.save();
    // إطار التحديد
    ctx.strokeStyle='#00aaff'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.strokeRect(minX-6, minY-6, maxX-minX+12, maxY-minY+12);
    ctx.setLineDash([]);
    // مقابض زوايا التحجيم
    [[minX,minY,'tl'],[maxX,minY,'tr'],[minX,maxY,'bl'],[maxX,maxY,'br']].forEach(([hx,hy]) => {
      ctx.fillStyle='#fff'; ctx.strokeStyle='#00aaff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(hx,hy,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
    });
    // زر الحذف (أحمر)
    ctx.fillStyle='#e53935';
    ctx.beginPath(); ctx.arc(maxX+14, minY-14, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 11px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✕', maxX+14, minY-14);
    // زر تغيير اللون
    ctx.fillStyle=sh.color; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(maxX+14, minY+10, 9, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 9px Arial';
    ctx.fillText('🎨', maxX+14, minY+10);
    ctx.restore();
  }

  /* هل النقطة تقع على الشكل؟ */
  function hitShape(sh, px, py) {
    const pad = Math.max(10, sh.lw);
    return px >= Math.min(sh.x1,sh.x2)-pad && px <= Math.max(sh.x1,sh.x2)+pad &&
           py >= Math.min(sh.y1,sh.y2)-pad && py <= Math.max(sh.y1,sh.y2)+pad;
  }

  /* تحديد نوع الإجراء بناءً على موضع الكليك */
  function getShapeAction(sh, px, py) {
    const minX=Math.min(sh.x1,sh.x2), minY=Math.min(sh.y1,sh.y2);
    const maxX=Math.max(sh.x1,sh.x2), maxY=Math.max(sh.y1,sh.y2);
    const R=12;
    if (Math.hypot(px-(maxX+14), py-(minY-14)) < R) return 'delete';
    if (Math.hypot(px-(maxX+14), py-(minY+10)) < R) return 'color';
    if (Math.hypot(px-minX, py-minY) < R) return 'resize-tl';
    if (Math.hypot(px-maxX, py-minY) < R) return 'resize-tr';
    if (Math.hypot(px-minX, py-maxY) < R) return 'resize-bl';
    if (Math.hypot(px-maxX, py-maxY) < R) return 'resize-br';
    return 'move';
  }

  /* دمج الأشكال على mcDraw (يُستدعى عند التبديل لأداة أخرى) */
  function commitShapes() {
    if (!shapes.length) return;
    shapes.forEach(sh => drawShapeObj(mxD, sh, false));
    shapes = []; selectedShape = null;
    spX.clearRect(0, 0, CW, CH);
    composite();
    if (currentBoard === 'main') {
      lastMainImg = mc.toDataURL('image/jpeg', 0.85);
      snapshots[activeSlide || 'main'] = lastMainImg;
      updateThumb();
      // إرسال صورة السبورة المحدثة للطلاب
      db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
    } else {
      // رسم على سبورة طالب
      db.ref('boardImg').set({ data: mc.toDataURL('image/jpeg', 0.85), ts: Date.now() });
    }
  }

  /* color picker مخفي لتغيير لون الشكل */
  const shapeColorPicker = document.createElement('input');
  shapeColorPicker.type = 'color';
  shapeColorPicker.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0;top:0;left:0;';
  document.body.appendChild(shapeColorPicker);
  shapeColorPicker.addEventListener('input', e => {
    if (!selectedShape) return;
    const sh = shapes.find(s => s.id === selectedShape.id);
    if (sh) { sh.color = e.target.value; selectedShape.color = e.target.value; redrawShapes(); }
  });

  let boardBg = '#ffffff'; // لون الخلفية الحالي

  /* ================================================ */
  /* [003] دالة إعادة ضبط حجم جميع الـ Canvases       */
  /* ================================================ */
  function resizeCanvases(newW, newH) {
    CW = newW;
    CH = newH;

    // تغيير حجم canvas الرئيسي
    mc.width = CW;
    mc.height = CH;

    // إعادة إنشاء canvas الخلفية مع الحفاظ على لون الخلفية
    const newMCBG = document.createElement('canvas');
    newMCBG.width = CW;
    newMCBG.height = CH;
    const newMxBG = newMCBG.getContext('2d');
    newMxBG.fillStyle = boardBg;
    newMxBG.fillRect(0, 0, CW, CH);
    mcBG = newMCBG;
    mxBG = newMxBG;

    // إعادة إنشاء canvas الرسم (فارغ)
    const newMCDraw = document.createElement('canvas');
    newMCDraw.width = CW;
    newMCDraw.height = CH;
    mcDraw = newMCDraw;
    mxD = mcDraw.getContext('2d');

    // إعادة ضبط حجم canvas المعاينة (يجب أن يتطابق مع mc)
    spCv.width = CW;
    spCv.height = CH;
    // إعادة رسم الأشكال بعد resize
    redrawShapes();

    // إعادة تطبيق مقياس الرؤية الحالي
    applyScale(scale);

    composite();
  }

  // دالة لدمج الطبقتين مع الخلفية
  function composite() {
    mx.globalCompositeOperation = 'source-over';
    mx.fillStyle = boardBg;
    mx.fillRect(0, 0, CW, CH);
    mx.drawImage(mcBG, 0, 0);
    mx.drawImage(mcDraw, 0, 0);
  }

  // تعبئة الخلفية الابتدائية
  mxBG.fillStyle = '#fff';
  mxBG.fillRect(0, 0, CW, CH);
  composite();

  /* ================================================ */
  /* [004] التحكم بالتكبير والملاءمة (Zoom & Fit)     */
  /* ================================================ */
  let scale = 1;
  const bWrap = document.getElementById('bWrap');

  function applyScale(s) {
    s = Math.max(0.15, Math.min(5, s));
    scale = s;
    mc.style.width  = (CW * s) + 'px';
    mc.style.height = (CH * s) + 'px';
    bWrap.style.alignItems    = (CH * s < bWrap.clientHeight) ? 'center' : 'flex-start';
    bWrap.style.justifyContent= (CW * s < bWrap.clientWidth)  ? 'center' : 'flex-start';
    document.getElementById('zv').textContent = Math.round(s * 100) + '%';
  }

  function fit() {
    let W = bWrap.clientWidth, H = bWrap.clientHeight;
    if (!W || !H) {
      W = window.innerWidth - 240;
      H = window.innerHeight - 56 - 68;
    }
    applyScale(Math.min(W / CW, H / CH));
  }

  // دوال عامة للاستخدام من HTML
  window.Z = (d) => applyScale(scale + d);
  window.fit = fit;

  let initialFitDone = false;
  setTimeout(() => { fit(); initialFitDone = true; }, 200);
  window.addEventListener('resize', () => {
    // عند تغيير حجم النافذة: نحافظ على نفس الـ scale ونُعيد ضبط المحاذاة فقط
    if (!initialFitDone) return;
    applyScale(scale);
  });

  /* ================================================ */
  /* [005] تحويل إحداثيات المؤشر إلى إحداثيات Canvas */
  /* ================================================ */
  function xyOf(e) {
    const r = mc.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (CW / r.width),
      y: (t.clientY - r.top) * (CH / r.height)
    };
  }

  /* ================================================ */
  /* [006] المتغيرات العامة للحالة                     */
  /* ================================================ */
  let tool = 'pen';               // الأداة الحالية
  let clr = '#000';               // اللون الحالي
  let sz = 4;                     // حجم الأداة
  let drawing = false;            // هل يرسم حالياً؟
  let strokeId = 0;               // معرف السكتة الحالية للتتبع
  let pts = [];                   // نقاط المسار الحالي
  let ptimer = null;              // مؤقت لتفريغ النقاط
  let students = {};              // الطلاب المقبولين { id: { name, online, ... } }
  let waiting = {};               // طلبات الانضمام المعلقة
  let images = {};                // صور الطلاب المرسلة { studentId: [img1, img2] }
  let currentSpeaker = null;      // معرف الطالب المتحدث حالياً
  let currentBoard = 'main';       // السبورة المعروضة حالياً (main أو studentId)
  let lastMainImg = null;         // آخر صورة للسبورة الرئيسية (Base64)
  let lastStuImg = {};            // آخر صور لسبورات الطلاب { studentId: base64 }
  let classMode = 'explain';      // 'explain' أو 'exam'
  let hlSnap = null;              // لقطة قبل الرسم بالهايلايتر
  const SHAPES = ['line', 'arrow', 'rect', 'circle', 'tri'];
  let shapeStart = null;          // نقطة بداية الشكل
  let _snap = null;               // لقطة السبورة لحظة بدء رسم الشكل
  let _cur  = null;               // آخر موضع ماوس أثناء رسم الشكل

  /* ================================================ */
  /* [007] الشرائح (Slides)                           */
  /* ================================================ */
  let slides = [];                // مصفوفة الشرائح { id, dataUrl, label }
  let nextSlId = 1;               // العدد التالي لمعرف الشريحة
  let activeSlide = 'main';        // الشريحة النشطة (main أو id)
  const snapshots = {};            // لقطات الشرائح (key: id, value: base64)

  /* ================================================ */
  /* [008] WebRTC لقنوات البيانات (DataChannels)     */
  /* ================================================ */
  const dcPeers = {};   // PeerConnections لكل طالب (للرسم)
  const dcChans = {};   // DataChannels لكل طالب

  /* ================================================ */
  /* [009] WebRTC للصوت (Audio)                       */
  /* ================================================ */
  const audioPeers = {};          // PeerConnections الصوت (مدرس ← طالب)
  let tStream = null;             // تيار الميكروفون المحلي
  let micOn = false;              // حالة الميكروفون
  const stuPcMap = {};            // PeerConnections القادمة من الطالب (student → teacher)

  <!-- ================================================ -->
<!-- [009] إعدادات WebRTC للصوت (تحسين الجودة)       -->
<!-- ================================================ -->

// إعدادات ICE العامة للصوت - تمت إضافة sdpSemantics
const TURN_USER = 'openrelayproject';
const TURN_PASS = 'openrelayproject';
const AUD_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: TURN_USER, credential: TURN_PASS },
    { urls: 'turn:openrelay.metered.ca:443', username: TURN_USER, credential: TURN_PASS },
    { urls: 'turns:openrelay.metered.ca:443', username: TURN_USER, credential: TURN_PASS },
  ],
  bundlePolicy: 'max-bundle',
  sdpSemantics: 'unified-plan' // تحسين التوافق مع الإعدادات الحديثة
};

  /* ================================================ */
  /* [010] إعداد DataChannel لكل طالب (للبث المباشر)  */
  /* ================================================ */
  const DC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  async function setupDC(sid) {
    if (dcPeers[sid]) return;
    const pc = new RTCPeerConnection(DC_CFG);
    dcPeers[sid] = pc;
    const dc = pc.createDataChannel('td', { ordered: false, maxRetransmits: 0 });
    dcChans[sid] = dc;
    pc.onicecandidate = e => {
      if (e.candidate) db.ref('rtc/teacherDraw/' + sid + '/candidate').push(e.candidate.toJSON());
    };
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    db.ref('rtc/teacherDraw/' + sid + '/offer').set({ sdp: o.sdp, type: o.type });
    db.ref('rtc/teacherDraw/' + sid + '/answer').on('value', async s => {
      const a = s.val();
      if (a && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(() => { });
    });
    db.ref('rtc/teacherDraw/' + sid + '/candidate').on('child_added', async s => {
      const c = s.val();
      if (c) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { } s.ref.remove(); }
    });
  }

  /* ================================================ */
  /* [011] دوال الرسم (بدء، تحريك، إنهاء)            */
  /* ================================================ */
  mc.addEventListener('mousedown', e => startD(e));
  mc.addEventListener('mousemove', e => moveD(e));
  mc.addEventListener('mouseup', () => stopD());
  mc.addEventListener('mouseleave', () => stopD());
  mc.addEventListener('touchstart', e => startD(e), { passive: false });
  mc.addEventListener('touchmove', e => moveD(e), { passive: false });
  mc.addEventListener('touchend', () => stopD());

  function startD(e) {
    e.preventDefault();

    /* ── أداة التحديد (select): تحديد الأشكال ونقلها ── */
    if (tool === 'select') {
      const p = xyOf(e);
      // هل كليك على شكل محدد بالفعل (للتحكم فيه)؟
      if (selectedShape) {
        const act = getShapeAction(selectedShape, p.x, p.y);
        if (act === 'delete') {
          shapes = shapes.filter(s => s.id !== selectedShape.id);
          selectedShape = null; shapeAction = null;
          redrawShapes(); composite(); return;
        }
        if (act === 'color') {
          shapeColorPicker.value = selectedShape.color;
          shapeColorPicker.click(); return;
        }
        shapeAction = act;
        shapeDragStart = { ...p, ox1: selectedShape.x1, oy1: selectedShape.y1,
                                  ox2: selectedShape.x2, oy2: selectedShape.y2 };
        return;
      }
      // هل كليك على أي شكل؟
      const hit = [...shapes].reverse().find(sh => hitShape(sh, p.x, p.y));
      if (hit) {
        selectedShape = hit;
        shapeAction = getShapeAction(hit, p.x, p.y);
        shapeDragStart = { ...p, ox1: hit.x1, oy1: hit.y1, ox2: hit.x2, oy2: hit.y2 };
        redrawShapes(); return;
      }
      // كليك على فراغ = إلغاء التحديد
      selectedShape = null; shapeAction = null; redrawShapes();
      return;
    }

    /* ── أدوات الأشكال: بدء رسم شكل جديد ── */
    if (SHAPES.includes(tool)) {
      commitShapes();
      drawing = true; strokeId = Date.now();
      shapeStart = xyOf(e); _cur = null;
      // حفظ sync فوري بـ getImageData (لا async)
      _snap = mx.getImageData(0, 0, CW, CH);
      return;
    }

    /* ── أدوات الرسم الحر ── */
    // دمج أي أشكال معلقة
    commitShapes();
    drawing = true;
    strokeId = Date.now();
    pts = [];
    const p = xyOf(e);
    if (tool === 'highlight') hlSnap = mcDraw.toDataURL();
    mxD.globalCompositeOperation = (tool === 'eraser') ? 'destination-out' : 'source-over';
    mxD.beginPath();
    mxD.moveTo(p.x, p.y);
    pts.push({ x: p.x / CW, y: p.y / CH });
  }

  function moveD(e) {
    e.preventDefault();

    /* ── أداة التحديد: تحريك أو تحجيم ── */
    if (tool === 'select') {
      if (!selectedShape || !shapeAction || !shapeDragStart) return;
      const p = xyOf(e);
      const dx = p.x - shapeDragStart.x, dy = p.y - shapeDragStart.y;
      const sh = shapes.find(s => s.id === selectedShape.id);
      if (!sh) return;
      const { ox1, oy1, ox2, oy2 } = shapeDragStart;
      if (shapeAction === 'move') {
        sh.x1 = ox1 + dx; sh.y1 = oy1 + dy;
        sh.x2 = ox2 + dx; sh.y2 = oy2 + dy;
      } else if (shapeAction === 'resize-tl') { sh.x1 = ox1+dx; sh.y1 = oy1+dy; }
        else if (shapeAction === 'resize-tr') { sh.x2 = ox2+dx; sh.y1 = oy1+dy; }
        else if (shapeAction === 'resize-bl') { sh.x1 = ox1+dx; sh.y2 = oy2+dy; }
        else if (shapeAction === 'resize-br') { sh.x2 = ox2+dx; sh.y2 = oy2+dy; }
      selectedShape = { ...sh };
      redrawShapes();
      return;
    }

    /* ── معاينة الأشكال مباشرة على mc ── */
    if (SHAPES.includes(tool) && shapeStart && drawing) {
      const p = xyOf(e); _cur = p;
      if (!_snap) return;
      mx.putImageData(_snap, 0, 0);
      drawShapeObj(mx, {type:tool,x1:shapeStart.x,y1:shapeStart.y,x2:p.x,y2:p.y,color:clr,lw:sz}, false);
      return;
    }

    if (!drawing) return;
    const p = xyOf(e);

    if (tool === 'highlight' && hlSnap) {
      const img = new Image();
      img.onload = () => {
        mxD.globalCompositeOperation = 'source-over';
        mxD.clearRect(0, 0, CW, CH);
        mxD.drawImage(img, 0, 0);
        mxD.globalAlpha = 0.38;
        mxD.strokeStyle = clr; mxD.lineWidth = sz * 5;
        mxD.lineCap = 'round'; mxD.lineJoin = 'round';
        mxD.beginPath();
        pts.forEach((pt, i) => i ? mxD.lineTo(pt.x*CW, pt.y*CH) : mxD.moveTo(pt.x*CW, pt.y*CH));
        mxD.lineTo(p.x, p.y); mxD.stroke(); mxD.globalAlpha = 1;
        composite();
      };
      img.src = hlSnap;
      pts.push({ x: p.x / CW, y: p.y / CH });
      if (!ptimer) ptimer = setTimeout(flush, 30);
      return;
    }
    mxD.lineWidth = (tool === 'eraser') ? sz * 5 : sz;
    if (tool !== 'eraser') mxD.strokeStyle = clr;
    mxD.lineTo(p.x, p.y); mxD.stroke();
    mxD.beginPath(); mxD.moveTo(p.x, p.y);
    composite();
    pts.push({ x: p.x / CW, y: p.y / CH });
    if (!ptimer) ptimer = setTimeout(flush, 10);
  }

  function stopD() {
    /* ── أداة التحديد: انتهاء السحب ── */
    if (tool === 'select') {
      shapeAction = null; shapeDragStart = null;
      return;
    }

    /* ── انتهاء رسم شكل — ارسم نهائياً وأرسل للطلاب ── */
    if (SHAPES.includes(tool) && shapeStart && drawing) {
      drawing = false;
      const ep = _cur || {x:lastMouse.cx, y:lastMouse.cy};
      const sh = {type:tool, x1:shapeStart.x, y1:shapeStart.y, x2:ep.x, y2:ep.y, color:clr, lw:sz};
      shapeStart = null; _cur = null;
      if (_snap) { mx.putImageData(_snap, 0, 0); } _snap = null;
      drawShapeObj(mxD, sh, false); composite();
      const _d = mc.toDataURL('image/jpeg',0.85);
      lastMainImg = _d; snapshots[activeSlide||'main'] = _d;
      updateThumb();
      db.ref('boardImg').set({data:_d, ts:Date.now()});
      return;
    }

    if (!drawing) return;
    drawing = false;
    if (ptimer) { clearTimeout(ptimer); ptimer = null; }
    flush();
    mxD.globalCompositeOperation = 'source-over';
    composite();
    hlSnap = null;
    if (currentBoard === 'main') {
      lastMainImg = mc.toDataURL('image/jpeg', 0.85);
      snapshots[activeSlide || 'main'] = lastMainImg;
      updateThumb();
    }
  }

  // تتبع آخر موضع للماوس/اللمس (لـ stopD)
  const lastMouse = { cx: 0, cy: 0, x: 0, y: 0 };
  mc.addEventListener('mousemove', e => {
    const r = mc.getBoundingClientRect();
    lastMouse.cx = (e.clientX - r.left) * (CW / r.width);
    lastMouse.cy = (e.clientY - r.top)  * (CH / r.height);
    lastMouse.x = e.clientX; lastMouse.y = e.clientY;
  });
  mc.addEventListener('touchmove', e => {
    if (!e.touches[0]) return;
    const r = mc.getBoundingClientRect();
    lastMouse.cx = (e.touches[0].clientX - r.left) * (CW / r.width);
    lastMouse.cy = (e.touches[0].clientY - r.top)  * (CH / r.height);
    lastMouse.x = e.touches[0].clientX; lastMouse.y = e.touches[0].clientY;
  });

  function flush() {
    ptimer = null;
    // الأشكال الهندسية لا تُرسل عبر flush — تُعالج في stopD
    if (SHAPES.includes(tool)) return;
    if (!pts.length) return;
    const isEra = (tool === 'eraser');
    const isHL = (tool === 'highlight');
    const d = {
      pts: pts.slice(),
      c: isEra ? null : clr,
      s: isEra ? sz * 5 : (isHL ? sz * 5 : sz),
      era: isEra,
      hl: isHL,
      sid: strokeId,
      ts: Date.now()
    };
    if (currentBoard !== 'main') {
      db.ref('teacher_draw_on_student/' + currentBoard).push(d);
    } else {
      db.ref('draw_t').push(d);
      Object.entries(dcChans).forEach(([, dc]) => {
        if (dc.readyState === 'open') try { dc.send(JSON.stringify(d)); } catch (_) { }
      });
    }
    if (!isHL) pts = [];
  }

 <!-- ================================================ -->
<!-- [012] استقبال رسم الطالب - يظهر فقط عند معاينة سبورته -->
<!-- ================================================ -->

const sLP = {}; // آخر نقطة للطالب
const sLS = {}; // آخر strokeId للطالب
db.ref('draw_st').on('child_added', snap => {
  const d = snap.val();
  if (!d || !d.pts) return;
  // لا نعرض رسم الطالب أبداً على السبورة الرئيسية
  if (currentBoard === 'main') return;
  // إذا كان المدرس يشاهد سبورة طالب معين، اعرض رسوم ذلك الطالب فقط
  if (currentBoard !== d.studentId) return;

  const p = d.pts;
  const c = d.c;
  const s = d.s || 4;
  const key = d.studentId;
  const id = d.sid;

  mxD.globalCompositeOperation = 'source-over';
  mxD.strokeStyle = (c === null) ? 'rgba(0,0,0,1)' : c;
  mxD.lineWidth = s;
  mxD.beginPath();
  if (sLP[key] && id && id === sLS[key]) {
    mxD.moveTo(sLP[key].x, sLP[key].y);
  } else {
    mxD.moveTo(p[0].x * CW, p[0].y * CH);
  }
  p.forEach(pt => mxD.lineTo(pt.x * CW, pt.y * CH));
  mxD.stroke();
  const last = p[p.length - 1];
  sLP[key] = { x: last.x * CW, y: last.y * CH };
  sLS[key] = id;
  composite();
});

  /* ================================================ */
  /* [013] تحميل صورة على Canvas مع تغيير الحجم       */
  /* ================================================ */
  function loadCanvas(url, clearDraw, cb, resizeToImage = false) {
    if (clearDraw) mxD.clearRect(0, 0, CW, CH);
    if (!url) {
      composite();
      if (cb) cb();
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (resizeToImage) {
        // تغيير حجم canvas ليطابق أبعاد الصورة مع حد أقصى 2000
        let newW = img.width;
        let newH = img.height;
        const MAX = 2000;
        if (newW > MAX || newH > MAX) {
          const ratio = Math.min(MAX / newW, MAX / newH);
          newW = Math.floor(newW * ratio);
          newH = Math.floor(newH * ratio);
        }
        resizeCanvases(newW, newH);
      }
      mxBG.fillStyle = boardBg;
      mxBG.fillRect(0, 0, CW, CH);
      mxBG.drawImage(img, 0, 0, CW, CH); // الصورة تغطي كامل canvas بعد تغيير الحجم
      composite();
      if (cb) cb();
    };
    img.onerror = () => {
      console.error('فشل تحميل الصورة:', url);
      composite();
      if (cb) cb();
    };
    img.src = url;
  }

  /* ================================================ */
  /* [014] دوال الأدوات (قلم، ممحاة، أشكال، ألوان...) */
  /* ================================================ */
  window.setTool = (t) => {
    // عند التبديل من أدوات الأشكال إلى أي أداة أخرى غير select: ادمج الأشكال
    if (tool !== 'select' && t !== 'select' && SHAPES.includes(tool)) commitShapes();
    // عند التبديل من select إلى أداة رسم: ادمج وأخفِ spCv
    if (tool === 'select' && t !== 'select') commitShapes();
    tool = t;
    // cursor
    mc.style.cursor = (t === 'select') ? 'default' : 'crosshair';
    const map = {
      pen: 'tiPen', eraser: 'tiEra', highlight: 'tiHL', select: 'tiSel',
      line: 'tiLine', arrow: 'tiArrow', rect: 'tiRect', circle: 'tiCircle', tri: 'tiTri'
    };
    Object.entries(map).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('on', t === k);
    });
    const hlEl = document.getElementById('tiHL');
    if (hlEl) {
      const i = hlEl.querySelector('i');
      if (i) i.style.color = (t === 'highlight') ? '#ffff00' : '';
    }
  };

  window.setClr = (c, el) => {
    clr = c;
    document.querySelectorAll('.dot').forEach(d => d.classList.remove('on'));
    el.classList.add('on');
  };

  window.adjSz = (d) => {
    sz = Math.max(1, Math.min(40, sz + d));
    document.getElementById('szV').textContent = sz;
  };

  window.clearB = () => {
    mxBG.fillStyle = boardBg;
    mxBG.fillRect(0, 0, CW, CH);
    mxD.clearRect(0, 0, CW, CH);
    composite();
    db.ref('boardCmd').push({ type: 'clear', ts: Date.now() });
    lastMainImg = null;
    setTimeout(updateThumb, 50);
  };

  window.saveB = () => {
    const a = document.createElement('a');
    a.download = 'board.png';
    a.href = mc.toDataURL();
    a.click();
  };

  window.goFS = () => {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  };

  window.setBoardBg = (color, el) => {
    boardBg = color;
    mxBG.fillStyle = color;
    mxBG.fillRect(0, 0, CW, CH);
    composite();
    document.querySelectorAll('.bg-dot').forEach(d => d.classList.remove('on'));
    el.classList.add('on');
    setTimeout(() => {
      lastMainImg = mc.toDataURL('image/jpeg', 0.85);
      db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
    }, 50);
  };

  // تعديل رفع الصورة لتغيير حجم canvas حسب الصورة
  window.uploadImg = (input) => {
    if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        // تغيير حجم canvas ليطابق الصورة مع حد أقصى
        let newW = img.width;
        let newH = img.height;
        const MAX = 2000;
        if (newW > MAX || newH > MAX) {
          const ratio = Math.min(MAX / newW, MAX / newH);
          newW = Math.floor(newW * ratio);
          newH = Math.floor(newH * ratio);
        }
        resizeCanvases(newW, newH);

        mxBG.fillStyle = boardBg;
        mxBG.fillRect(0, 0, CW, CH);
        mxBG.drawImage(img, 0, 0, CW, CH);
        mxD.clearRect(0, 0, CW, CH);
        composite();
        const url = mc.toDataURL('image/jpeg', 0.92);
        lastMainImg = url;
        snapshots[activeSlide || 'main'] = url;
        db.ref('boardImg').set({ data: url, ts: Date.now() });
        updateThumb();
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(input.files[0]);
    input.value = '';
  };

  <!-- ================================================ -->
<!-- [015] وضع الشرح/الاختبار - مع حفظ السبورة       -->
<!-- ================================================ -->

// متغير لحفظ صورة السبورة قبل الدخول في الاختبار
let preExamBoardImg = null;

window.setClassMode = (mode) => {
  classMode = mode;
  document.getElementById('modeExplain').classList.toggle('on', mode === 'explain');
  document.getElementById('modeExam').classList.toggle('on', mode === 'exam');
  
  if (mode === 'exam') {
    // حفظ السبورة الحالية قبل الانتقال إلى الاختبار
    preExamBoardImg = mc.toDataURL('image/jpeg', 0.85);
    
    const url = mc.toDataURL('image/jpeg', 0.92);
    db.ref('boardCmd').push({ type: 'class_mode', mode: 'exam', ts: Date.now() });
    setTimeout(() => db.ref('boardCmd').push({ type: 'exam_question', data: url, ts: Date.now() }), 150);
    setTimeout(() => db.ref('boardCmd').push({ type: 'goto_tab', tab: 'S', ts: Date.now() }), 400);
  } else { // mode === 'explain'
    db.ref('boardCmd').push({ type: 'class_mode', mode: 'explain', ts: Date.now() });
    // العودة إلى السبورة المحفوظة قبل الاختبار إن وجدت
    if (preExamBoardImg) {
      loadCanvas(preExamBoardImg, true, () => {
        lastMainImg = preExamBoardImg;
        snapshots[activeSlide || 'main'] = lastMainImg;
        db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
        db.ref('boardCmd').push({ type: 'goto_tab', tab: 'T', ts: Date.now() });
      }, false);
    } else {
      // إذا لم يكن هناك حفظ (لم يدخل اختبار من قبل) نستخدم آخر صورة
      lastMainImg = mc.toDataURL('image/jpeg', 0.85);
      db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
      db.ref('boardCmd').push({ type: 'goto_tab', tab: 'T', ts: Date.now() });
    }
  }
};

  /* ================================================ */
  /* [016] إدارة الشرائح (Slides)                     */
  /* ================================================ */
  function saveSnap() {
    snapshots[activeSlide || 'main'] = mc.toDataURL('image/jpeg', 0.5);
  }

  // دالة التبديل بين الشرائح (معدلة لتعمل بشكل صحيح)
  window.switchToSlide = (id) => {
    saveSnap();
    activeSlide = id;
    currentBoard = 'main';
    function done() {
      lastMainImg = mc.toDataURL('image/jpeg', 0.85);
      db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
      if (classMode !== 'exam') db.ref('boardCmd').push({ type: 'goto_tab', tab: 'T', ts: Date.now() });
      updateThumb();
    }
    if (id === 'main') {
      document.getElementById('bTitle').textContent = 'السبورة الرئيسية';
      // العودة للحجم الافتراضي 1280x720 مع scale=1
      if (CW !== 1280 || CH !== 720) {
        resizeCanvases(1280, 720);
        scale = 1;
        applyScale(1);
      }
      loadCanvas(snapshots['main'] || lastMainImg || null, true, done, false);
    } else {
      const sl = slides.find(s => s.id === id);
      document.getElementById('bTitle').textContent = sl?.label || 'شريحة';
      const url = snapshots[id] || sl?.dataUrl || null;
      if (!url) {
        if (CW !== 1280 || CH !== 720) {
          resizeCanvases(1280, 720);
          scale = 1;
          applyScale(1);
        }
        mxBG.fillStyle = boardBg;
        mxBG.fillRect(0, 0, CW, CH);
        mxD.clearRect(0, 0, CW, CH);
        composite();
        done();
      } else {
        // تحميل الصورة ثم تغيير حجم canvas حسبها
        const img = new Image();
        img.onload = () => {
          // تغيير حجم canvas ليطابق الصورة (مع حد أقصى)
          let newW = img.width;
          let newH = img.height;
          const MAX = 2000;
          if (newW > MAX || newH > MAX) {
            const ratio = Math.min(MAX / newW, MAX / newH);
            newW = Math.floor(newW * ratio);
            newH = Math.floor(newH * ratio);
          }
          resizeCanvases(newW, newH);
          scale = 1;
          applyScale(1);
          mxBG.fillStyle = boardBg;
          mxBG.fillRect(0, 0, CW, CH);
          mxBG.drawImage(img, 0, 0, CW, CH);
          mxD.clearRect(0, 0, CW, CH);
          composite();
          done();
        };
        img.onerror = () => {
          console.error('فشل تحميل الصورة:', url);
          alert('فشل تحميل الصورة');
        };
        img.src = url;
      }
    }
    renderSlides();
  };

  function addSlide(url, label) {
    const id = 'sl_' + (nextSlId++);
    slides.push({ id, dataUrl: url || null, label: label || ('شريحة ' + (slides.length + 1)) });
    return id;
  }

  window.addAndSwitch = () => {
    window.switchToSlide(addSlide(null, 'شريحة ' + (slides.length + 1)));
  };

  window.deleteSlide = (id) => {
    slides = slides.filter(s => s.id !== id);
    delete snapshots[id];
    if (activeSlide === id) window.switchToSlide('main');
    else renderSlides();
  };

  function renderSlides() {
    const list = document.getElementById('slidesList');
    if (!list) return;
    const ms = snapshots['main'] || lastMainImg || '';
    let h = `<div class="slide-item${activeSlide === 'main' || !activeSlide ? ' active' : ''}" onclick="switchToSlide('main')">
      ${ms ? `<img class="slide-thumb" src="${ms}">` : '<div class="slide-empty">رئيسية</div>'}
      <span class="slide-num">1</span></div>`;
    slides.forEach((sl, i) => {
      const url = snapshots[sl.id] || sl.dataUrl || '';
      h += `<div class="slide-item${activeSlide === sl.id ? ' active' : ''}" onclick="switchToSlide('${sl.id}')">
        ${url ? `<img class="slide-thumb" src="${url}">` : `<div class="slide-empty">${sl.label}</div>`}
        <span class="slide-num">${i + 2}</span>
        <button class="slide-del" onclick="event.stopPropagation();deleteSlide('${sl.id}')"><i class="fas fa-times"></i></button>
      </div>`;
    });
    h += `<div class="slide-add" onclick="addAndSwitch()"><i class="fas fa-plus"></i><span>جديدة</span></div>`;
    list.innerHTML = h;
  }

  function updateThumb() {
    snapshots[activeSlide || 'main'] = mc.toDataURL('image/jpeg', 0.5);
    renderSlides();
  }

  // دالة رفع الشرائح - معدلة لتعمل بشكل موثوق
  window.uploadSlides = (input) => {
    // تحويل FileList إلى مصفوفة
    const files = Array.from(input.files);
    if (!files.length) {
      console.warn('لم يتم اختيار أي ملفات');
      return;
    }

    // فلترة الملفات لقبول الصور فقط
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('الرجاء اختيار صور فقط');
      input.value = '';
      return;
    }

    let processedCount = 0;
    const total = imageFiles.length;

    imageFiles.forEach(file => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          // إنشاء معرف جديد للشريحة
          const id = 'sl_' + (nextSlId++);
          const label = file.name.replace(/\.[^.]+$/, '').slice(0, 12); // أول 12 حرف من اسم الملف

          // إضافة الشريحة إلى المصفوفة وحفظ الصورة في snapshots
          slides.push({ id, dataUrl: e.target.result, label });
          snapshots[id] = e.target.result;

          processedCount++;
          console.log(`تمت معالجة الصورة ${processedCount}/${total}`);

          // بعد معالجة جميع الملفات، نقوم بتحديث واجهة الشرائح
          if (processedCount === total) {
            renderSlides();
            // تفريغ input لتمكين رفع نفس الملفات مرة أخرى
            input.value = '';
          }
        } catch (error) {
          console.error('خطأ أثناء معالجة الصورة:', error);
          alert('حدث خطأ أثناء رفع إحدى الصور');
        }
      };

      reader.onerror = () => {
        console.error('فشل قراءة الملف:', file.name);
        alert(`فشل قراءة الملف: ${file.name}`);
        processedCount++;
        if (processedCount === total) {
          renderSlides();
          input.value = '';
        }
      };

      reader.readAsDataURL(file);
    });
  };

  setTimeout(renderSlides, 300);

  /* ================================================ */
  /* [017] إدارة الطلاب (عرض، قبول، رفض، تحكم)       */
  /* ================================================ */
  window.mainBoard = () => {
    currentBoard = 'main';
    document.getElementById('bTitle').textContent = 'السبورة الرئيسية';
    loadCanvas(lastMainImg, true);
    db.ref('boardCmd').push({ type: 'teacher_returned_main', ts: Date.now() });
  };

  window.viewStudentBoard = (sid, name) => {
    currentBoard = sid;
    document.getElementById('bTitle').innerHTML = `سبورة ${name} &nbsp;<button onclick="mainBoard()" style="background:#ffaa00;color:#000;border:none;padding:2px 10px;border-radius:16px;font-size:10px;cursor:pointer;font-family:Cairo,sans-serif"><i class="fas fa-arrow-right"></i> رجوع</button>`;
    loadCanvas(lastStuImg[sid] || null, true);
  };

  window.shareBoard = (sid, name) => {
    if (!lastStuImg[sid]) return;
    db.ref('boardCmd').push({ type: 'show_student_board', studentId: sid, studentName: name, data: lastStuImg[sid], ts: Date.now() });
  };

  db.ref('boardImg_stu').on('child_added', snap => {
    const d = snap.val();
    if (d) {
      lastStuImg[snap.key] = d.data;
      if (currentBoard === snap.key) loadCanvas(d.data, false);
      render();
    }
  });
  db.ref('boardImg_stu').on('child_changed', snap => {
    const d = snap.val();
    if (d) {
      lastStuImg[snap.key] = d.data;
      if (currentBoard === snap.key) loadCanvas(d.data, false);
      render();
    }
  });

  // دالة عرض الطلاب (تطابق بنية HTML المطلوبة)
  function render() {
    let h = '';
    // طلاب الانتظار
    Object.values(waiting).forEach(s => {
      h += `<div class="si si-wait">
        <div class="scard-name">${s.name}</div>
        <div class="sact">
          <i class="fas fa-check-circle" style="color:#4CAF50" onclick="approveS('${s.id}')"></i>
          <i class="fas fa-times-circle" style="color:#b71c1c" onclick="rejectS('${s.id}')"></i>
        </div>
      </div>`;
    });
    // الطلاب المقبولين المتصلين
    Object.values(students).forEach(s => {
      if (!s.online) return;
      const spk = (currentSpeaker === s.id);
      const hand = s.handRaised;
      const want = s.wantsMic;
      let statusIcon = '';
      if (want || hand) statusIcon = '<i class="fas fa-hand-paper blink" style="color:#f59e0b"></i>';
      else if (spk) statusIcon = '<i class="fas fa-microphone" style="color:#22c55e"></i>';
      else statusIcon = '<i class="fas fa-headphones" style="color:#aaa"></i>';

      h += `<div class="si">
        <div class="scard-name" title="${s.name}">${s.name}</div>
        <div class="sact">
          ${s.hasAnswer ? `<i class="fas fa-check-circle" style="color:#22c55e" title="إجابة" onclick="viewStudentAnswer('${s.id}','${s.name}')"></i>` : ''}
          ${images[s.id]?.length ? `<i class="fas fa-image" onclick="openCorr('${s.id}','${s.name}')"></i>` : ''}
          <i class="fas fa-eye" onclick="viewStudentBoard('${s.id}','${s.name}')"></i>
          ${lastStuImg[s.id] ? `<i class="fas fa-share-alt" style="color:#4CAF50" onclick="shareBoard('${s.id}','${s.name}')"></i>` : ''}
          ${want ? `<i class="fas fa-microphone" style="color:#22c55e" onclick="allowMic('${s.id}')"></i>` : ''}
          ${spk ? `<i class="fas fa-microphone-slash" style="color:#e53935" onclick="revokeMic('${s.id}')"></i>` : ''}
          <i class="fas fa-sign-out-alt" style="color:#b71c1c" onclick="kickS('${s.id}')"></i>
        </div>
      </div>`;
    });
    document.getElementById('sList').innerHTML = h || '<div style="color:#aaa;text-align:center;padding:12px;font-size:11px">لا يوجد طلاب</div>';
    const n = Object.values(students).filter(s => s.online).length;
    ['cnt', 'cntP'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = n;
    });
  }

  // الإستماع لتغييرات قاعدة البيانات
  db.ref('joinRequests').on('child_added', snap => { const s = snap.val(); if (s) { waiting[s.id] = s; render(); } });
  db.ref('joinRequests').on('child_removed', snap => { const s = snap.val(); if (s) { delete waiting[s.id]; render(); } });
  db.ref('approvedStudents').on('value', snap => { students = snap.val() || {}; render(); });
  db.ref('onlineStudents').on('value', snap => {
    const o = snap.val() || {};
    Object.keys(students).forEach(id => {
      const was = students[id]?.online;
      students[id].online = !!o[id];
      if (!was && o[id] && micOn) callStu(id);
    });
    render();
  });
  db.ref('handRaised').on('value', snap => {
    const h = snap.val() || {};
    Object.keys(students).forEach(id => { if (students[id]) students[id].handRaised = !!h[id]; });
    render();
  });
  db.ref('micRequests').on('child_added', snap => { const r = snap.val(); if (!r) return; if (students[r.studentId]) students[r.studentId].wantsMic = true; render(); });
  db.ref('micRequests').on('child_removed', snap => { const r = snap.val(); if (!r) return; if (students[r.studentId]) students[r.studentId].wantsMic = false; render(); });
  db.ref('studentImages').on('child_added', snap => { const img = snap.val(); if (!img?.studentId) return; if (!images[img.studentId]) images[img.studentId] = []; images[img.studentId].push(img); render(); });
  db.ref('studentImages').on('child_changed', snap => { const img = snap.val(); if (!img?.studentId) return; images[img.studentId] = [img]; render(); });

  window.approveS = (id) => {
    const s = waiting[id];
    if (!s) return;
    delete waiting[id];
    db.ref('approvedStudents/' + id).set({ id, name: s.name });
    db.ref('joinRequests/' + id).remove();
    setTimeout(() => setupDC(id), 1000);
    render();
  };

  window.rejectS = (id) => {
    delete waiting[id];
    db.ref('joinRequests/' + id).remove();
    render();
  };

  window.kickS = (id) => {
    if (currentSpeaker === id) {
      currentSpeaker = null;
      db.ref('micPermissions/' + id).remove();
    }
    delete students[id];
    db.ref('approvedStudents/' + id).remove();
    db.ref('onlineStudents/' + id).remove();
    render();
  };

  window.revokeMic = (id) => {
    currentSpeaker = null;
    db.ref('micPermissions/' + id).remove();
    render();
  };

  window.allowMic = (id) => {
    if (currentSpeaker && currentSpeaker !== id) db.ref('micPermissions/' + currentSpeaker).remove();
    currentSpeaker = id;
    db.ref('micPermissions/' + id).set({ allowed: true, ts: Date.now() });
    db.ref('handRaised/' + id).remove();
    db.ref('micRequests/' + id).remove();
    if (students[id]) students[id].wantsMic = false;
    render();
  };

  <!-- ================================================ -->
<!-- [018] WebRTC للصوت (مدرس ← طالب) مع تحسين الجودة -->
<!-- ================================================ -->

async function callStu(sid) {
  if (audioPeers[sid]) return;
  const pc = new RTCPeerConnection(AUD_CFG);
  audioPeers[sid] = pc;

  if (tStream) {
    tStream.getTracks().forEach(track => {
      pc.addTrack(track, tStream);
    });
  }

  pc.onicecandidate = e => {
    if (e.candidate) db.ref('rtc/t2s_ice/' + sid).push(e.candidate.toJSON());
  };

  pc.onconnectionstatechange = () => {
    console.log('audio', sid, pc.connectionState);
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      pc.close();
      delete audioPeers[sid];
      if (pc.connectionState === 'failed' && micOn && students[sid]?.online)
        setTimeout(() => callStu(sid), 3000);
    }
  };

  const offerOptions = {
    offerToReceiveAudio: false,
    offerToReceiveVideo: false
  };

  const offer = await pc.createOffer(offerOptions);
  await pc.setLocalDescription(offer);

  // ضبط معدل البت للإرسال بعد إنشاء الاتصال
  setTimeout(() => {
    const senders = pc.getSenders();
    senders.forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = 128000;
        params.encodings[0].priority = 'high';
        params.encodings[0].networkPriority = 'high';
        sender.setParameters(params).catch(e => console.warn('فشل ضبط bitrate', e));
      }
    });
  }, 500);

  db.ref('rtc/t2s_offer/' + sid).set({ sdp: offer.sdp, type: offer.type, ts: Date.now() });

  db.ref('rtc/s2t_answer/' + sid).on('value', async snap => {
    const a = snap.val();
    if (a && a.sdp && pc.signalingState === 'have-local-offer')
      await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(() => { });
  });

  db.ref('rtc/s2t_ice/' + sid).on('child_added', async snap => {
    const ice = snap.val();
    if (ice) {
      try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch (_) { }
      snap.ref.remove();
    }
  });
}
  <!-- ================================================ -->
<!-- [019] تفعيل الميكروفون بجودة عالية               -->
<!-- ================================================ -->

window.toggleMic = async () => {
  const btn = document.getElementById('micBtn');
  if (!micOn) {
    try {
      tStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
          volume: 1.0
        },
        video: false
      });
      micOn = true;
      btn.classList.add('mic-on');
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      Object.keys(students).forEach(sid => {
        if (students[sid]?.online) callStu(sid);
      });
      db.ref('rtc/join_notify').on('child_added', snap => {
        const sid = snap.val();
        if (sid && micOn) callStu(sid);
        snap.ref.remove();
      });
    } catch (err) {
      alert('تعذر تشغيل الميكروفون:\n' + err.message);
    }
  } else {
    micOn = false;
    btn.classList.remove('mic-on');
    btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    if (tStream) { tStream.getTracks().forEach(t => t.stop()); tStream = null; }
    Object.values(audioPeers).forEach(pc => pc.close());
    Object.keys(audioPeers).forEach(k => delete audioPeers[k]);
    db.ref('rtc/t2s_offer').remove();
    db.ref('rtc/t2s_ice').remove();
  }
};
 <!-- ================================================ -->
<!-- [020] استقبال الصوت من الطالب بجودة عالية        -->
<!-- ================================================ -->

db.ref('micPermissions').on('child_added', async snap => {
  const sid = snap.key;
  if (!snap.val()?.allowed) return;
  if (stuPcMap[sid]) { try { stuPcMap[sid].close(); } catch (_) { } delete stuPcMap[sid]; }

  const pc = new RTCPeerConnection(AUD_CFG);
  stuPcMap[sid] = pc;

  pc.ontrack = e => {
    const a = document.getElementById('audioEl');
    a.srcObject = e.streams[0];
    a.play().catch(() => { });
    a.volume = 1.0;
  };

  pc.onicecandidate = e => {
    if (e.candidate) db.ref('rtc/t2s_stu_ice/' + sid).push(e.candidate.toJSON());
  };

  db.ref('rtc/s2t_stu_offer/' + sid).on('value', async snap2 => {
    const off = snap2.val();
    if (!off || !off.sdp || pc.signalingState !== 'stable') return;
    await pc.setRemoteDescription(new RTCSessionDescription(off));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    db.ref('rtc/t2s_stu_answer/' + sid).set({ sdp: ans.sdp, type: ans.type });
  });

  db.ref('rtc/s2t_stu_ice/' + sid).on('child_added', async snap2 => {
    const ice = snap2.val();
    if (ice) {
      try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch (_) { }
      snap2.ref.remove();
    }
  });
});

db.ref('micPermissions').on('child_removed', snap => {
  const sid = snap.key;
  if (stuPcMap[sid]) { try { stuPcMap[sid].close(); } catch (_) { } delete stuPcMap[sid]; }
  if (!Object.keys(stuPcMap).length) document.getElementById('audioEl').srcObject = null;
});
  /* ================================================ */
  /* [021] إنهاء الحصة وتصفير البيانات                */
  /* ================================================ */
  window.endClass = () => { if (confirm('إنهاء الحصة؟')) window.location.reload(); };

  window.resetAll = () => {
    if (!confirm('حذف جميع بيانات الجلسة؟')) return;
    if (tStream) { tStream.getTracks().forEach(t => t.stop()); tStream = null; }
    Object.values(audioPeers).forEach(pc => pc.close());
    Object.values(dcPeers).forEach(pc => pc.close());
    KEYS.forEach(k => db.ref(k).remove());
    students = {};
    waiting = {};
    images = {};
    currentSpeaker = null;
    currentBoard = 'main';
    mxBG.fillStyle = '#fff';
    mxBG.fillRect(0, 0, CW, CH);
    mxD.clearRect(0, 0, CW, CH);
    composite();
    lastMainImg = null;
    render();
  };

  /* ================================================ */
  /* [022] قياس زمن الاستجابة (Ping)                  */
  /* ================================================ */
  setInterval(() => {
    const t = Date.now();
    db.ref('ping_t').set(t);
    setTimeout(() => db.ref('ping_t').once('value', () => {
      const el = document.getElementById('lat');
      if (el) el.textContent = (Date.now() - t) + 'ms';
    }), 600);
  }, 6000);
})();
  /* ================================================ */
  /* [023] معاينة وتصحيح إجابات الطلاب (Corr Modal)  */
  /* ================================================ */

  // تخزين شرائح الاختبار لكل طالب { studentId: [{id, label, data}] }
  let studentExamSlides = {};
  // الطالب الحالي في نافذة المعاينة
  let corrCurrentStu = null;
  let corrCurrentStuName = null;
  // الشريحة المختارة حالياً في القائمة المنسدلة
  let corrSelectedSlideData = null;

  // استقبال إشعار شرائح الاختبار من الطلاب
  db.ref('studentExamSlides').on('child_added', snap => {
    const d = snap.val();
    if (!d || !d.studentId) return;
    if (!studentExamSlides[d.studentId]) studentExamSlides[d.studentId] = [];
    // تجنب التكرار
    if (!studentExamSlides[d.studentId].find(s => s.id === d.id)) {
      studentExamSlides[d.studentId].push({ id: d.id, label: d.label, data: d.data });
    }
    render();
  });

  db.ref('studentAnswers').on('value', snap => {
    const answers = snap.val() || {};
    Object.keys(answers).forEach(sid => {
      if (students[sid]) students[sid].hasAnswer = true;
    });
    render();
  });

  window.viewStudentAnswer = (sid, name) => {
    // فتح Modal وعرض أحدث إجابة
    db.ref('studentAnswers/' + sid).once('value', snap => {
      const d = snap.val();
      if (!d || !d.data) { alert('لا توجد إجابة بعد'); return; }
      openCorrModal(sid, name, d.data);
    });
  };

  window.openCorr = (sid, name) => {
    if (images[sid] && images[sid].length) {
      openCorrModal(sid, name, images[sid][images[sid].length - 1].data);
    }
  };

  function openCorrModal(sid, name, imgData) {
    corrCurrentStu = sid;
    corrCurrentStuName = name;
    corrSelectedSlideData = imgData;

    document.getElementById('corrTitle').textContent = 'معاينة: ' + name;
    document.getElementById('corrModal').style.display = 'flex';

    // بناء القائمة المنسدلة بشرائح الاختبار
    const slides = studentExamSlides[sid] || [];
    let dropHtml = '';
    if (slides.length > 0) {
      dropHtml = `<div style="margin-bottom:8px;">
        <label style="font-size:11px;color:#aaa;font-family:Cairo,sans-serif;">اختر شريحة للتصحيح:</label>
        <select id="examSlideSelect" onchange="onExamSlideSelect(this)" style="width:100%;padding:6px;border-radius:8px;border:1px solid #2a5090;background:#0d2040;color:#fff;font-family:Cairo,sans-serif;font-size:12px;margin-top:4px;">
          <option value="__current__">الإجابة الأخيرة</option>
          ${slides.map((s, i) => `<option value="${i}">${s.label}</option>`).join('')}
        </select>
      </div>`;
    }

    const wrap = document.getElementById('corrImgWrap');
    wrap.innerHTML = dropHtml + `<img src="${imgData}" style="max-width:100%;border-radius:8px;border:1px solid #1e4080;">`;
  }

  window.onExamSlideSelect = (sel) => {
    const val = sel.value;
    const slides = studentExamSlides[corrCurrentStu] || [];
    let imgData;
    if (val === '__current__') {
      db.ref('studentAnswers/' + corrCurrentStu).once('value', snap => {
        const d = snap.val();
        imgData = d?.data || (images[corrCurrentStu]?.[images[corrCurrentStu].length-1]?.data);
        if (imgData) {
          corrSelectedSlideData = imgData;
          const wrap = document.getElementById('corrImgWrap');
          const img = wrap.querySelector('img');
          if (img) img.src = imgData;
        }
      });
      return;
    }
    const sl = slides[parseInt(val)];
    if (sl) {
      corrSelectedSlideData = sl.data;
      const wrap = document.getElementById('corrImgWrap');
      const img = wrap.querySelector('img');
      if (img) img.src = sl.data;
    }
  };

  window.sendCorr = () => {
    if (!corrCurrentStu || !corrSelectedSlideData) return;
    db.ref('correctedImg/' + corrCurrentStu).set({ data: corrSelectedSlideData, ts: Date.now() });
    closeCorr();
    const n = corrCurrentStuName || corrCurrentStu;
    const cnt = Object.keys(students).filter(id => students[id]?.online).length;
    document.getElementById('cnt').textContent = cnt;
  };

  window.closeCorr = () => {
    document.getElementById('corrModal').style.display = 'none';
    corrCurrentStu = null;
    corrSelectedSlideData = null;
  };

