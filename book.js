/* ===================================
   Groupe ALLAM — LIVRE VIRTUEL
   Pagination automatique + tourne-page 3D
   =================================== */

(function () {
    'use strict';

    var stage = document.getElementById('bookStage');
    if (!stage) return;

    var source   = document.getElementById('bookSource');
    var frameEl  = document.getElementById('bookFrame');
    var bookEl   = document.getElementById('book');
    var leavesEl = document.getElementById('bookLeaves');
    var prevBtn  = document.getElementById('bkPrev');
    var nextBtn  = document.getElementById('bkNext');
    var barEl    = document.getElementById('bkBar');
    var countEl  = document.getElementById('bkCount');
    var tocEl    = document.getElementById('bkToc');

    var REDUCED  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TURN_MS  = REDUCED ? 20 : 900;
    var PAGE_RATIO = 0.7;          // largeur / hauteur d'une page
    var SINGLE_BP  = 820;          // seuil du mode page unique
    var LONELY     = 40;           // fond de page jugé trop clairsemé (en mots)

    var chapters = [];             // {num, title, epi, style, blocks[]}
    var pages    = [];             // {html, chapter, num, kind}
    var leaves   = [];             // éléments DOM
    var current  = 0;              // nombre de feuillets tournés
    var busy     = false;
    var mode     = '';             // 'double' | 'single'
    var pw = 0, ph = 0;
    var measure  = null;

    /* ---------------------------------------------------
       1. Lecture du contenu source
       --------------------------------------------------- */

    function readSource() {
        chapters = [];
        var nodes = source.querySelectorAll('.chap');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var blocks = [];
            var kids = el.children;
            for (var k = 0; k < kids.length; k++) {
                if (kids[k].tagName !== 'H2') blocks.push(kids[k].cloneNode(true));
            }
            chapters.push({
                num:    el.dataset.num || '',
                title:  el.dataset.title || '',
                epi:    el.dataset.epi || '',
                style:  el.dataset.style || '',
                blocks: blocks
            });
        }
    }

    /* ---------------------------------------------------
       2. Dimensions
       --------------------------------------------------- */

    function computeSize() {
        var vw = document.documentElement.clientWidth;
        var vh = window.innerHeight;
        var single = vw < SINGLE_BP;
        var w, h;

        if (single) {
            w = Math.min(vw - 32, 460);
            h = w / PAGE_RATIO;
            var maxH = Math.max(vh - 290, 360);
            if (h > maxH) { h = maxH; w = h * PAGE_RATIO; }
            pw = w; ph = h;
        } else {
            h = Math.min(Math.max(vh - 330, 400), 720);
            w = h * PAGE_RATIO * 2;
            var maxW = Math.min(vw - 48, 1160);
            if (w > maxW) { w = maxW; h = w / (PAGE_RATIO * 2); }
            pw = w / 2; ph = h;
        }

        mode = single ? 'single' : 'double';
        bookEl.classList.toggle('single', single);
        bookEl.style.width  = Math.round(w) + 'px';
        bookEl.style.height = Math.round(h) + 'px';
        return Math.round(w) + 'x' + Math.round(h) + ':' + mode;
    }

    /* ---------------------------------------------------
       3. Rig de mesure
       --------------------------------------------------- */

    function ensureMeasure() {
        if (!measure) {
            measure = document.createElement('div');
            measure.className = 'bk-measure';
            measure.innerHTML =
                '<div class="pg"><div class="pg-inner">' +
                '<div class="pg-head">&nbsp;</div>' +
                '<div class="pg-body"></div>' +
                '<div class="pg-foot"><span class="pg-num">88</span></div>' +
                '</div></div>';
            stage.appendChild(measure);
        }
        measure.style.width  = pw + 'px';
        measure.style.height = ph + 'px';
        return measure.querySelector('.pg-body');
    }

    /* ---------------------------------------------------
       4. Découpe d'un bloc en mots (balises préservées)
       --------------------------------------------------- */

    // Compte les mots nœud de texte par nœud de texte, exactement comme
    // sliceWords les indexe. Compter sur textContent donnerait un total plus
    // petit dès qu'une balise coupe un mot ("promo</strong>." = 2 ici, 1 là),
    // et la fin des paragraphes serait tronquée à la découpe.
    function countWords(el) {
        var n = 0;
        (function walk(node) {
            var kids = node.childNodes;
            for (var i = 0; i < kids.length; i++) {
                if (kids[i].nodeType === 3) {
                    n += kids[i].textContent.split(/\s+/).filter(Boolean).length;
                } else if (kids[i].nodeType === 1) {
                    walk(kids[i]);
                }
            }
        })(el);
        return n;
    }

    function sliceWords(src, from, to) {
        var clone = src.cloneNode(true);
        var i = 0;

        (function walk(node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            for (var c = 0; c < kids.length; c++) {
                var child = kids[c];
                if (child.nodeType === 3) {
                    var raw = child.textContent;
                    var words = raw.split(/\s+/).filter(Boolean);
                    var kept = [];
                    for (var w = 0; w < words.length; w++) {
                        if (i >= from && i < to) kept.push(words[w]);
                        i++;
                    }
                    if (!kept.length) {
                        child.textContent = '';
                    } else {
                        child.textContent =
                            (/^\s/.test(raw) ? ' ' : '') + kept.join(' ') + (/\s$/.test(raw) ? ' ' : '');
                    }
                } else if (child.nodeType === 1) {
                    walk(child);
                    if (!child.textContent.trim() && !child.querySelector('br, img')) {
                        child.parentNode.removeChild(child);
                    }
                }
            }
        })(clone);

        return clone;
    }

    function sliceItems(src, from, to) {
        var clone = src.cloneNode(true);
        var items = Array.prototype.slice.call(clone.children);
        for (var i = 0; i < items.length; i++) {
            if (i < from || i >= to) items[i].parentNode.removeChild(items[i]);
        }
        return clone;
    }

    /* ---------------------------------------------------
       5. Pagination
       --------------------------------------------------- */

    function paginate() {
        var body = ensureMeasure();
        pages = [];

        function fits() {
            return body.scrollHeight <= body.clientHeight + 1;
        }

        function pushRaw(html, kind) {
            pages.push({ html: html, kind: kind || 'raw', chapter: '', num: 0 });
        }

        function blank() {
            pushRaw('<div class="pg"><div class="pg-inner"></div></div>', 'blank');
        }

        // Page de respiration insérée pour caler l'ouverture suivante :
        // un ornament plutôt qu'un blanc, qui passerait pour un bug d'affichage.
        function filler() {
            pushRaw(
                '<div class="pg pg-filler"><div class="pg-inner">' +
                    '<div class="filler-mark">&#9830;</div>' +
                '</div></div>', 'filler');
        }

        // Une ouverture de chapitre commence toujours sur une page de droite
        function alignRecto() {
            if (mode === 'double' && pages.length % 2 === 1) filler();
        }

        /* --- Pièces liminaires --- */
        pushRaw(coverHTML(), 'cover');
        pushRaw(endpaperHTML(), 'endpaper');
        pushRaw(titlePageHTML(), 'title');

        /* --- Chapitres --- */
        var counter = 0;

        for (var c = 0; c < chapters.length; c++) {
            var ch = chapters[c];

            alignRecto();
            ch.pageIndex = pages.length;
            pushRaw(openerHTML(ch), 'opener');

            // data-style du chapitre reporté tel quel sur la page (letter,
            // journal, …) : c'est lui qui pilote la mise en forme et la
            // suppression de la lettrine.
            var bodyClass = 'pg-body' + (ch.style ? ' ' + ch.style : '');
            body.className = bodyClass + ' has-drop';

            var queue = ch.blocks.slice();

            var commit = function () {
                counter++;
                pages.push({
                    html: body.innerHTML,
                    kind: 'text',
                    chapter: ch.title,
                    num: counter,
                    cls: body.className.replace('pg-body', '').trim()
                });
                body.innerHTML = '';
                body.className = bodyClass;
            };

            // Plus grande portion du bloc qui tient dans la place restante.
            var maxFit = function (block, total, slice) {
                var lo = 1, hi = total, best = 0, mid, probe, ok;
                while (lo <= hi) {
                    mid = (lo + hi) >> 1;
                    probe = slice(block, 0, mid);
                    body.appendChild(probe);
                    ok = fits();
                    body.removeChild(probe);
                    if (ok) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
                }
                return best;
            };

            // Le bloc tiendrait-il entier sur une page vierge ?
            var fitsAlone = function (block) {
                var saved = body.innerHTML;
                body.innerHTML = '';
                body.appendChild(block.cloneNode(true));
                var ok = fits();
                body.innerHTML = saved;
                return ok;
            };

            var cut = function (block, total, slice, best) {
                if (best < 1) best = 1;
                body.appendChild(slice(block, 0, best));
                if (best < total) queue.unshift(slice(block, best, total));
                commit();
            };

            while (queue.length) {
                var block = queue.shift();
                body.appendChild(block);
                if (fits()) continue;
                body.removeChild(block);

                var isList  = block.tagName === 'UL' || block.tagName === 'OL';
                var total   = isList ? block.children.length : countWords(block);
                var slice   = isList ? sliceItems : sliceWords;
                // Seuil anti-orphelines : on ne coupe pas pour laisser une
                // ligne isolée d'un côté ou de l'autre.
                var minKeep = isList ? 1 : 18;

                if (total <= 1) {
                    if (body.children.length) commit();
                    body.appendChild(block);
                    continue;
                }

                var best = maxFit(block, total, slice);

                // Si couper au maximum laisserait une ligne orpheline sur la
                // page suivante, on recule le point de coupe — surtout pas
                // renvoyer le bloc entier, ce qui viderait la page courante.
                var cutAt = Math.min(best, total - minKeep);

                // Dernier bloc du chapitre : couper laisserait un fond de page
                // clairsemé. On le bascule entier, les deux pages s'équilibrent.
                if (!queue.length && body.children.length &&
                    total - cutAt < LONELY && fitsAlone(block)) {
                    commit();
                    body.appendChild(block);
                    continue;
                }

                if (cutAt >= minKeep) {
                    cut(block, total, slice, cutAt);
                    continue;
                }

                // Sinon on repart d'une page neuve.
                if (body.children.length) {
                    commit();
                    body.appendChild(block);
                    if (fits()) continue;
                    body.removeChild(block);
                    best = maxFit(block, total, slice);
                }

                cut(block, total, slice, best);
            }

            if (body.children.length) commit();
            body.innerHTML = '';
        }

        /* --- Pièces finales --- */
        alignRecto();
        pushRaw(endPageHTML(), 'end');

        if (mode === 'double') {
            while (pages.length % 2 === 1) blank();
            pushRaw(endpaperHTML(), 'endpaper');
            pushRaw(coverBackHTML(), 'backcover');
        } else {
            pushRaw(coverBackHTML(), 'backcover');
        }

        body.className = 'pg-body';
        body.innerHTML = '';
    }

    /* ---------------------------------------------------
       6. Gabarits
       --------------------------------------------------- */

    function coverHTML() {
        return '' +
            '<div class="pg pg-cover"><div class="pg-inner">' +
                '<div class="cover-crest">&#9830;</div>' +
                '<div class="cover-house">Groupe ALLAM</div>' +
                '<h2 class="cover-title">Notre<br>Histoire</h2>' +
                '<div class="cover-rule"></div>' +
                '<p class="cover-sub">D\'une cit&eacute; de l\'Essonne &agrave; la fondation d\'un empire</p>' +
                '<div class="cover-vol">Livre Premier</div>' +
            '</div></div>';
    }

    function coverBackHTML() {
        return '' +
            '<div class="pg pg-cover"><div class="pg-inner">' +
                '<div class="cover-crest">&#9830;</div>' +
                '<div class="cover-house">Groupe ALLAM</div>' +
            '</div></div>';
    }

    function endpaperHTML() {
        return '' +
            '<div class="pg pg-endpaper"><div class="pg-inner">' +
                '<div class="endpaper-mark">&#9830;</div>' +
                '<p class="endpaper-motto">&laquo; Nous sommes le changement que notre lign&eacute;e attendait &raquo;</p>' +
            '</div></div>';
    }

    function titlePageHTML() {
        return '' +
            '<div class="pg pg-title"><div class="pg-inner">' +
                '<div class="tp-house">Groupe ALLAM</div>' +
                '<h2 class="tp-title">Notre Histoire</h2>' +
                '<p class="tp-sub">D\'une cit&eacute; de l\'Essonne &agrave; la fondation d\'un empire</p>' +
                '<div class="tp-stats">' +
                    '<div class="tp-stat"><b>2</b><span>G&eacute;n&eacute;rations</span></div>' +
                    '<div class="tp-stat"><b>3</b><span>Membres</span></div>' +
                    '<div class="tp-stat"><b>4</b><span>Entreprises</span></div>' +
                    '<div class="tp-stat"><b>4</b><span>Biens</span></div>' +
                '</div>' +
            '</div></div>';
    }

    function openerHTML(ch) {
        return '' +
            '<div class="pg pg-opener"><div class="pg-inner">' +
                (ch.num ? '<div class="op-num">' + ch.num + '</div>' : '') +
                '<div class="op-rule"></div>' +
                '<h2 class="op-title">' + ch.title + '</h2>' +
                (ch.epi ? '<p class="op-epi">&laquo;&nbsp;' + ch.epi + '&nbsp;&raquo;</p>' : '') +
            '</div></div>';
    }

    function endPageHTML() {
        return '' +
            '<div class="pg pg-end"><div class="pg-inner">' +
                '<div class="op-rule"></div>' +
                '<div class="end-mark">Fin du Livre Premier</div>' +
                '<p class="end-note">L\'histoire continue dans l\'Arbre G&eacute;n&eacute;alogique, la Charte Familiale et l\'H&eacute;ritage.</p>' +
                '<div class="op-rule"></div>' +
            '</div></div>';
    }

    function pageHTML(p) {
        if (p.kind !== 'text') return p.html;
        return '' +
            '<div class="pg"><div class="pg-inner">' +
                '<div class="pg-head">' + (p.chapter || '&nbsp;') + '</div>' +
                '<div class="pg-body ' + (p.cls || '') + '">' + p.html + '</div>' +
                '<div class="pg-foot"><span class="pg-num">' + p.num + '</span></div>' +
            '</div></div>';
    }

    /* ---------------------------------------------------
       7. Construction des feuillets
       --------------------------------------------------- */

    function buildLeaves() {
        leavesEl.innerHTML = '';
        leaves = [];

        var step = mode === 'double' ? 2 : 1;

        for (var i = 0; i < pages.length; i += step) {
            var leaf = document.createElement('div');
            leaf.className = 'leaf';

            var front = document.createElement('div');
            front.className = 'leaf-face front';
            front.innerHTML = pageHTML(pages[i]);
            leaf.appendChild(front);

            var back = document.createElement('div');
            back.className = 'leaf-face back';
            back.innerHTML = (step === 2 && pages[i + 1])
                ? pageHTML(pages[i + 1])
                : '<div class="pg"><div class="pg-inner"></div></div>';
            leaf.appendChild(back);

            leavesEl.appendChild(leaf);
            leaves.push(leaf);
        }

        applyZ();
    }

    function applyZ() {
        for (var i = 0; i < leaves.length; i++) {
            leaves[i].style.zIndex = (i < current) ? String(i + 1) : String(leaves.length - i);
        }
    }

    /* ---------------------------------------------------
       8. Sommaire
       --------------------------------------------------- */

    function leafOf(pageIndex) {
        return mode === 'double' ? Math.floor(pageIndex / 2) : pageIndex;
    }

    function buildToc() {
        tocEl.innerHTML = '';
        for (var i = 0; i < chapters.length; i++) {
            (function (ch) {
                var chip = document.createElement('button');
                chip.className = 'bk-chip';
                chip.type = 'button';
                // Le point ne suit que les numéros de chapitre ; un ornement
                // comme ♦ se contente d'une espace.
                chip.textContent = !ch.num ? ch.title
                    : /[A-Za-z0-9]/.test(ch.num) ? ch.num + '. ' + ch.title
                    : ch.num + ' ' + ch.title;
                chip.dataset.leaf = String(leafOf(ch.pageIndex));
                chip.addEventListener('click', function () {
                    goToLeaf(parseInt(chip.dataset.leaf, 10));
                });
                tocEl.appendChild(chip);
            })(chapters[i]);
        }
    }

    /* ---------------------------------------------------
       9. Navigation
       --------------------------------------------------- */

    function turn(dir) {
        if (busy) return;
        var target = current + dir;
        if (target < 0 || target > leaves.length) return;

        busy = true;
        var leaf = leaves[dir > 0 ? current : target];
        leaf.style.zIndex = String(leaves.length + 10);
        if (dir > 0) leaf.classList.add('flipped');
        else leaf.classList.remove('flipped');

        current = target;
        stage.classList.add('turned');
        updateChrome();

        window.setTimeout(function () {
            applyZ();
            busy = false;
        }, TURN_MS + 40);
    }

    function goToLeaf(target) {
        if (busy || target === current) return;
        target = Math.max(0, Math.min(leaves.length, target));
        if (target === current) return;

        var dir   = target > current ? 1 : -1;
        var steps = Math.abs(target - current);
        var start = current;
        busy = true;

        for (var s = 0; s < steps; s++) {
            (function (s) {
                var idx  = dir > 0 ? start + s : start - s - 1;
                var leaf = leaves[idx];
                window.setTimeout(function () {
                    leaf.style.zIndex = String(leaves.length + 10 + s);
                    if (dir > 0) leaf.classList.add('flipped');
                    else leaf.classList.remove('flipped');
                }, s * 90);
            })(s);
        }

        current = target;
        stage.classList.add('turned');
        updateChrome();

        window.setTimeout(function () {
            applyZ();
            busy = false;
        }, (steps - 1) * 90 + TURN_MS + 40);
    }

    function updateChrome() {
        bookEl.dataset.state =
            current === 0 ? 'closed' : (current === leaves.length ? 'end' : 'open');

        prevBtn.disabled = current === 0;
        nextBtn.disabled = current === leaves.length;

        barEl.style.width = leaves.length ? (current / leaves.length * 100) + '%' : '0%';

        // Page(s) visible(s)
        var right = mode === 'double' ? current * 2 : current;
        var p = pages[right] || pages[right - 1];
        var label = 'Couverture';

        if (current === 0) {
            label = 'Couverture';
        } else if (current === leaves.length) {
            label = 'Fin';
        } else if (p) {
            if (p.kind === 'text')        label = p.chapter + ' &middot; p. ' + p.num;
            else if (p.kind === 'opener') label = 'Ouverture de chapitre';
            else if (p.kind === 'title')  label = 'Page de titre';
            else {
                var l = pages[right - 1];
                label = (l && l.kind === 'text') ? l.chapter + ' &middot; p. ' + l.num : 'Livre Premier';
            }
        }
        countEl.innerHTML = label;

        // Chapitre courant dans le sommaire
        var chips = tocEl.children;
        var activeLeaf = -1;
        for (var i = 0; i < chapters.length; i++) {
            if (leafOf(chapters[i].pageIndex) <= current) activeLeaf = i;
        }
        for (var j = 0; j < chips.length; j++) {
            chips[j].classList.toggle('current', j === activeLeaf && current > 0 && current < leaves.length);
        }
    }

    /* ---------------------------------------------------
       10. Montage / remontage
       --------------------------------------------------- */

    var lastSig = '';

    function build(keepChapter) {
        var sig = computeSize();
        lastSig = sig;
        paginate();
        buildLeaves();
        buildToc();

        if (typeof keepChapter === 'number' && chapters[keepChapter]) {
            current = Math.min(leafOf(chapters[keepChapter].pageIndex), leaves.length);
            for (var i = 0; i < leaves.length; i++) {
                leaves[i].classList.toggle('flipped', i < current);
            }
            applyZ();
        }
        updateChrome();
    }

    function currentChapter() {
        var idx = -1;
        for (var i = 0; i < chapters.length; i++) {
            if (leafOf(chapters[i].pageIndex) <= current) idx = i;
        }
        return idx;
    }

    /* ---------------------------------------------------
       11. Interactions
       --------------------------------------------------- */

    function bind() {
        prevBtn.addEventListener('click', function () { turn(-1); });
        nextBtn.addEventListener('click', function () { turn(1); });

        // Clic sur le livre : moitié gauche = précédent, moitié droite = suivant.
        // Écouteur sur le cadre plutôt que sur des calques : une page en cours
        // de rotation passe devant tout calque posé dans le contexte 3D.
        frameEl.addEventListener('click', function (e) {
            if (current === 0) { turn(1); return; }
            if (current === leaves.length) { turn(-1); return; }
            var r = frameEl.getBoundingClientRect();
            turn(e.clientX < r.left + r.width / 2 ? -1 : 1);
        });

        document.addEventListener('keydown', function (e) {
            if (e.target.closest && e.target.closest('input, textarea')) return;
            if (e.key === 'ArrowRight')      { turn(1);  e.preventDefault(); }
            else if (e.key === 'ArrowLeft')  { turn(-1); e.preventDefault(); }
            else if (e.key === 'Home')       { goToLeaf(0); e.preventDefault(); }
            else if (e.key === 'End')        { goToLeaf(leaves.length); e.preventDefault(); }
        });

        var x0 = null, y0 = null;
        frameEl.addEventListener('touchstart', function (e) {
            x0 = e.changedTouches[0].clientX;
            y0 = e.changedTouches[0].clientY;
        }, { passive: true });

        frameEl.addEventListener('touchend', function (e) {
            if (x0 === null) return;
            var dx = e.changedTouches[0].clientX - x0;
            var dy = e.changedTouches[0].clientY - y0;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
            x0 = y0 = null;
        }, { passive: true });

        var timer = null;
        window.addEventListener('resize', function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(function () {
                var probe = computeSize();
                if (probe === lastSig) return;
                build(currentChapter());
            }, 220);
        });
    }

    /* ---------------------------------------------------
       12. Démarrage
       --------------------------------------------------- */

    function start() {
        readSource();
        if (!chapters.length) return;
        stage.classList.add('book-ready');
        build();
        bind();
    }

    // La pagination dépend des métriques de police : on attend les webfonts,
    // mais jamais plus de 2,5 s (réseau lent ou Google Fonts injoignable).
    var started = false;
    function startOnce() {
        if (started) return;
        started = true;
        start();
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(startOnce).catch(startOnce);
        window.setTimeout(startOnce, 2500);
    } else {
        window.addEventListener('load', startOnce);
    }
})();
