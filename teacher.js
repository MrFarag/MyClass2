(function() {
    firebase.initializeApp({
        apiKey: "AIzaSyB7E4NsGQbCehVSQ3Kj97yExRZwpHzTOl8",
        databaseURL: "https://myclaive-default-rtdb.firebaseio.com"
    });
    const db = firebase.database();

    const KEYS = ['joinRequests', 'approvedStudents', 'onlineStudents', 'handRaised',
        'micRequests', 'micPermissions', 'studentImages', 'draw_t', 'draw_st',
        'boardCmd', 'boardImg', 'boardImg_stu', 'correctedImg', 'rtc',
        'teacher_draw_on_student', 'boardView', 'studentAnswers', 'studentExamSlides'];
    
    Promise.all(KEYS.map(k => db.ref(k).remove())).then(() => console.log('✅ جلسة نظيفة'));

    let CW = 1280, CH = 720;
    const mc = document.getElementById('mc');
    const mx = mc.getContext('2d');
    mc.width = CW;
    mc.height = CH;

    let mcBG = document.createElement('canvas');
    let mxBG = mcBG.getContext('2d');
    mcBG.width = CW;
    mcBG.height = CH;

    let mcDraw = document.createElement('canvas');
    let mxD = mcDraw.getContext('2d');
    mcDraw.width = CW;
    mcDraw.height = CH;

    let boardBg = '#ffffff';

    function resizeCanvases(newW, newH) {
        CW = newW;
        CH = newH;
        mc.width = CW;
        mc.height = CH;

        const newMCBG = document.createElement('canvas');
        newMCBG.width = CW;
        newMCBG.height = CH;
        const newMxBG = newMCBG.getContext('2d');
        newMxBG.fillStyle = boardBg;
        newMxBG.fillRect(0, 0, CW, CH);
        mcBG = newMCBG;
        mxBG = newMxBG;

        const newMCDraw = document.createElement('canvas');
        newMCDraw.width = CW;
        newMCDraw.height = CH;
        mcDraw = newMCDraw;
        mxD = mcDraw.getContext('2d');

        applyScale(scale);
        composite();
    }

    function composite() {
        mx.globalCompositeOperation = 'source-over';
        mx.fillStyle = boardBg;
        mx.fillRect(0, 0, CW, CH);
        mx.drawImage(mcBG, 0, 0);
        mx.drawImage(mcDraw, 0, 0);
    }

    mxBG.fillStyle = '#fff';
    mxBG.fillRect(0, 0, CW, CH);
    composite();

    /* ================================================ */
    /* [001] أبعاد السبورة = الشاشة ناقص الشرائط      */
    /* ================================================ */
    let scale = 1;
    const bWrap = document.getElementById('bWrap');

    function getBoardSize() {
        // الشاشة الكاملة
        const SW = window.screen.width;
        const SH = window.screen.height;
        // اخصم: لوح الشرائح (140) + لوح الطلاب (140) أفقياً
        // اخصم: الشريط العلوي (46) + رأس السبورة (40) + شريط الأدوات (56) عمودياً
        const W = SW - 140 - 140;
        const H = SH - 46 - 40 - 56;
        return { W: Math.max(W, 400), H: Math.max(H, 300) };
    }

    (function initBoard() {
        const { W, H } = getBoardSize();
        CW = W; CH = H;
        mc.width = CW; mc.height = CH;
        mcBG.width = CW; mcBG.height = CH;
        mcDraw.width = CW; mcDraw.height = CH;
        mxBG.fillStyle = boardBg;
        mxBG.fillRect(0, 0, CW, CH);
        composite();
    })();

    function applyScale(s) {
        s = Math.max(0.1, Math.min(5, s));
        scale = s;
        mc.style.width  = Math.round(CW * s) + 'px';
        mc.style.height = Math.round(CH * s) + 'px';
        document.getElementById('zv').textContent = Math.round(s * 100) + '%';
    }

    // fit = 100%، السكرول يعوّض ما زاد
    function fit() { applyScale(1); }

    window.Z   = function(d) { applyScale(scale + d); };
    window.fit = fit;

    applyScale(1);

    function xyOf(e) {
        const r = mc.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return {
            x: (t.clientX - r.left) * (CW / r.width),
            y: (t.clientY - r.top) * (CH / r.height)
        };
    }

    let tool = 'pen', clr = '#000', sz = 4, drawing = false, strokeId = 0, pts = [], ptimer = null;
    let students = {}, waiting = {}, images = {}, currentSpeaker = null;
    let currentBoard = 'main', lastMainImg = null, lastStuImg = {}, classMode = 'exam', hlSnap = null;
    const SHAPES = ['line', 'arrow', 'rect', 'circle', 'tri'];
    let shapeStart = null, _snap = null, _cur = null;
    let slides = [], nextSlId = 1, activeSlide = 'main', snapshots = {};
    const dcPeers = {}, dcChans = {};

    // ✅ متغيرات المعاينة والتصحيح
    let previewMode = false;
    let corrCurrentStu = null;
    let corrCurrentStuName = null;
    let teacherBoardBackup = null;
    let studentExamSlides = {};

    mc.addEventListener('mousedown', function(e) { startD(e); });
    mc.addEventListener('mousemove', function(e) { moveD(e); });
    mc.addEventListener('mouseup', function() { stopD(); });
    mc.addEventListener('mouseleave', function() { stopD(); });
    mc.addEventListener('touchstart', function(e) { startD(e); }, { passive: false });
    mc.addEventListener('touchmove', function(e) { moveD(e); }, { passive: false });
    mc.addEventListener('touchend', function() { stopD(); });

    function startD(e) {
        e.preventDefault();
        
        if (SHAPES.includes(tool)) {
            drawing = true; strokeId = Date.now();
            shapeStart = xyOf(e); _cur = null;
            _snap = mx.getImageData(0, 0, CW, CH);
            return;
        }

        drawing = true; strokeId = Date.now(); pts = [];
        const p = xyOf(e);
        if (tool === 'highlight') hlSnap = mcDraw.toDataURL();
        else if (tool === 'eraser') mxD.globalCompositeOperation = 'destination-out';
        else mxD.globalCompositeOperation = 'source-over';
        mxD.beginPath(); mxD.moveTo(p.x, p.y);
        pts.push({ x: p.x / CW, y: p.y / CH });
    }

    function moveD(e) {
        e.preventDefault();
        if (!drawing) return;
        const p = xyOf(e);
        
        if (SHAPES.includes(tool) && shapeStart) {
            _cur = p;
            if (!_snap) return;
            mx.putImageData(_snap, 0, 0);
            drawShapePreview(mx, tool, shapeStart.x, shapeStart.y, p.x, p.y, clr, sz);
            return;
        }

        if (tool === 'highlight' && hlSnap) {
            const img = new Image();
            img.onload = function() {
                mxD.globalCompositeOperation = 'source-over';
                mxD.clearRect(0, 0, CW, CH);
                mxD.drawImage(img, 0, 0);
                mxD.globalAlpha = 0.38;
                mxD.strokeStyle = clr; mxD.lineWidth = sz * 5;
                mxD.lineCap = 'round'; mxD.lineJoin = 'round';
                mxD.beginPath();
                pts.forEach(function(pt, i) {
                    if (i) mxD.lineTo(pt.x * CW, pt.y * CH);
                    else mxD.moveTo(pt.x * CW, pt.y * CH);
                });
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
        if (!drawing) return;
        drawing = false;
        
        if (SHAPES.includes(tool) && shapeStart) {
            const ep = _cur || shapeStart;
            const shapeData = {
                shape: tool,
                start: { x: shapeStart.x / CW, y: shapeStart.y / CH },
                end: { x: ep.x / CW, y: ep.y / CH },
                c: clr, s: sz, sid: strokeId, ts: Date.now()
            };
            if (_snap) { mx.putImageData(_snap, 0, 0); } _snap = null;
            drawShapePreview(mxD, tool, shapeStart.x, shapeStart.y, ep.x, ep.y, clr, sz);
            composite();
            db.ref('draw_t').push(shapeData);
            sendToStudents(shapeData);
            lastMainImg = mc.toDataURL('image/jpeg', 0.85);
            snapshots[activeSlide || 'main'] = lastMainImg;
            updateThumb();
            db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
            shapeStart = null; _cur = null;
            return;
        }

        if (ptimer) { clearTimeout(ptimer); ptimer = null; }
        flush();
        mxD.globalCompositeOperation = 'source-over';
        composite();
        hlSnap = null;
        
        // ✅ لا نحفظ أثناء المعاينة
        if (currentBoard === 'main' && !previewMode) {
            lastMainImg = mc.toDataURL('image/jpeg', 0.85);
            snapshots[activeSlide || 'main'] = lastMainImg;
            updateThumb();
            db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
        }
    }

    function drawShapePreview(ctx, type, x1, y1, x2, y2, color, lw) {
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
        if (type === 'line') { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
        else if (type === 'arrow') {
            ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            const a = Math.atan2(y2 - y1, x2 - x1); const h = 16 + lw;
            ctx.beginPath(); ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4));
            ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4));
            ctx.closePath(); ctx.fill();
        }
        else if (type === 'rect') { ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1)); }
        else if (type === 'circle') {
            ctx.ellipse((x1+x2)/2, (y1+y2)/2, Math.abs(x2-x1)/2, Math.abs(y2-y1)/2, 0, 0, Math.PI*2); ctx.stroke();
        }
        else if (type === 'tri') {
            ctx.moveTo((x1+x2)/2, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2);
            ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
    }

    function sendToStudents(data) {
        Object.entries(dcChans).forEach(function(entry) {
            const dc = entry[1];
            if (dc.readyState === 'open') { try { dc.send(JSON.stringify(data)); } catch(e) {} }
        });
    }

    function flush() {
        ptimer = null;
        if (!pts.length) return;
        const isEra = (tool === 'eraser');
        const isHL = (tool === 'highlight');
        const d = {
            pts: pts.slice(), c: isEra ? null : clr,
            s: isEra ? sz * 5 : (isHL ? sz * 5 : sz),
            era: isEra, hl: isHL, sid: strokeId, ts: Date.now()
        };
        db.ref('draw_t').push(d);
        sendToStudents(d);
        if (!isHL) pts = [];
    }

    window.setTool = function(t) {
        tool = t;
        mc.style.cursor = (t === 'select') ? 'default' : 'crosshair';
        const ids = ['tiPen', 'tiEra', 'tiHL', 'tiSel', 'tiLine', 'tiArrow', 'tiRect', 'tiCircle', 'tiTri'];
        ids.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('on');
        });
        const map = { pen: 'tiPen', eraser: 'tiEra', highlight: 'tiHL', select: 'tiSel',
            line: 'tiLine', arrow: 'tiArrow', rect: 'tiRect', circle: 'tiCircle', tri: 'tiTri' };
        if (map[t]) { const el = document.getElementById(map[t]); if (el) el.classList.add('on'); }
    };

    window.setClr = function(c, el) {
        clr = c;
        document.querySelectorAll('.dot').forEach(function(d) { d.classList.remove('on'); });
        el.classList.add('on');
        // [002] عند اختيار لون: تفعيل القلم تلقائياً
        setTool('pen');
    };

    window.adjSz = function(d) {
        sz = Math.max(1, Math.min(40, sz + d));
        document.getElementById('szV').textContent = sz;
    };

    window.clearB = function() {
        mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
        mxD.clearRect(0, 0, CW, CH); composite();
        db.ref('boardCmd').push({ type: 'clear', ts: Date.now() });
        lastMainImg = null; setTimeout(updateThumb, 50);
    };

    window.saveB = function() {
        const a = document.createElement('a');
        a.download = 'board.png'; a.href = mc.toDataURL(); a.click();
    };

    window.goFS = function() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
    };

    window.setBoardBg = function(color, el) {
        boardBg = color;
        mxBG.fillStyle = color; mxBG.fillRect(0, 0, CW, CH); composite();
        document.querySelectorAll('.bg-dot').forEach(function(d) { d.classList.remove('on'); });
        el.classList.add('on');
        setTimeout(function() {
            lastMainImg = mc.toDataURL('image/jpeg', 0.85);
            db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
        }, 50);
    };

    // ════ وضع السبورة: شرح / اختبار ════
    var boardMode = 'teach';
    var examCount = 0;

    function setBoardMode(mode) {
        boardMode = mode;
        var btn   = document.getElementById('bh-toggle');
        var icon  = document.getElementById('bh-icon');
        var lbl   = document.getElementById('bh-label');
        if (btn) {
            btn.classList.toggle('bh-mode-teach', mode === 'teach');
            btn.classList.toggle('bh-mode-exam',  mode === 'exam');
            btn.dataset.tip = mode === 'teach'
                ? 'الوضع: شرح — انقر للتحويل إلى اختبار'
                : 'الوضع: اختبار — انقر للعودة إلى شرح';
        }
        if (icon)  icon.className   = mode === 'teach' ? 'fas fa-chalkboard-teacher' : 'fas fa-pen-square';
        if (lbl)   lbl.textContent  = mode === 'teach' ? 'شرح' : 'اختبار';
        updateSendTip();
    }

    function updateSendTip() {
        var sendBtn = document.getElementById('modeSend');
        if (!sendBtn) return;
        if (previewMode && corrCurrentStu) {
            sendBtn.dataset.tip = 'رفع التصحيح للطالب ' + (corrCurrentStuName || '');
        } else {
            sendBtn.dataset.tip = 'رفع للطلاب';
        }
    }

    window.toggleBoardMode = function() {
        if (boardMode === 'teach') {
            // أضف شريحة اختبار جديدة في لوحة الشرائح
            examCount++;
            var examLabel = 'اختبار ' + examCount;
            var newId = addSlide(null, examLabel);
            window.switchToSlide(newId);
            setBoardMode('exam');
            // امسح السبورة وأرسلها للطلاب
            setTimeout(function() {
                boardBg = '#ffffff';
                mxBG.fillStyle = '#ffffff'; mxBG.fillRect(0, 0, CW, CH);
                mxD.clearRect(0, 0, CW, CH); composite();
                var url = mc.toDataURL('image/jpeg', 0.92);
                lastMainImg = url; snapshots[newId] = url;
                db.ref('boardImg').set({ data: url, ts: Date.now() });
                db.ref('boardCmd').push({ type: 'class_mode', mode: 'exam', ts: Date.now() });
                setTimeout(function() {
                    db.ref('boardCmd').push({ type: 'exam_question', data: url, ts: Date.now() });
                }, 120);
                updateThumb();
                toast('📋 شريحة اختبار جديدة — أُرسلت للطلاب', 'g');
            }, 200);
        } else {
            setBoardMode('teach');
            showTeachBoard();
        }
    };

    window.activateHeaderBtn = function() {};

    window.showTeachBoard = function() {
        activeSlide  = 'main';
        currentBoard = 'main';
        var img = snapshots['main'] || lastMainImg || null;
        loadCanvas(img, true, function() { renderSlides(); setTimeout(fit, 50); }, false);
        if (img) db.ref('boardImg').set({ data: img, ts: Date.now() });
    };

    window.uploadImg = function(input, mode) {
        if (!input.files[0]) return;
        const r = new FileReader();
        r.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                let newW = img.width, newH = img.height;
                const MAX = 2000;
                if (newW > MAX || newH > MAX) {
                    const ratio = Math.min(MAX / newW, MAX / newH);
                    newW = Math.floor(newW * ratio);
                    newH = Math.floor(newH * ratio);
                }

                if (mode === 'teach') {
                    // ✅ شرح: احفظ الشريحة الحالية أولاً ثم ارفع الصورة عليها
                    activateHeaderBtn('bh-teach');
                    saveSnap();
                    resizeCanvases(newW, newH);
                    mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
                    mxBG.drawImage(img, 0, 0, CW, CH);
                    mxD.clearRect(0, 0, CW, CH); composite();
                    const url = mc.toDataURL('image/jpeg', 0.92);
                    // حفظ في snapshot الشريحة الحالية
                    snapshots[activeSlide || 'main'] = url;
                    lastMainImg = url;
                    db.ref('boardImg').set({ data: url, ts: Date.now() });
                    updateThumb(); setTimeout(fit, 50);
                    toast('🖼️ تم رفع صورة الشرح على الشريحة الحالية', 'g');
                } else {
                    // اختبار أو رفع عادي
                    resizeCanvases(newW, newH);
                    mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
                    mxBG.drawImage(img, 0, 0, CW, CH);
                    mxD.clearRect(0, 0, CW, CH); composite();
                    const url = mc.toDataURL('image/jpeg', 0.92);
                    lastMainImg = url; snapshots[activeSlide || 'main'] = url;
                    db.ref('boardImg').set({ data: url, ts: Date.now() });
                    updateThumb(); setTimeout(fit, 50);

                    if (mode === 'exam') {
                        db.ref('boardCmd').push({ type: 'class_mode', mode: 'exam', ts: Date.now() });
                        setTimeout(function() {
                            db.ref('boardCmd').push({ type: 'exam_question', data: url, ts: Date.now() });
                        }, 100);
                        toast('📋 تم إرسال سبورة الاختبار للطلاب', 'g');
                    }
                }
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(input.files[0]); input.value = '';
    };

    window.openExamBoard = function() { window.toggleBoardMode(); };

    // ✅ رفع ملف (صورة / PDF / Word) على السبورة - يُستدعى من مودال الرفع

    function processPDF(file, statusEl) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const typedArr = new Uint8Array(e.target.result);
            pdfjsLib.getDocument(typedArr).promise.then(function(pdf) {
                if (statusEl) statusEl.textContent = '📄 PDF - ' + pdf.numPages + ' صفحة - جاري تحميل الصفحة الأولى...';
                pdf.getPage(1).then(function(page) {
                    const viewport = page.getViewport({ scale: 1.8 });
                    const tmpCanvas = document.createElement('canvas');
                    const tmpCtx    = tmpCanvas.getContext('2d');
                    tmpCanvas.width  = viewport.width;
                    tmpCanvas.height = viewport.height;
                    page.render({ canvasContext: tmpCtx, viewport: viewport }).promise.then(function() {
                        const url = tmpCanvas.toDataURL('image/jpeg', 0.92);
                        const img = new Image();
                        img.onload = function() {
                            let nW = img.width, nH = img.height;
                            const MAX = 2000;
                            if (nW > MAX || nH > MAX) {
                                const ratio = Math.min(MAX/nW, MAX/nH);
                                nW = Math.floor(nW*ratio); nH = Math.floor(nH*ratio);
                            }
                            resizeCanvases(nW, nH);
                            mxBG.fillStyle = '#fff'; mxBG.fillRect(0,0,CW,CH);
                            mxBG.drawImage(img, 0,0, CW, CH);
                            mxD.clearRect(0,0,CW,CH); composite();
                            const finalUrl = mc.toDataURL('image/jpeg', 0.92);
                            lastMainImg = finalUrl; snapshots[activeSlide||'main'] = finalUrl;
                            db.ref('boardImg').set({ data: finalUrl, ts: Date.now() });
                            updateThumb(); setTimeout(fit, 50);
                            closeMediaModal();
                            toast('✅ تم عرض صفحة PDF الأولى على السبورة', 'g');
                        };
                        img.src = url;
                    });
                });
            }).catch(function(err) {
                if (statusEl) { statusEl.className='media-status err'; statusEl.textContent='❌ خطأ في قراءة PDF: '+err.message; }
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function processWord(file, statusEl) {
        const reader = new FileReader();
        reader.onload = function(e) {
            mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(function(result) {
                const html = result.value;
                // نحول HTML إلى canvas عبر iframe مخفي
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:900px;height:1200px;border:none;background:#fff';
                document.body.appendChild(iframe);
                const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                iDoc.open();
                iDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Cairo,Arial,sans-serif;padding:32px;font-size:14px;line-height:1.7;background:#fff;color:#222;direction:rtl}</style></head><body>' + html + '</body></html>');
                iDoc.close();
                setTimeout(function() {
                    // محاولة html2canvas
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    s.onload = function() {
                        html2canvas(iDoc.body, { backgroundColor:'#ffffff', scale:1.5, width:860, height:1100 }).then(function(canvas) {
                            document.body.removeChild(iframe);
                            const url = canvas.toDataURL('image/jpeg', 0.92);
                            const img = new Image();
                            img.onload = function() {
                                let nW = img.width, nH = img.height;
                                const MAX = 2000;
                                if (nW > MAX || nH > MAX) {
                                    const ratio = Math.min(MAX/nW, MAX/nH);
                                    nW = Math.floor(nW*ratio); nH = Math.floor(nH*ratio);
                                }
                                resizeCanvases(nW, nH);
                                mxBG.fillStyle='#fff'; mxBG.fillRect(0,0,CW,CH);
                                mxBG.drawImage(img,0,0,CW,CH);
                                mxD.clearRect(0,0,CW,CH); composite();
                                const finalUrl = mc.toDataURL('image/jpeg',0.92);
                                lastMainImg=finalUrl; snapshots[activeSlide||'main']=finalUrl;
                                db.ref('boardImg').set({data:finalUrl,ts:Date.now()});
                                updateThumb(); setTimeout(fit,50);
                                closeMediaModal();
                                toast('✅ تم عرض ملف Word على السبورة','g');
                            };
                            img.src = url;
                        }).catch(function() { document.body.removeChild(iframe); renderWordAsText(html, statusEl); });
                    };
                    s.onerror = function() { document.body.removeChild(iframe); renderWordAsText(html, statusEl); };
                    document.head.appendChild(s);
                }, 600);
            }).catch(function(err) {
                if (statusEl) { statusEl.className='media-status err'; statusEl.textContent='❌ خطأ في قراءة Word: '+err.message; }
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function renderWordAsText(html, statusEl) {
        // Fallback: رسم النص المستخرج مباشرة على canvas
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const text = tmp.innerText || tmp.textContent || '';
        mxBG.fillStyle = '#ffffff'; mxBG.fillRect(0,0,CW,CH);
        mxD.clearRect(0,0,CW,CH);
        mxBG.fillStyle = '#111'; mxBG.font = '16px Cairo,Arial';
        mxBG.textAlign = 'right'; mxBG.direction = 'rtl';
        const lines = text.split('\n');
        let y = 36;
        lines.forEach(function(line) {
            if (line.trim()) { mxBG.fillText(line.trim(), CW - 20, y); y += 26; }
            if (y > CH - 20) return;
        });
        composite();
        const finalUrl = mc.toDataURL('image/jpeg',0.92);
        lastMainImg=finalUrl; snapshots[activeSlide||'main']=finalUrl;
        db.ref('boardImg').set({data:finalUrl,ts:Date.now()});
        updateThumb(); setTimeout(fit,50);
        closeMediaModal();
        toast('✅ تم عرض نص ملف Word على السبورة','g');
    }

    window.openMediaModal  = function() {
        document.getElementById('mediaModal').classList.add('open');
    };
    window.closeMediaModal = function() {
        document.getElementById('mediaModal').classList.remove('open');
        var s = document.getElementById('mediaStatus');
        if (s) { s.style.display = 'none'; s.className = 'media-status'; }
    };

    // استقبال الملف من مودال الرفع
    window.uploadMediaFile = function(input, type) {
        if (!input.files[0]) return;
        var file = input.files[0];
        var statusEl = document.getElementById('mediaStatus');
        if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'media-status'; statusEl.textContent = '⏳ جاري المعالجة...'; }

        if (type === 'image') {
            var r = new FileReader();
            r.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var nW = img.width, nH = img.height, MAX = 2000;
                    if (nW > MAX || nH > MAX) { var ratio = Math.min(MAX/nW,MAX/nH); nW=Math.floor(nW*ratio); nH=Math.floor(nH*ratio); }
                    resizeCanvases(nW, nH);
                    mxBG.fillStyle = boardBg; mxBG.fillRect(0,0,CW,CH);
                    mxBG.drawImage(img,0,0,CW,CH);
                    mxD.clearRect(0,0,CW,CH); composite();
                    var url = mc.toDataURL('image/jpeg',0.92);
                    lastMainImg=url; snapshots[activeSlide||'main']=url;
                    db.ref('boardImg').set({data:url,ts:Date.now()});
                    updateThumb(); setTimeout(fit,50);
                    closeMediaModal();
                    toast('✅ تم رفع الصورة على السبورة','g');
                };
                img.src = e.target.result;
            };
            r.readAsDataURL(file);

        } else if (type === 'pdf') {
            if (!window.pdfjsLib) {
                var s2 = document.createElement('script');
                s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                s2.onload = function() {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    processPDF(file, statusEl);
                };
                document.head.appendChild(s2);
            } else { processPDF(file, statusEl); }

        } else if (type === 'word') {
            if (!window.mammoth) {
                var s3 = document.createElement('script');
                s3.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
                s3.onload = function() { processWord(file, statusEl); };
                document.head.appendChild(s3);
            } else { processWord(file, statusEl); }
        }
        input.value = '';
    };

    window.sendSlideToStudents = function() {
        var btn = document.getElementById('modeSend');
        var url = mc.toDataURL('image/jpeg', 0.92);

        // ✅ في وضع المعاينة: أرسل التصحيح للطالب المعاين فقط
        if (previewMode && corrCurrentStu) {
            window.sendCorr();
            return;
        }

        // وضع عادي: أرسل لكل الطلاب
        db.ref('boardCmd').push({ type: 'class_mode', mode: 'exam', ts: Date.now() });
        setTimeout(function() {
            db.ref('boardCmd').push({ type: 'exam_question', data: url, ts: Date.now() });
        }, 100);
        if (btn) {
            btn.classList.add('sent');
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(function() {
                btn.classList.remove('sent');
                btn.innerHTML = '<i class="fas fa-upload"></i>';
            }, 2500);
        }
    };

    function saveSnap() { snapshots[activeSlide || 'main'] = mc.toDataURL('image/jpeg', 0.5); }

    window.switchToSlide = function(id) {
        saveSnap(); activeSlide = id; currentBoard = 'main';
        function done() {
            lastMainImg = mc.toDataURL('image/jpeg', 0.85);
            db.ref('boardImg').set({ data: lastMainImg, ts: Date.now() });
            updateThumb(); setTimeout(fit, 50);
        }
        if (id === 'main') {
            document.getElementById('bTitle') && (document.getElementById('bTitle').textContent = 'السبورة الرئيسية');
            if (CW !== 1280 || CH !== 720) { resizeCanvases(1280, 720); scale = 1; applyScale(1); }
            loadCanvas(snapshots['main'] || lastMainImg || null, true, done, false);
        } else {
            const sl = slides.find(function(s) { return s.id === id; });
            document.getElementById('bTitle') && (document.getElementById('bTitle').textContent = sl ? sl.label : 'شريحة');
            const url = snapshots[id] || (sl ? sl.dataUrl : null);
            if (!url) {
                if (CW !== 1280 || CH !== 720) { resizeCanvases(1280, 720); scale = 1; applyScale(1); }
                mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
                mxD.clearRect(0, 0, CW, CH); composite(); done();
            } else {
                const img = new Image();
                img.onload = function() {
                    let newW = img.width, newH = img.height;
                    const MAX = 2000;
                    if (newW > MAX || newH > MAX) {
                        const ratio = Math.min(MAX / newW, MAX / newH);
                        newW = Math.floor(newW * ratio);
                        newH = Math.floor(newH * ratio);
                    }
                    resizeCanvases(newW, newH); scale = 1; applyScale(1);
                    mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
                    mxBG.drawImage(img, 0, 0, CW, CH);
                    mxD.clearRect(0, 0, CW, CH); composite(); done();
                };
                img.src = url;
            }
        }
        renderSlides();
    };

    function addSlide(url, label) {
        const id = 'sl_' + (nextSlId++);
        slides.push({ id: id, dataUrl: url || null, label: label || ('شريحة ' + (slides.length + 1)) });
        return id;
    }

    window.addAndSwitch = function() { window.switchToSlide(addSlide(null, 'شريحة ' + (slides.length + 1))); };

    window.deleteSlide = function(id) {
        slides = slides.filter(function(s) { return s.id !== id; });
        delete snapshots[id];
        if (activeSlide === id) window.switchToSlide('main'); else renderSlides();
    };

    function renderSlides() {
        const list = document.getElementById('slidesList');
        if (!list) return;
        const ms = snapshots['main'] || lastMainImg || '';
        let h = '<div class="slide-item' + (activeSlide === 'main' || !activeSlide ? ' active' : '') + '" onclick="switchToSlide(\'main\')">';
        h += ms ? '<img class="slide-thumb" src="' + ms + '">' : '<div class="slide-empty">رئيسية</div>';
        h += '<span class="slide-num">1</span></div>';
        slides.forEach(function(sl, i) {
            const url = snapshots[sl.id] || sl.dataUrl || '';
            h += '<div class="slide-item' + (activeSlide === sl.id ? ' active' : '') + '" onclick="switchToSlide(\'' + sl.id + '\')">';
            h += url ? '<img class="slide-thumb" src="' + url + '">' : '<div class="slide-empty">' + sl.label + '</div>';
            h += '<span class="slide-num">' + (i + 2) + '</span>';
            h += '<button class="slide-del" onclick="event.stopPropagation();deleteSlide(\'' + sl.id + '\')"><i class="fas fa-times"></i></button></div>';
        });
        h += '<div class="slide-add" onclick="addAndSwitch()"><i class="fas fa-plus"></i><span>جديدة</span></div>';
        list.innerHTML = h;
    }

    function updateThumb() {
        if (previewMode) return;
        snapshots[activeSlide || 'main'] = mc.toDataURL('image/jpeg', 0.5);
        renderSlides();
    }

    window.uploadSlides = function(input) {
        const files = Array.from(input.files);
        if (!files.length) return;
        const imageFiles = files.filter(function(file) { return file.type.startsWith('image/'); });
        if (imageFiles.length === 0) { alert('الرجاء اختيار صور فقط'); input.value = ''; return; }
        let processedCount = 0;
        const total = imageFiles.length;
        imageFiles.forEach(function(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const id = 'sl_' + (nextSlId++);
                const label = file.name.replace(/\.[^.]+$/, '').slice(0, 12);
                slides.push({ id: id, dataUrl: e.target.result, label: label });
                snapshots[id] = e.target.result;
                processedCount++;
                if (processedCount === total) { renderSlides(); input.value = ''; }
            };
            reader.readAsDataURL(file);
        });
    };

    setTimeout(renderSlides, 300);

    function loadCanvas(url, clearDraw, cb, resizeToImage) {
        if (clearDraw) mxD.clearRect(0, 0, CW, CH);
        if (!url) { composite(); if (cb) cb(); setTimeout(fit, 50); return; }
        const img = new Image();
        img.onload = function() {
            if (resizeToImage) {
                let newW = img.width, newH = img.height;
                const MAX = 2000;
                if (newW > MAX || newH > MAX) {
                    const ratio = Math.min(MAX / newW, MAX / newH);
                    newW = Math.floor(newW * ratio);
                    newH = Math.floor(newH * ratio);
                }
                resizeCanvases(newW, newH);
            }
            mxBG.fillStyle = boardBg; mxBG.fillRect(0, 0, CW, CH);
            mxBG.drawImage(img, 0, 0, CW, CH); composite();
            if (cb) cb(); setTimeout(fit, 50);
        };
        img.onerror = function() { composite(); if (cb) cb(); setTimeout(fit, 50); };
        img.src = url;
    }

    window.mainBoard = function() {
        currentBoard = 'main';
        document.getElementById('bTitle') && (document.getElementById('bTitle').textContent = 'السبورة الرئيسية');
        loadCanvas(lastMainImg, true);
        db.ref('boardCmd').push({ type: 'teacher_returned_main', ts: Date.now() });
    };

    function render() {
        let h = '';
        Object.values(waiting).forEach(function(s) {
            h += '<div class="si si-wait"><div class="scard-name">' + s.name + '</div>';
            h += '<div class="sact"><i class="fas fa-check-circle" style="color:#4CAF50" onclick="approveS(\'' + s.id + '\')"></i>';
            h += '<i class="fas fa-times-circle" style="color:#b71c1c" onclick="rejectS(\'' + s.id + '\')"></i></div></div>';
        });
        Object.values(students).forEach(function(s) {
            if (!s.online) return;
            h += '<div class="si"><div class="scard-name" title="' + s.name + '">' + s.name + '</div>';
            h += '<div class="sact">';
            h += '<i class="fas fa-eye" style="color:#00aaff" onclick="previewStudent(\'' + s.id + '\',\'' + s.name + '\')"></i>';
            if (typeof micPending !== 'undefined' && micPending[s.id])
                h += '<i class="fas fa-microphone" style="color:#f59e0b;cursor:pointer;animation:blink 0.7s infinite" title="سماح مايك" onclick="allowMic(\'' + s.id + '\')"></i>';
            if (lastStuImg[s.id]) h += '<i class="fas fa-share-alt" style="color:#4CAF50" onclick="shareBoard(\'' + s.id + '\',\'' + s.name + '\')"></i>';
            h += '<i class="fas fa-sign-out-alt" style="color:#b71c1c" onclick="kickS(\'' + s.id + '\')"></i></div></div>';
        });
        document.getElementById('sList').innerHTML = h || '<div style="color:#aaa;text-align:center;padding:12px;font-size:11px">لا يوجد طلاب</div>';
        const n = Object.values(students).filter(function(s) { return s.online; }).length;
        ['cnt', 'cntP'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.textContent = n;
        });
    }

    db.ref('joinRequests').on('child_added', function(snap) {
        const s = snap.val(); if (s) { waiting[s.id] = s; render(); }
    });
    db.ref('joinRequests').on('child_removed', function(snap) {
        const s = snap.val(); if (s) { delete waiting[s.id]; render(); }
    });
    db.ref('approvedStudents').on('value', function(snap) { students = snap.val() || {}; render(); });
    db.ref('onlineStudents').on('value', function(snap) {
        const o = snap.val() || {};
        Object.keys(students).forEach(function(id) { students[id].online = !!o[id]; });
        render();
    });
    // ══ طلبات المايك + استقبال صوت الطلاب ══
    var micPending = {};
    var stuAudioPeers = {};

    db.ref('micRequests').on('child_added', function(snap) {
        var r = snap.val();
        if (r && r.studentId) { micPending[r.studentId] = r; render(); }
    });
    db.ref('micRequests').on('child_removed', function(snap) {
        var r = snap.val();
        if (r && r.studentId) { delete micPending[r.studentId]; render(); }
    });

    window.allowMic = function(sid) {
        db.ref('micPermissions/' + sid).set({ allowed: true, ts: Date.now() });
        delete micPending[sid];
        render();
        receiveStuMic(sid);
    };
    window.muteStu = function(sid) {
        db.ref('micPermissions/' + sid).remove();
        if (stuAudioPeers[sid]) { try { stuAudioPeers[sid].close(); } catch(_){} delete stuAudioPeers[sid]; }
        render();
    };

    function receiveStuMic(sid) {
        db.ref('rtc/s2t_stu_offer/' + sid).on('value', async function(snap) {
            var off = snap.val();
            if (!off || !off.sdp) return;
            if (stuAudioPeers[sid]) { try { stuAudioPeers[sid].close(); } catch(_){} }
            var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            stuAudioPeers[sid] = pc;
            pc.ontrack = function(e) {
                var au = document.getElementById('stuAudio_' + sid);
                if (!au) { au = document.createElement('audio'); au.id = 'stuAudio_' + sid; au.autoplay = true; document.body.appendChild(au); }
                au.srcObject = e.streams[0];
                au.play().catch(function(){});
            };
            pc.onicecandidate = function(e) {
                if (e.candidate) db.ref('rtc/t2s_stu_ice/' + sid).push(e.candidate.toJSON());
            };
            db.ref('rtc/s2t_stu_ice/' + sid).on('child_added', async function(s2) {
                var ice = s2.val();
                if (ice) { try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch(_){} s2.ref.remove(); }
            });
            await pc.setRemoteDescription(new RTCSessionDescription(off));
            var ans = await pc.createAnswer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(ans);
            db.ref('rtc/t2s_stu_answer/' + sid).set({ sdp: ans.sdp, type: ans.type, ts: Date.now() });
        });
    }


    window.approveS = function(id) {
        const s = waiting[id]; if (!s) return;
        delete waiting[id];
        db.ref('approvedStudents/' + id).set({ id: id, name: s.name });
        db.ref('joinRequests/' + id).remove();
        setTimeout(function() { setupDC(id); }, 1000);
        render();
    };

    window.rejectS = function(id) { delete waiting[id]; db.ref('joinRequests/' + id).remove(); render(); };

    window.kickS = function(id) {
        if (currentSpeaker === id) { currentSpeaker = null; db.ref('micPermissions/' + id).remove(); }
        delete students[id];
        db.ref('approvedStudents/' + id).remove();
        db.ref('onlineStudents/' + id).remove();
        render();
    };

    const DC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    async function setupDC(sid) {
        if (dcPeers[sid]) return;
        const pc = new RTCPeerConnection(DC_CFG);
        dcPeers[sid] = pc;
        const dc = pc.createDataChannel('td', { ordered: false, maxRetransmits: 0 });
        dcChans[sid] = dc;
        pc.onicecandidate = function(e) {
            if (e.candidate) db.ref('rtc/teacherDraw/' + sid + '/candidate').push(e.candidate.toJSON());
        };
        const o = await pc.createOffer();
        await pc.setLocalDescription(o);
        db.ref('rtc/teacherDraw/' + sid + '/offer').set({ sdp: o.sdp, type: o.type });
        db.ref('rtc/teacherDraw/' + sid + '/answer').on('value', async function(s) {
            const a = s.val();
            if (a && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(function() {});
            }
        });
        db.ref('rtc/teacherDraw/' + sid + '/candidate').on('child_added', async function(s) {
            const c = s.val();
            if (c) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(_) {} s.ref.remove(); }
        });
    }

    // ✅ استقبال شرائح الطلاب - كل طالب له مسار منفصل
    db.ref('studentExamSlides').on('child_added', function(snap) {
        const studentId = snap.key;
        const slidesData = snap.val();
        if (slidesData && typeof slidesData === 'object') {
            Object.keys(slidesData).forEach(function(slideId) {
                const slide = slidesData[slideId];
                if (!studentExamSlides[studentId]) studentExamSlides[studentId] = [];
                if (!studentExamSlides[studentId].find(function(s) { return s.id === slide.id; })) {
                    studentExamSlides[studentId].push({ id: slide.id, label: slide.label, data: slide.data });
                }
            });
        }
        render();
    });

    db.ref('studentAnswers').on('value', function(snap) {
        const answers = snap.val() || {};
        Object.keys(answers).forEach(function(sid) {
            if (students[sid]) students[sid].hasAnswer = true;
        });
        render();
    });

    // ✅ دالة المعاينة - تظهر في السبورة نفسها مع قائمة الشرائح
    window.previewStudent = function(sid, name) {
        previewMode = true;
        corrCurrentStu = sid;
        corrCurrentStuName = name;
        
        // ✅ حفظ حالة السبورة قبل المعاينة
        teacherBoardBackup = {
            img: lastMainImg, slide: activeSlide, board: currentBoard,
            CW: CW, CH: CH, scale: scale, boardBg: boardBg,
            snapMain: snapshots[activeSlide || 'main'] || lastMainImg
        };
        
        // ✅ إظهار قسم المعاينة في الشريط العلوي
        const previewSection = document.getElementById('previewSection');
        const previewTitle = document.getElementById('previewTitle');
        const slideSelect = document.getElementById('studentSlideSelect');
        const sendCorrBtn = document.getElementById('sendCorrBtn');
        
        if (previewSection) { previewSection.classList.add('active'); previewSection.style.display = 'flex'; }
        if (previewTitle) { previewTitle.textContent = 'معاينة: ' + name; }
        if (sendCorrBtn) { sendCorrBtn.style.display = 'flex'; }
        
        // ✅ ملء القائمة بشرائح الطالب
        if (slideSelect) {
            const slides = studentExamSlides[sid] || [];
            let opts = '<option value="__current__">📋 السبورة الحالية</option>';
            slides.forEach(function(s) { opts += '<option value="' + s.id + '">' + s.label + '</option>'; });
            slideSelect.innerHTML = opts;
            slideSelect.value = '__current__';
        }
        
        document.getElementById('bTitle') && (document.getElementById('bTitle') && (document.getElementById('bTitle').textContent = 'معاينة: ' + name));
        updateSendTip();
        loadPreviewImage(sid);
    };

    function loadPreviewImage(sid) {
        const imgData = lastStuImg[sid];
        if (imgData) { showPreviewImage(imgData); }
        else {
            db.ref('boardImg_stu/' + sid).once('value', function(snap) {
                const d = snap.val();
                showPreviewImage(d ? d.data : null);
            });
        }
    }

    function showPreviewImage(imgData) {
        if (imgData) {
            loadCanvas(imgData, true, function() { fit(); }, false);
        }
    }

    window.onStudentSlideSelect = function(sel) {
        const val = sel.value;
        const slides = studentExamSlides[corrCurrentStu] || [];
        if (val === '__current__') { loadPreviewImage(corrCurrentStu); return; }
        const sl = slides.find(function(s) { return s.id === val; });
        if (sl && sl.data) { showPreviewImage(sl.data); }
    };

    // ✅ إغلاق المعاينة - يستعيد سبورة المدرس الأصلية بدون أي أثر لشرائح الطالب
    window.closePreview = function() {
        previewMode = false;
        corrCurrentStu = null;
        corrCurrentStuName = null;

        var previewSection = document.getElementById('previewSection');
        var sendCorrBtn    = document.getElementById('sendCorrBtn');
        if (previewSection) { previewSection.classList.remove('active'); previewSection.style.display = 'none'; }
        if (sendCorrBtn)    { sendCorrBtn.style.display = 'none'; }

        if (teacherBoardBackup) {
            currentBoard = teacherBoardBackup.board || 'main';
            activeSlide  = teacherBoardBackup.slide  || 'main';
            boardBg      = teacherBoardBackup.boardBg || '#ffffff';
            if (teacherBoardBackup.CW !== CW || teacherBoardBackup.CH !== CH)
                resizeCanvases(teacherBoardBackup.CW, teacherBoardBackup.CH);
            // ✅ استعد snapshot الشريحة الأصلية فقط - لا تضع snapshot الطالب هنا
            if (teacherBoardBackup.snapMain)
                snapshots[activeSlide || 'main'] = teacherBoardBackup.snapMain;
            lastMainImg = teacherBoardBackup.img;
            var _img = teacherBoardBackup.img;
            teacherBoardBackup = null;
            if (_img) loadCanvas(_img, true, function() { renderSlides(); setTimeout(fit, 50); }, false);
            else {
                mxBG.fillStyle = boardBg; mxBG.fillRect(0,0,CW,CH);
                mxD.clearRect(0,0,CW,CH); composite();
                renderSlides();
            }
        } else {
            renderSlides();
        }
        updateSendTip();
    };

    /* ================================================ */
    /* [003] إرسال التصحيح ثم الرجوع للشريحة الحالية  */
    /* ================================================ */
    window.sendCorr = function() {
        if (!corrCurrentStu) return;
        var tStu  = corrCurrentStu;
        var tName = corrCurrentStuName || '';
        var data  = mc.toDataURL('image/jpeg', 0.88);
        var sel   = document.getElementById('studentSlideSelect');

        // ✅ استخدم نفس ID الشريحة الأصلية دائماً — حتى تُحدَّث في مكانها
        var cId  = (sel && sel.value && sel.value !== '__current__')
                    ? sel.value
                    : ('corr_' + tStu + '_base');
        var rawLabel = (sel && sel.selectedIndex >= 0)
                    ? sel.options[sel.selectedIndex].text.replace(/^[📋✅✏️]\s*/,'').trim()
                    : 'السبورة';
        // أبقِ الاسم كما هو بدون إضافة ✅ جديدة
        var cLbl = rawLabel.startsWith('✅') ? rawLabel : ('✅ ' + rawLabel);

        db.ref('correctedImg/' + tStu).set({
            data: data, slideId: cId, slideLabel: cLbl,
            id: cId, label: cLbl, ts: Date.now()
        });
        db.ref('studentExamSlides/' + tStu + '/' + cId).set({
            studentId: tStu, id: cId, label: cLbl, data: data, ts: Date.now()
        });

        // حدّث الذاكرة المحلية
        if (!studentExamSlides[tStu]) studentExamSlides[tStu] = [];
        var ex = studentExamSlides[tStu].find(function(s){ return s.id === cId; });
        if (ex) { ex.data = data; ex.label = cLbl; }
        else     { studentExamSlides[tStu].push({ id: cId, label: cLbl, data: data }); }

        closePreview();
        toast('✅ تم رفع التصحيح لـ ' + tName, 'g');
    };

    function toast(msg, type) {
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:24px;font-size:13px;font-weight:700;z-index:8000;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:none;white-space:nowrap;background:' + (type==='g'?'#4CAF50':'#ffaa00') + ';color:' + (type==='g'?'#fff':'#000');
        document.body.appendChild(el);
        setTimeout(function() {
            el.style.transition = 'opacity .5s'; el.style.opacity = '0';
            setTimeout(function() { el.remove(); }, 500);
        }, 4000);
    }

    window.viewStudentAnswer = function(sid, name) {
        db.ref('studentAnswers/' + sid).once('value', function(snap) {
            const d = snap.val();
            if (!d || !d.data) { alert('لا توجد إجابة بعد'); return; }
            previewStudent(sid, name);
        });
    };

    const audioPeers = {};
    let tStream = null, micOn = false;

    window.toggleMic = async function() {
        const btn = document.getElementById('micBtn');
        if (!micOn) {
            try {
                tStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                micOn = true;
                btn.classList.add('mic-on');
                btn.innerHTML = '<i class="fas fa-microphone"></i>';
                Object.keys(students).forEach(function(sid) {
                    if (students[sid]?.online) callStu(sid);
                });
            } catch (err) { alert('تعذر تشغيل الميكروفون:\n' + err.message); }
        } else {
            micOn = false;
            btn.classList.remove('mic-on');
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            if (tStream) { tStream.getTracks().forEach(function(t) { t.stop(); }); tStream = null; }
            Object.values(audioPeers).forEach(function(pc) { pc.close(); });
            Object.keys(audioPeers).forEach(function(k) { delete audioPeers[k]; });
            db.ref('rtc/t2s_offer').remove();
            db.ref('rtc/t2s_ice').remove();
        }
    };

    async function callStu(sid) {
        if (audioPeers[sid]) return;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        audioPeers[sid] = pc;
        if (tStream) { tStream.getTracks().forEach(function(track) { pc.addTrack(track, tStream); }); }
        pc.onicecandidate = function(e) {
            if (e.candidate) db.ref('rtc/t2s_ice/' + sid).push(e.candidate.toJSON());
        };
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        db.ref('rtc/t2s_offer/' + sid).set({ sdp: offer.sdp, type: offer.type, ts: Date.now() });
        db.ref('rtc/s2t_answer/' + sid).on('value', async function(snap) {
            const a = snap.val();
            if (a && a.sdp && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(function() {});
            }
        });
    }

    window.endClass = function() { if (confirm('إنهاء الحصة؟')) window.location.reload(); };

    setInterval(function() {
        const t = Date.now();
        db.ref('ping_t').set(t);
        setTimeout(function() {
            db.ref('ping_t').once('value', function() {
                const el = document.getElementById('lat');
                if (el) el.textContent = (Date.now() - t) + 'ms';
            });
        }, 600);
    }, 6000);

    db.ref('boardImg_stu').on('child_added', function(snap) {
        const d = snap.val();
        if (d) {
            lastStuImg[snap.key] = d.data;
            if (currentBoard === snap.key) loadCanvas(d.data, false);
            render();
        }
    });

    db.ref('boardImg_stu').on('child_changed', function(snap) {
        const d = snap.val();
        if (d) {
            lastStuImg[snap.key] = d.data;
            if (currentBoard === snap.key) loadCanvas(d.data, false);
            render();
        }
    });

})();