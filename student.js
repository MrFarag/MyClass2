/* ================================================ */
/* [001] بداية التنفيذ الذاتي وإعداد Firebase       */
/* ================================================ */
(function() {
  // الرمز السري للدخول (يمكن تغييره)
  const SECRET = '135';

  // تهيئة Firebase
  firebase.initializeApp({
    apiKey: "AIzaSyB7E4NsGQbCehVSQ3Kj97yExRZwpHzTOl8",
    databaseURL: "https://myclaive-default-rtdb.firebaseio.com"
  });
  const db = firebase.database();

  // حالة الاتصال
  // حالة الاتصال

  /* ================================================ */
  /* [002] إعداد Canvas (أبعاد متغيرة للطالب)        */
  /* ================================================ */
  const CW_DEFAULT = 1280, CH_DEFAULT = 720;

  // Canvas المدرس (offscreen - للتوافق الداخلي)
  const cT = document.createElement('canvas');
  const xT = cT.getContext('2d');
  cT.width = CW_DEFAULT; cT.height = CH_DEFAULT;

  // Canvas الطالب: طبقتان (خلفية + رسم) - قابلة للتغيير
  let CW = CW_DEFAULT, CH = CH_DEFAULT;
  const cSBG = document.getElementById('cSBG') || makeCanvas('cSBG');
  const xSBG = cSBG.getContext('2d');
  const cS = document.getElementById('cS');
  const xS = cS.getContext('2d');
  cSBG.width = CW; cSBG.height = CH;
  cS.width = CW; cS.height = CH;

  function makeCanvas(id) {
    const cv = document.createElement('canvas');
    cv.id = id;
    cv.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    document.getElementById('paneS')?.querySelector('.canvas-stack')?.prepend(cv);
    return cv;
  }

  function ic(ctx) { 
    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round'; 
  }

  function initCtx() {
    xT.fillStyle = '#fff'; xT.fillRect(0, 0, cT.width, cT.height);
    xS.fillStyle = '#fff'; xS.fillRect(0, 0, CW, CH);
    xSBG.fillStyle = '#fff'; xSBG.fillRect(0, 0, CW, CH);
  }
  initCtx();

  /* ================================================ */
  /* [003] دالة تغيير حجم canvases الطالب فقط         */
  /* ================================================ */
  function resizeStudentCanvases(newW, newH) {
    CW = newW; CH = newH;
    cSBG.width = CW; cSBG.height = CH;
    xSBG.fillStyle = '#fff'; xSBG.fillRect(0, 0, CW, CH);
    cS.width = CW; cS.height = CH;
    xS.clearRect(0, 0, CW, CH);
    // ✅ ملاءمة السبورة للحيز المتاح بعد تغيير الحجم
    applyScale('S', sc.S);
  }

  /* ================================================ */
  /* [004] دالة رسم صورة مع الحفاظ على النسبة         */
  /* ================================================ */
  function drawImageOnCanvas(img, targetCtx, targetWidth, targetHeight) {
    targetCtx.fillStyle = '#fff';
    targetCtx.fillRect(0, 0, targetWidth, targetHeight);
    const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offsetX = (targetWidth - drawW) / 2;
    const offsetY = (targetHeight - drawH) / 2;
    targetCtx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }

/* ================================================ */
/* [005] تحميل صورة للطالب (مطابقة لعرض المدرس)    */
/* ================================================ */
function loadStudentImage(url, clearDraw = true, callback, naturalSize = false) {
  const img = new Image();
  img.onload = () => {
    let newW = img.width, newH = img.height;
    const MAX = 2000;
    if (newW > MAX || newH > MAX) {
      const ratio = Math.min(MAX / newW, MAX / newH);
      newW = Math.floor(newW * ratio);
      newH = Math.floor(newH * ratio);
    }

    // احفظ رسم الطالب على cS قبل أي resize (resize يمسح canvas تلقائياً)
    let savedDraw = null;
    if (!clearDraw && (newW !== CW || newH !== CH)) {
      savedDraw = xS.getImageData(0, 0, CW, CH);
    }

    resizeStudentCanvases(newW, newH);

    // رسم الصورة بحجمها الكامل على الخلفية
    xSBG.fillStyle = '#fff';
    xSBG.fillRect(0, 0, CW, CH);
    xSBG.drawImage(img, 0, 0, CW, CH);

    if (clearDraw) {
      xS.clearRect(0, 0, CW, CH);
    } else if (savedDraw) {
      // أعد رسم الطالب بعد الـ resize
      xS.putImageData(savedDraw, 0, 0);
    }

    if (callback) callback();
  };
  img.src = url;
}

  /* ================================================ */
  /* [006] تحميل صورة للمدرس (مع ضبط حجم canvas)    */
  /* ================================================ */
  function loadTeacherImage(url, callback) {
    const img = new Image();
    img.onload = () => {
      // ✅ تغيير حجم cT ليطابق أبعاد الصورة تماماً (بدون تمديد أو ضغط)
      let newW = img.width, newH = img.height;
      const MAX = 2000;
      if (newW > MAX || newH > MAX) {
        const ratio = Math.min(MAX / newW, MAX / newH);
        newW = Math.floor(newW * ratio);
        newH = Math.floor(newH * ratio);
      }
      // تغيير حجم canvas المدرس ليطابق الصورة
      if (cT.width !== newW || cT.height !== newH) {
        cT.width = newW;
        cT.height = newH;
      }
      xT.fillStyle = '#fff';
      xT.fillRect(0, 0, newW, newH);
      // رسم الصورة بحجمها الطبيعي (1:1) بدون تمديد
      xT.drawImage(img, 0, 0, newW, newH);
      // ✅ تطبيق الـ scale الحالي فقط (بدون إعادة fit تلقائية)
      applyScale('T', sc.T);
      if (callback) callback();
    };
    img.src = url;
  }

/* ================================================ */
/* [007] التحكم بالتكبير والملاءمة (100% افتراضي)  */
/* ================================================ */
const sc = { T: 1, S: 1 };

function applyScale(id, s) {
  s = Math.min(5, Math.max(0.15, s));
  sc[id] = s;

  const cv = id === 'T' ? cT : cS;
  const wr = document.getElementById('wrap' + id);
  const currentW = id === 'T' ? cT.width : CW;
  const currentH = id === 'T' ? cT.height : CH;

  cv.style.width = (currentW * s) + 'px';
  cv.style.height = (currentH * s) + 'px';

  if (id === 'S' && cSBG) {
    cSBG.style.width = (CW * s) + 'px';
    cSBG.style.height = (CH * s) + 'px';
  }

  if (wr) {
    wr.style.alignItems = (currentH * s < wr.clientHeight) ? 'center' : 'flex-start';
    wr.style.justifyContent = (currentW * s < wr.clientWidth) ? 'center' : 'flex-start';
  }

  const zv = document.getElementById('zv' + id);
  if (zv) zv.textContent = Math.round(s * 100) + '%';
}

/* زر الملاءمة للشاشة */
function fitId(id) {
  const wr = document.getElementById('wrap' + id);
  if (!wr) return;

  const W = wr.clientWidth;
  const H = wr.clientHeight;

  const currentW = id === 'T' ? cT.width : CW;
  const currentH = id === 'T' ? cT.height : CH;

  const newScale = Math.min(W / currentW, H / currentH);
  applyScale(id, newScale);
}

/* أزرار التكبير */
window.Z = (id, d) => {
  applyScale(id, sc[id] + d);
};

window.fit = id => fitId(id);

/* ===== البداية دائماً 100% ===== */
let initialFitDone = false;

setTimeout(() => {
  if (!initialFitDone) {
    applyScale("T", 1);
    applyScale("S", 1);
    initialFitDone = true;
  }
}, 200);

/* عند تغيير حجم المتصفح */
window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    applyScale('T', sc.T);
    applyScale('S', sc.S);
  });
});

  /* ================================================ */
  /* [008] إدارة التبويبات                            */
  /* ================================================ */
  let activeTab = 'S'; // سبورة واحدة دائماً
  window.goTab = function(t) {
    // في النموذج الجديد: سبورة واحدة فقط - goTab لا يفعل شيئاً
    activeTab = 'S';
    setTimeout(() => applyScale('S', sc.S), 80);
    if (approved && myId) db.ref('boardView/' + myId).set('S');
  };

  function badge() {
    // لا badge في النموذج الجديد
  }

  /* ================================================ */
  /* [009] دالة عرض الإشعارات (Toast)                 */
  /* ================================================ */
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 4000);
  }

  /* ================================================ */
  /* [010] المتغيرات العامة                           */
  /* ================================================ */
  const myId = 's' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  let myName = '', myPhone = '', approved = false, handRaised = false;
  let tool = 'pen', clr = '#000', sz = 4;
  let drawing = false, strokeId = 0, pts = [], ptimer = null;
  let micOn = false, micState = 'idle', tPc = null, sPc = null, sStream = null;
  let tLP = null, tLS = null;
  let lastMyBoardImg = null;
  let teacherLastPoints = {};
  let teacherDataChannel = null, teacherPC = null;
  let hlSnap = null;
  let examMode = false;

  // متغيرات الشرائح والتعليقات
  let currentSlide = 'main';
  let slideStrokes = {};      // تخزين strokes لكل شريحة { slideId: [strokes] }

  /* ================================================ */
  /* [011] تسجيل الدخول وانتظار الموافقة             */
  /* ================================================ */
  window.submitEntry = function() {
    const name = document.getElementById('studentName').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();
    const sec = document.getElementById('studentSecret').value.trim();
    const errEl = document.getElementById('secretErr');
    if (!name) { alert('الرجاء إدخال الاسم'); return; }
    if (sec !== SECRET) {
      errEl.style.display = 'block';
      document.getElementById('studentSecret').style.borderColor = '#ff6b6b';
      return;
    }
    errEl.style.display = 'none';
    myName = name; myPhone = phone;
    document.getElementById('formPart').style.display = 'none';
    document.getElementById('waitPart').style.display = 'flex';
    db.ref('joinRequests/' + myId).set({ id: myId, name: myName, phone: myPhone, ts: Date.now() });
    db.ref('approvedStudents/' + myId).on('value', snap => {
      if (!snap.exists() || approved) return;
      approved = true;
      document.getElementById('entryScreen').classList.add('hidden');
      db.ref('onlineStudents/' + myId).set({ name: myName, online: true });
      db.ref('joinRequests/' + myId).remove();
      db.ref('onlineStudents/' + myId).onDisconnect().remove();
      toast('✅ مرحباً ' + myName, 'g');
      go();
    });
  };
  // استخراج اسم الجهاز من User Agent
  function getDeviceName() {
    const ua = navigator.userAgent;
    // iPhone
    if (/iPhone/.test(ua)) return 'iPhone';
    // iPad
    if (/iPad/.test(ua)) return 'iPad';
    // Android - محاولة استخراج اسم الجهاز
    const android = ua.match(/Android[^;]*;\s*([^)]+)\)/);
    if (android) {
      // تنظيف النص (إزالة Build وما بعدها)
      return android[1].replace(/Build.*/i, '').trim();
    }
    // Windows
    if (/Windows/.test(ua)) return 'Windows PC';
    // Mac
    if (/Macintosh/.test(ua)) return 'Mac';
    // Linux
    if (/Linux/.test(ua)) return 'Linux PC';
    return '';
  }

  window.quickEntry = function() {
    const deviceName = getDeviceName();
    // إذا كان حقل الاسم فارغاً واسم الجهاز متاح، نملأه تلقائياً
    const nameEl = document.getElementById('studentName');
    if (!nameEl.value.trim() && deviceName) {
      nameEl.value = deviceName;
    }
    document.getElementById('studentPhone').value = '000';
    document.getElementById('studentSecret').value = SECRET;
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    window.submitEntry();
  };

  /* ================================================ */
  /* [012] بدء الجلسة بعد الموافقة                    */
  /* ================================================ */
  function go() {
    listen();
    connectAudio();
    setupDataChannelReceiver();
    watchMicPermission();
    db.ref('boardView/' + myId).set('S');
    setTimeout(updateSzPreview, 200);
    db.ref('rtc/join_notify').push(myId);
    createSidebarIcons();
    // إظهار الشريط السفلي دائماً (سبورة واحدة)
    const bs = document.getElementById('botS');
    if (bs) bs.style.display = 'flex';
    startSessionTimer();
  }

  function startSessionTimer() {
    let sec = 0;
    setInterval(() => {
      sec++;
      const m = String(Math.floor(sec/60)).padStart(2,'0');
      const s = String(sec%60).padStart(2,'0');
      const el = document.getElementById('sessionTimer');
      if (el) el.textContent = m + ':' + s;
    }, 1000);
  }

  /* ================================================ */
  /* [013] الاستماع لأوامر المدرس (محدث: إصلاح الخطوط المتقطعة) */
  /* ================================================ */
  function listen() {
    // رسم المدرس على cT (بدون تغيير)
    db.ref('draw_t').on('child_added', snap => {
      const d = snap.val();
      if (!d) return;
      // ✅ معالجة الأشكال الهندسية
      if (d.shape) {
        const s = { x: d.start.x * cT.width, y: d.start.y * cT.height };
        const e = { x: d.end.x   * cT.width, y: d.end.y   * cT.height };
        drawShape(xT, d.shape, s, e, d.c, d.s || 4);
        return;
      }
      if (!d.pts) return;
      const p = d.pts, c = d.c, s = d.s || 4, id = d.sid;
      ic(xT);
      if (d.hl) {
        xT.globalAlpha = 0.38; xT.strokeStyle = c; xT.lineWidth = s;
        xT.beginPath();
        if (tLP && id && id === tLS) xT.moveTo(tLP.x, tLP.y);
        else xT.moveTo(p[0].x * cT.width, p[0].y * cT.height);
        p.forEach(pt => xT.lineTo(pt.x * cT.width, pt.y * cT.height));
        xT.stroke(); xT.globalAlpha = 1;
      } else {
        xT.strokeStyle = c === null ? '#fff' : c;
        xT.lineWidth = c === null ? s * 5 : s;
        xT.beginPath();
        if (tLP && id && id === tLS) xT.moveTo(tLP.x, tLP.y);
        else xT.moveTo(p[0].x * cT.width, p[0].y * cT.height);
        p.forEach(pt => xT.lineTo(pt.x * cT.width, pt.y * cT.height));
        xT.stroke();
      }
      const last = p[p.length - 1];
      tLP = { x: last.x * cT.width, y: last.y * cT.height };
      tLS = id;
    });

    // صورة السبورة الكاملة من المدرس
    db.ref('boardImg').on('value', snap => {
      const d = snap.val();
      if (!d || !d.data) return;
      tLP = null; tLS = null;
      // تحديث صورة شريحة المدرس في القائمة
      const mainSlide = stuSlides ? stuSlides.find(s => s.id === 'main') : null;
      if (mainSlide) { mainSlide.boardImg = d.data; }
      // إذا كانت الشريحة النشطة هي المدرس: حمّل الصورة
      if (activeStuSlide === 'main') {
        loadStudentImage(d.data, false);
      }
      renderStuSlides();
    });

    // رسم المدرس على سبورة الطالب (محدث)
    db.ref('teacher_draw_on_student/' + myId).on('child_added', snap => {
      const d = snap.val();
      if (!d || !d.pts) return;
      const p = d.pts, c = d.c, s = d.s || 4, sid = d.sid, era = d.era, slideId = d.slideId || 'main';
      if (!slideStrokes[slideId]) slideStrokes[slideId] = [];
      slideStrokes[slideId].push(d);
      if (slideId === currentSlide) {
        const prevComp = xS.globalCompositeOperation;
        // إعادة تعيين lineDash لضمان خط متصل
        xS.setLineDash([]);
        ic(xS); // ضبط lineCap و lineJoin
        if (era) {
          xS.globalCompositeOperation = 'destination-out';
          xS.strokeStyle = '#000';
        } else {
          xS.globalCompositeOperation = 'source-over';
          xS.strokeStyle = c === null ? '#fff' : c;
        }
        xS.lineWidth = s;
        xS.beginPath();
        if (sid && teacherLastPoints[sid]) {
          xS.moveTo(teacherLastPoints[sid].x, teacherLastPoints[sid].y);
        } else {
          xS.moveTo(p[0].x * CW, p[0].y * CH);
        }
        p.forEach(pt => xS.lineTo(pt.x * CW, pt.y * CH));
        xS.stroke();
        xS.globalCompositeOperation = prevComp;
        const last = p[p.length - 1];
        if (sid) teacherLastPoints[sid] = { x: last.x * CW, y: last.y * CH };
        lastMyBoardImg = mergedSnapshot();
        // ✅ إصلاح: إرسال الصورة المحدثة فور تعليق المدرس (لا ينتظر رسم الطالب)
        db.ref('boardImg_stu/' + myId).set({ data: lastMyBoardImg, ts: Date.now() });
      }
    });

    // استقبال التصحيح
    db.ref('correctedImg/' + myId).on('value', snap => {
      const d = snap.val();
      if (!d || !d.data) return;
      loadStudentImage(d.data, true, () => {
        lastMyBoardImg = mergedSnapshot();
        toast('✅ وصل تصحيح المدرس!', 'g');
        badge();
        goTab('S');
      });
    });

    // أوامر السبورة
    db.ref('boardCmd').on('child_added', snap => {
      const cmd = snap.val();
      if (!cmd) return;

      if (cmd.type === 'clear') {
        xT.fillStyle = '#fff'; xT.fillRect(0, 0, cT.width, cT.height);
        tLP = null; tLS = null;
      }

      if (cmd.type === 'show_student_board') {
        if (cmd.studentId === myId) return;
        // في النموذج الجديد: نعرض سبورة الطالب الآخر على الشريحة الرئيسية مؤقتاً
        if (activeStuSlide === 'main') {
          loadStudentImage(cmd.data, false, () => {
            toast('📋 المدرس يعرض سبورة: ' + cmd.studentName, 'a');
          });
        }
      }

      if (cmd.type === 'teacher_returned_main') {
        if (activeStuSlide === 'main') {
          db.ref('boardImg').once('value', s => {
            const d = s.val();
            if (!d || !d.data) return;
            loadStudentImage(d.data, false);
          });
        }
      }

      if (cmd.type === 'class_mode') {
        setExamMode(cmd.mode === 'exam');
      }

      if (cmd.type === 'exam_question' && cmd.data) {
        // أضف شريحة اختبار جديدة
        const examId = addExamSlide(cmd.data);
        // انتقل لها تلقائياً
        activeStuSlide = examId;
        loadStudentImage(cmd.data, true, () => {
          const btn = document.getElementById('submitAnsBtn');
          if (btn) btn.style.display = examMode ? '' : 'none';
          const titleEl = document.getElementById('boardTitle');
          if (titleEl) {
            const sl = stuSlides.find(s => s.id === examId);
            if (sl) titleEl.innerHTML = '<i class="fas fa-pen-square" style="color:#f59e0b"></i> ' + sl.label;
          }
          renderStuSlides();
        });
      }

      if (cmd.type === 'goto_slide' && cmd.slideId) {
        currentSlide = cmd.slideId;
        db.ref('boardImg').once('value', s => {
          const d = s.val();
          if (d && d.data) {
            loadStudentImage(d.data, true, () => {
              if (slideStrokes[currentSlide]) {
                applyStrokesToCanvas(xS, slideStrokes[currentSlide]);
              }
            });
          }
        });
      }

      if (cmd.type === 'goto_tab' && cmd.tab) {
        // في النموذج الجديد: سبورة واحدة لا يوجد tab switching
        // goto_tab 'T' يعني العودة لشريحة المدرس
        if (!cmd.targetId || cmd.targetId === myId) {
          if (cmd.tab === 'T') switchStuSlide('main');
        }
      }
    });

    // عدد الطلاب المتصلين
    db.ref('onlineStudents').on('value', snap => {
      const el = document.getElementById('cnt');
      if (el) el.textContent = Object.keys(snap.val() || {}).length;
    });

    // تحديث صورة سبورة الطالب
    db.ref('boardImg_stu/' + myId).on('value', snap => {
      const d = snap.val();
      if (d && d.data) lastMyBoardImg = d.data;
    });
  }

  // دالة رسم الأشكال الهندسية (مطابقة للمدرس)
  function drawShape(ctx, t, s, e, c, lw) {
    ctx.save();
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (t === 'line') {
      ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    } else if (t === 'arrow') {
      ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      const a = Math.atan2(e.y - s.y, e.x - s.x); const h = 16;
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x - h * Math.cos(a - 0.4), e.y - h * Math.sin(a - 0.4));
      ctx.lineTo(e.x - h * Math.cos(a + 0.4), e.y - h * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    } else if (t === 'rect') {
      ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
    } else if (t === 'circle') {
      ctx.ellipse((s.x + e.x) / 2, (s.y + e.y) / 2, Math.abs(e.x - s.x) / 2, Math.abs(e.y - s.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (t === 'tri') {
      ctx.moveTo((s.x + e.x) / 2, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(s.x, e.y);
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  // دالة لتطبيق strokes على canvas (محدثة)
  function applyStrokesToCanvas(ctx, strokes) {
    strokes.forEach(s => {
      const p = s.pts, c = s.c, w = s.s, era = s.era;
      const prevComp = ctx.globalCompositeOperation;
      ctx.setLineDash([]);
      ic(ctx);
      if (era) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = c === null ? '#fff' : c;
      }
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p[0].x * CW, p[0].y * CH);
      p.forEach(pt => ctx.lineTo(pt.x * CW, pt.y * CH));
      ctx.stroke();
      ctx.globalCompositeOperation = prevComp;
    });
  }

  /* ================================================ */
  /* [014] وضع الاختبار                               */
  /* ================================================ */
  function setExamMode(on) {
    examMode = on;
    const btn = document.getElementById('submitAnsBtn');
    if (btn) btn.style.display = (on && activeStuSlide !== 'main') ? '' : 'none';
    const banner = document.getElementById('examBanner');
    if (banner) {
      banner.textContent = on ? 'وضع الاختبار - اكتب إجابتك واضغط "رفع الإجابة"' : '';
      banner.classList.toggle('show', on);
    }
    // عند إيقاف وضع الاختبار: العودة لسبورة المدرس
    if (!on) {
      switchStuSlide('main');
    }
  }

  function mergedSnapshot() {
    const tmp = document.createElement('canvas');
    tmp.width = CW; tmp.height = CH;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(cSBG, 0, 0);
    ctx.drawImage(cS, 0, 0);
    return tmp.toDataURL('image/jpeg', 0.85);
  }

  window.submitAnswer = function() {
    const data = mergedSnapshot();
    db.ref('studentAnswers/' + myId).set({ studentId: myId, studentName: myName, data, ts: Date.now() });
    toast('✅ تم رفع الإجابة', 'g');
  };

  /* ================================================ */
  /* [015] استقبال DataChannel (رسم مباشر) (محدث)    */
  /* ================================================ */
  function setupDataChannelReceiver() {
    db.ref('rtc/teacherDraw/' + myId + '/offer').on('value', async snap => {
      const offer = snap.val();
      if (!offer || teacherPC) return;
      teacherPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      teacherPC.ondatachannel = ev => {
        teacherDataChannel = ev.channel;
        teacherDataChannel.onmessage = e => {
          try {
            const d = JSON.parse(e.data);
            if (d && (d.pts || d.shape)) drawDCStroke(d); // ✅ قبول الأشكال أيضاً
          } catch (_) { }
        };
      };
      teacherPC.onicecandidate = e => {
        if (e.candidate) db.ref('rtc/teacherDraw/' + myId + '/candidate').push(e.candidate.toJSON());
      };
      await teacherPC.setRemoteDescription(new RTCSessionDescription(offer));
      const ans = await teacherPC.createAnswer();
      await teacherPC.setLocalDescription(ans);
      db.ref('rtc/teacherDraw/' + myId + '/answer').set({ sdp: ans.sdp, type: ans.type });
    });
    db.ref('rtc/teacherDraw/' + myId + '/candidate').on('child_added', async snap => {
      const c = snap.val();
      if (c && teacherPC) {
        try { await teacherPC.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { }
        snap.ref.remove();
      }
    });
  }

  function drawDCStroke(d) {
    // ✅ معالجة الأشكال الهندسية عبر DataChannel - ترسم على cSBG إذا كانت الشريحة الرئيسية
    if (d.shape) {
      if (activeStuSlide === 'main') {
        const s2 = { x: d.start.x * CW, y: d.start.y * CH };
        const e2 = { x: d.end.x   * CW, y: d.end.y   * CH };
        drawShape(xSBG, d.shape, s2, e2, d.c, d.s || 4);
      }
      return;
    }
    const p = d.pts, c = d.c, s = d.s || 4, id = d.sid, era = d.era, slideId = d.slideId || 'main';
    if (!slideStrokes[slideId]) slideStrokes[slideId] = [];
    slideStrokes[slideId].push(d);
    if (slideId === currentSlide) {
      const prevComp = xS.globalCompositeOperation;
      xS.setLineDash([]);
      ic(xS);
      if (era) {
        xS.globalCompositeOperation = 'destination-out';
        xS.strokeStyle = '#000';
      } else {
        xS.globalCompositeOperation = 'source-over';
        xS.strokeStyle = c === null ? '#fff' : c;
      }
      xS.lineWidth = s;
      xS.beginPath();
      const lp = teacherLastPoints[id || 'dc'];
      if (lp) xS.moveTo(lp.x, lp.y);
      else xS.moveTo(p[0].x * CW, p[0].y * CH);
      p.forEach(pt => xS.lineTo(pt.x * CW, pt.y * CH));
      xS.stroke();
      xS.globalCompositeOperation = prevComp;
      const last = p[p.length - 1];
      teacherLastPoints[id || 'dc'] = { x: last.x * CW, y: last.y * CH };
      lastMyBoardImg = mergedSnapshot();
      // ✅ إصلاح: إرسال الصورة المحدثة فور تعليق المدرس عبر DataChannel
      db.ref('boardImg_stu/' + myId).set({ data: lastMyBoardImg, ts: Date.now() });
    }
  }

  /* ================================================ */
  /* [016] أدوات الرسم للطالب (مع ربط الشريحة)       */
  /* ================================================ */
  function xyOf(e) {
    const r = cS.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (CW / r.width), y: (t.clientY - r.top) * (CH / r.height) };
  }

  cS.addEventListener('mousedown', e => startD(e));
  cS.addEventListener('mousemove', e => moveD(e));
  cS.addEventListener('mouseup', () => stopD());
  cS.addEventListener('mouseleave', () => stopD());
  cS.addEventListener('touchstart', e => startD(e), { passive: false });
  cS.addEventListener('touchmove', e => moveD(e), { passive: false });
  cS.addEventListener('touchend', () => stopD());

  function startD(e) {
    e.preventDefault();
    if (!approved) return;
    drawing = true;
    strokeId = Date.now();
    pts = [];
    const p = xyOf(e);
    ic(xS);
    if (tool === 'highlight') {
      hlSnap = cS.toDataURL();
    } else if (tool === 'eraser') {
      xS.globalCompositeOperation = 'destination-out';
    } else if (tool === 'eraserBG') {
      xSBG.globalCompositeOperation = 'destination-out';
    } else {
      xS.globalCompositeOperation = 'source-over';
    }
    xS.beginPath();
    xS.moveTo(p.x, p.y);
    pts.push({ x: p.x / CW, y: p.y / CH });
  }

  function moveD(e) {
    e.preventDefault();
    if (!drawing || !approved) return;
    const p = xyOf(e);
    if (tool === 'highlight' && hlSnap) {
      const img = new Image();
      img.onload = () => {
        xS.globalCompositeOperation = 'source-over';
        xS.clearRect(0, 0, CW, CH);
        xS.drawImage(img, 0, 0);
        xS.globalAlpha = 0.38;
        xS.strokeStyle = clr;
        xS.lineWidth = sz * 5;
        xS.lineCap = 'round'; xS.lineJoin = 'round';
        xS.beginPath();
        pts.forEach((pt, i) => i ? xS.lineTo(pt.x * CW, pt.y * CH) : xS.moveTo(pt.x * CW, pt.y * CH));
        xS.lineTo(p.x, p.y);
        xS.stroke();
        xS.globalAlpha = 1;
      };
      img.src = hlSnap;
      pts.push({ x: p.x / CW, y: p.y / CH });
      if (!ptimer) ptimer = setTimeout(flush, 30);
      return;
    }
    const ctx = (tool === 'eraserBG') ? xSBG : xS;
    const lw = (tool === 'eraser' || tool === 'eraserBG') ? sz * 5 : sz;
    if (tool !== 'eraser' && tool !== 'eraserBG') ctx.strokeStyle = clr;
    ctx.lineWidth = lw;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    pts.push({ x: p.x / CW, y: p.y / CH });
    if (!ptimer) ptimer = setTimeout(flush, 30);
  }

  function stopD() {
    if (!drawing || !approved) return;
    drawing = false;
    if (ptimer) { clearTimeout(ptimer); ptimer = null; }
    flush();
    xS.globalCompositeOperation = 'source-over';
    xSBG.globalCompositeOperation = 'source-over';
    hlSnap = null;
    lastMyBoardImg = mergedSnapshot();
    db.ref('boardImg_stu/' + myId).set({ data: lastMyBoardImg, ts: Date.now() });
  }

  function flush() {
    ptimer = null;
    if (!pts.length) return;
    const isEra = (tool === 'eraser');
    const isEraBG = (tool === 'eraserBG');
    const isHL = (tool === 'highlight');
    const strokeData = {
      pts: pts.slice(),
      c: (isEra || isEraBG) ? null : clr,
      s: (isEra || isEraBG) ? sz * 5 : (isHL ? sz * 5 : sz),
      era: isEra,
      eraBG: isEraBG,
      hl: isHL,
      studentId: myId,
      sid: strokeId,
      slideId: currentSlide,
      ts: Date.now()
    };
    db.ref('draw_st').push(strokeData);
    if (!slideStrokes[currentSlide]) slideStrokes[currentSlide] = [];
    slideStrokes[currentSlide].push(strokeData);
    if (!isHL) pts = [];
  }

  // واجهة المستخدم لأدوات الطالب
  window.setTool = t => {
    tool = t;
    const map = { pen: 'tiPen', eraser: 'tiEra', eraserBG: 'tiEraBG', highlight: 'tiHL' };
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
    updateSzPreview();
  };

  window.adjSz = d => {
    sz = Math.max(1, Math.min(40, sz + d));
    const v = document.getElementById('szV');
    if (v) v.textContent = sz;
    updateSzPreview();
  };

  function updateSzPreview() {
    const p = document.getElementById('szPreview');
    if (!p) return;
    const r = Math.min(sz * 2, 24);
    p.style.width = p.style.height = (r * 2) + 'px';
    p.style.borderRadius = r + 'px';
    p.style.background = clr;
  }
  window.updateSzPreview = updateSzPreview;

  window.clearS = () => {
    xS.clearRect(0, 0, CW, CH);
    xSBG.clearRect(0, 0, CW, CH);
    lastMyBoardImg = mergedSnapshot();
    db.ref('boardImg_stu/' + myId).set({ data: lastMyBoardImg, ts: Date.now() });
  };
  window.clearAll = () => window.clearS();

  window.saveS = () => {
    const a = document.createElement('a');
    a.download = 'my-board.png';
    a.href = mergedSnapshot();
    a.click();
  };

  window.goFS = () => {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  };

  // رفع واجب / صورة (مع تطبيق fit)
  window.uploadHW = function(input) {
    if (!input.files[0] || !approved) return;
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        let newW = img.width, newH = img.height;
        const MAX = 2000;
        if (newW > MAX || newH > MAX) {
          const ratio = Math.min(MAX / newW, MAX / newH);
          newW = Math.floor(newW * ratio);
          newH = Math.floor(newH * ratio);
        }
        resizeStudentCanvases(newW, newH);
        // رسم الصورة بحجمها الكامل (مطابقة لما يراه المدرس)
        xSBG.fillStyle = '#fff';
        xSBG.fillRect(0, 0, CW, CH);
        xSBG.drawImage(img, 0, 0, CW, CH);
        xS.clearRect(0, 0, CW, CH);
        lastMyBoardImg = mergedSnapshot();
        db.ref('boardImg_stu/' + myId).set({ data: lastMyBoardImg, ts: Date.now() });
        db.ref('studentImages/' + myId).set({ studentId: myId, studentName: myName, data: lastMyBoardImg, ts: Date.now() });
        goTab('S');
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(input.files[0]);
    input.value = '';
  };

  // رفع اليد
  window.toggleHand = () => {
    if (!approved) return;
    handRaised = !handRaised;
    const hb = document.getElementById('handBtn');
    if (hb) hb.classList.toggle('hand-on', handRaised);
    handRaised ? db.ref('handRaised/' + myId).set(true) : db.ref('handRaised/' + myId).remove();
  };

  /* ================================================ */
  /* [017] استقبال الصوت من المدرس (محسن)             */
  /* ================================================ */
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  function connectAudio() {
    db.ref('rtc/t2s_offer/' + myId).on('value', async snap => {
      const off = snap.val();
      if (!off || !off.sdp) return;
      if (tPc) { try { tPc.close(); } catch (_) { } tPc = null; }
      tPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      tPc.ontrack = e => {
        const a = document.getElementById('audioEl');
        a.srcObject = e.streams[0];
        a.play().catch(() => { });
      };
      tPc.onicecandidate = e => {
        if (e.candidate) db.ref('rtc/s2t_ice/' + myId).push(e.candidate.toJSON());
      };
      tPc.onconnectionstatechange = () => {
        console.log('audio', tPc?.connectionState);
        if (tPc && ['failed', 'disconnected'].includes(tPc.connectionState)) {
          setTimeout(() => db.ref('rtc/join_notify').push(myId), 3000);
        }
      };
      db.ref('rtc/t2s_ice/' + myId).on('child_added', async s2 => {
        const ice = s2.val();
        if (ice) { try { await tPc?.addIceCandidate(new RTCIceCandidate(ice)); } catch (_) { } s2.ref.remove(); }
      });
      await tPc.setRemoteDescription(new RTCSessionDescription(off));
      const ans = await tPc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await tPc.setLocalDescription(ans);
      db.ref('rtc/s2t_answer/' + myId).set({ sdp: ans.sdp, type: ans.type, ts: Date.now() });
      console.log('answer sent');
    });
  }

  /* ================================================ */
  /* [018] إرسال الصوت من الطالب (محسن)              */
  /* ================================================ */
  function setMicState(state) {
    micState = state;
    const btn = document.getElementById('micBtn');
    if (!btn) return;
    btn.className = 'sb-btn';
    const icon = document.getElementById('micIcon');
    const lbl = document.getElementById('micLabel');
    if (state === 'idle') {
      if (icon) icon.className = 'fas fa-microphone-slash';
      if (lbl) lbl.textContent = 'مايك';
    } else if (state === 'requesting') {
      if (icon) icon.className = 'fas fa-microphone';
      if (lbl) lbl.textContent = 'طلب...';
      btn.classList.add('mic-requesting');
    } else if (state === 'allowed') {
      if (icon) icon.className = 'fas fa-microphone';
      if (lbl) lbl.textContent = 'يُسمع';
      btn.classList.add('mic-allowed');
    }
  }

  function watchMicPermission() {
    db.ref('micPermissions/' + myId).on('value', async snap => {
      const allowed = snap.val()?.allowed;
      if (allowed) {
        setMicState('allowed');
        if (micOn && sStream && !sPc) await startMicRTC();
      } else {
        if (sPc) { try { sPc.close(); } catch (_) { } sPc = null; }
        setMicState(micOn ? 'requesting' : 'idle');
      }
    });
  }

  async function startMicRTC() {
    if (sPc) return;
    sPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    sStream.getTracks().forEach(t => sPc.addTrack(t, sStream));
    sPc.onicecandidate = e => {
      if (e.candidate) db.ref('rtc/s2t_stu_ice/' + myId).push(e.candidate.toJSON());
    };
    sPc.onconnectionstatechange = () => {
      console.log('mic', sPc?.connectionState);
      if (sPc && ['failed', 'disconnected'].includes(sPc.connectionState)) {
        sPc.close(); sPc = null;
        if (micState === 'allowed') setTimeout(startMicRTC, 3000);
      }
    };
    db.ref('rtc/t2s_stu_ice/' + myId).on('child_added', async s2 => {
      const ice = s2.val();
      if (ice) { try { await sPc?.addIceCandidate(new RTCIceCandidate(ice)); } catch (_) { } s2.ref.remove(); }
    });
    db.ref('rtc/t2s_stu_answer/' + myId).on('value', async s2 => {
      const ans = s2.val();
      if (ans && ans.sdp && sPc && sPc.signalingState === 'have-local-offer')
        await sPc.setRemoteDescription(new RTCSessionDescription(ans)).catch(() => { });
    });
    const off = await sPc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    setTimeout(() => {
      const senders = sPc.getSenders();
      senders.forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = 256000;
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(e => console.warn('فشل ضبط bitrate', e));
        }
      });
    }, 500);
    await sPc.setLocalDescription(off);
    db.ref('rtc/s2t_stu_offer/' + myId).set({ sdp: off.sdp, type: off.type, ts: Date.now() });
    console.log('mic offer sent');
  }

  window.toggleMic = async () => {
    if (!approved) return;
    if (!micOn) {
      try {
        sStream = await navigator.mediaDevices.getUserMedia({
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
        setMicState('requesting');
        db.ref('micRequests/' + myId).set({ studentId: myId, studentName: myName, ts: Date.now() });
      } catch (err) {
        alert('تعذر تشغيل الميكروفون:\n' + err.message);
      }
    } else {
      micOn = false;
      setMicState('idle');
      if (sStream) { sStream.getTracks().forEach(t => t.stop()); sStream = null; }
      if (sPc) { sPc.close(); sPc = null; }
      db.ref('micRequests/' + myId).remove();
      db.ref('micPermissions/' + myId).remove();
      db.ref('rtc/s2t_stu_offer/' + myId).remove();
      db.ref('rtc/s2t_stu_ice/' + myId).remove();
    }
  };

  /* ================================================ */
  /* [019] قائمة الشرائح الجانبية للطالب              */
  /* ================================================ */
  // شرائح الطالب: أولها سبورة المدرس، ثم شرائح الاختبار
  let stuSlides = []; // [{id, label, thumbUrl, isExam, boardImg}]
  let activeStuSlide = 'main'; // معرف الشريحة النشطة

  function createSidebarIcons() {
    // لا أيقونات جانبية - المنطق انتقل للقائمة الجانبية
    initStuSlides();
  }

  function updateSidebarIcons(tab) {
    // لا عمل هنا في النموذج الجديد
  }

  function initStuSlides() {
    // الشريحة الأولى دائماً = سبورة المدرس
    stuSlides = [{ id: 'main', label: 'المدرس', isExam: false, boardImg: null }];
    activeStuSlide = 'main';
    renderStuSlides();
  }

  function addExamSlide(boardImgData) {
    const examNum = stuSlides.filter(s => s.isExam).length + 1;
    const id = 'exam_' + Date.now();
    const label = 'اختبار ' + examNum;
    stuSlides.push({ id, label, isExam: true, boardImg: boardImgData });
    // أرسل الشريحة لـ Firebase حتى يراها المدرس في قائمة التصحيح
    if (approved && myId) {
      db.ref('studentExamSlides/' + myId + '_' + id).set({
        studentId: myId, studentName: myName,
        id, label, data: boardImgData, ts: Date.now()
      });
    }
    renderStuSlides();
    return id;
  }

  function renderStuSlides() {
    const list = document.getElementById('stuSlidesList');
    if (!list) return;
    list.innerHTML = '';
    stuSlides.forEach((sl, idx) => {
      const item = document.createElement('div');
      item.className = 'stu-slide-item' + (sl.id === activeStuSlide ? ' active' : '') + (sl.isExam ? ' exam-slide' : '');
      item.dataset.id = sl.id;
      if (sl.boardImg) {
        item.innerHTML = '<img class="stu-slide-thumb" src="' + sl.boardImg + '">'
          + '<div class="stu-slide-label">' + sl.label + '</div>'
          + (sl.isExam ? '<div class="stu-slide-badge">✏️</div>' : '');
      } else {
        var _icon = sl.isExam ? 'pen' : 'chalkboard-teacher';
        item.innerHTML = '<div class="stu-slide-empty"><i class="fas fa-' + _icon + '"></i></div>'
          + '<div class="stu-slide-label">' + sl.label + '</div>';
      }
      list.appendChild(item);
    });
  }

  function switchStuSlide(slideId) {
    if (slideId === activeStuSlide) return;
    activeStuSlide = slideId;
    const sl = stuSlides.find(s => s.id === slideId);
    if (!sl) return;
    // تحديث عنوان السبورة
    const titleEl = document.getElementById('boardTitle');
    if (titleEl) {
      titleEl.innerHTML = sl.isExam
        ? '<i class="fas fa-pen-square" style="color:#f59e0b"></i> ' + sl.label
        : '<i class="fas fa-chalkboard-teacher"></i> سبورة المدرس';
    }
    if (slideId === 'main') {
      // العودة لسبورة المدرس الحية
      if (sl.boardImg) {
        loadStudentImage(sl.boardImg, true);
      } else {
        // حمّل آخر صورة للمدرس من Firebase
        db.ref('boardImg').once('value', s => {
          const d = s.val();
          if (d && d.data) loadStudentImage(d.data, true);
        });
      }
    } else {
      // شريحة اختبار
      if (sl.boardImg) loadStudentImage(sl.boardImg, true);
    }
    // زر رفع الإجابة
    const btn = document.getElementById('submitAnsBtn');
    if (btn) btn.style.display = (sl.isExam && examMode) ? '' : 'none';
    renderStuSlides();
  }

  /* ================================================ */
  /* [020] قياس زمن الاستجابة (Ping)                  */
  /* ================================================ */
  setInterval(() => {
    const t = Date.now();
    db.ref('ping_s').set(t);
    setTimeout(() => db.ref('ping_s').once('value', () => {
      const el = document.getElementById('lat');
      if (el) el.textContent = (Date.now() - t) + 'ms';
    }), 600);
  }, 6000);
})();