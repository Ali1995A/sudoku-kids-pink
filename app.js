/* global SudokuEngine, window, document */
(function () {
  'use strict';

  var DEFAULT_DIFF = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function nowSeed() {
    // deterministic enough for play; stable across browsers.
    return (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
  }

  function candidatesForIdx(grid, idx) {
    if (grid[idx] !== 0) return [];
    var rc = SudokuEngine.idxToRC(idx);
    var out = [];
    for (var v = 1; v <= 9; v++) {
      if (SudokuEngine.isValidPlacement(grid, rc.r, rc.c, v)) out.push(v);
    }
    return out;
  }

  function findNakedSingle(puzzle, given) {
    // Return { idx, val } if found, else null.
    for (var i = 0; i < 81; i++) {
      if (given && given[i]) continue;
      if (puzzle[i] !== 0) continue;
      var cands = candidatesForIdx(puzzle, i);
      if (cands.length === 1) return { idx: i, val: cands[0] };
    }
    return null;
  }

  function setVhUnit() {
    var vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show';
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () {
      el.className = 'toast';
    }, 900);
  }

  function safeGetLS(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSetLS(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch (e) {
      // ignore
    }
  }

  function addFastTap(el, handler) {
    // Avoid 300ms delay in older webviews; prevent double triggers.
    var lastTouchAt = 0;
    var locked = false;
    function fire(e, isTouch) {
      var t = Date.now();
      if (isTouch) lastTouchAt = t;
      // Ignore synthetic click shortly after touch.
      if (!isTouch && lastTouchAt && t - lastTouchAt < 700) return;
      if (locked) return;
      locked = true;
      window.setTimeout(function () { locked = false; }, 260);
      handler(e);
    }
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      fire(e, true);
    }, { passive: false });
    el.addEventListener('click', function (e) {
      fire(e, false);
    });
  }

  function makeCellEl(idx) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'cell';
    el.setAttribute('role', 'gridcell');
    el.setAttribute('data-idx', String(idx));
    el.setAttribute('aria-label', '格子');

    var num = document.createElement('span');
    num.className = 'cell__num';
    var notes = document.createElement('span');
    notes.className = 'cell__notes';
    for (var n = 1; n <= 9; n++) {
      var it = document.createElement('i');
      it.textContent = String(n);
      notes.appendChild(it);
    }
    el.appendChild(num);
    el.appendChild(notes);

    var rc = SudokuEngine.idxToRC(idx);
    if (rc.r % 3 === 0) el.className += ' bTop';
    if (rc.c % 3 === 0) el.className += ' bLeft';
    if (rc.r === 8) el.className += ' bBottom';
    if (rc.c === 8) el.className += ' bRight';
    if (rc.r % 3 === 2) el.className += ' bBottom';
    if (rc.c % 3 === 2) el.className += ' bRight';
    return el;
  }

  function makeKeyEl(num) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'key';
    el.textContent = String(num);
    el.setAttribute('data-num', String(num));
    el.setAttribute('aria-label', '数字 ' + num);
    return el;
  }

  function Game() {
    this.diff = DEFAULT_DIFF;
    this.seed = nowSeed();
    this.solution = null;
    this.puzzleStart = null;
    this.puzzle = null;
    this.given = null;
    this.selected = -1;
    this.hintsUsed = 0;
    this.mistakes = 0;
    this.noteMode = false;
    this.notes = [];
    for (var i = 0; i < 81; i++) this.notes[i] = 0;
  }

  Game.prototype.newGame = function (diff) {
    this.diff = diff || DEFAULT_DIFF;
    this.seed = nowSeed();
    var solution = SudokuEngine.generateSolved(this.seed);
    if (!solution) {
      toast('再试一次');
      return false;
    }
    var puzzle = SudokuEngine.makePuzzleFromSolution(solution, this.diff, this.seed);
    this.solution = solution;
    this.puzzleStart = puzzle.slice(0);
    this.puzzle = puzzle.slice(0);
    this.given = [];
    for (var i = 0; i < 81; i++) this.given[i] = puzzle[i] !== 0;
    this.selected = -1;
    this.hintsUsed = 0;
    this.mistakes = 0;
    this.noteMode = false;
    for (i = 0; i < 81; i++) this.notes[i] = 0;
    return true;
  };

  Game.prototype.select = function (idx) {
    this.selected = idx;
  };

  Game.prototype.canEditSelected = function () {
    return this.selected >= 0 && !this.given[this.selected];
  };

  Game.prototype.setSelectedValue = function (val) {
    if (!this.canEditSelected()) return;
    this.puzzle[this.selected] = val;
    if (val !== 0) this.notes[this.selected] = 0;
  };

  Game.prototype.isSelectedWrong = function () {
    if (this.selected < 0) return false;
    var v = this.puzzle[this.selected];
    if (v === 0) return false;
    var rc = SudokuEngine.idxToRC(this.selected);
    return !SudokuEngine.isValidPlacement(this.puzzle, rc.r, rc.c, v);
  };

  Game.prototype.applyHint = function () {
    // Prefer "logic" hints: fill a naked single if possible.
    var idx = -1;
    if (this.selected >= 0 && !this.given[this.selected]) idx = this.selected;

    if (idx >= 0 && this.puzzle[idx] === 0) {
      var selectedCands = candidatesForIdx(this.puzzle, idx);
      if (selectedCands.length === 1) {
        this.puzzle[idx] = selectedCands[0];
        this.notes[idx] = 0;
        this.hintsUsed++;
        return idx;
      }
    }

    var ns = findNakedSingle(this.puzzle, this.given);
    if (ns) {
      this.puzzle[ns.idx] = ns.val;
      this.notes[ns.idx] = 0;
      this.hintsUsed++;
      return ns.idx;
    }

    // Fallback: If selected and editable, hint there; otherwise find first empty.
    if (idx === -1 || this.puzzle[idx] !== 0) idx = -1;
    if (idx === -1) {
      for (var i = 0; i < 81; i++) {
        if (!this.given[i] && this.puzzle[i] === 0) {
          idx = i;
          break;
        }
      }
    }

    if (idx === -1) return null;
    this.puzzle[idx] = this.solution[idx];
    this.notes[idx] = 0;
    this.hintsUsed++;
    return idx;
  };

  Game.prototype.toggleNoteMode = function () {
    this.noteMode = !this.noteMode;
    return this.noteMode;
  };

  Game.prototype.toggleNoteAtSelected = function (num) {
    if (!this.canEditSelected()) return false;
    if (this.puzzle[this.selected] !== 0) return false;
    if (num < 1 || num > 9) return false;
    var bit = 1 << (num - 1);
    this.notes[this.selected] ^= bit;
    return true;
  };

  Game.prototype.clearSelectedNotes = function () {
    if (this.selected < 0) return;
    this.notes[this.selected] = 0;
  };

  function UI(game) {
    this.game = game;
    this.boardEl = $('board');
    this.padEl = $('pad');
    this.statusEl = $('status');
    this.cells = [];
    this.cellNums = [];
    this.cellNoteItems = [];
    this.keys = [];
    this.diffButtons = Array.prototype.slice.call(document.querySelectorAll('.diff'));
    this.noteBtnEl = null;
    this.isBusy = false;
  }

  UI.prototype.init = function () {
    setVhUnit();
    window.addEventListener('resize', setVhUnit);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(setVhUnit, 50);
    });

    this.buildBoard();
    this.buildPad();
    this.wireTopButtons();
    this.wireHelp();
    this.setDifficultyActive(this.game.diff);

    // Default easiest
    this.startNewGame(DEFAULT_DIFF, '✨');
  };

  UI.prototype.wireHelp = function () {
    var modal = $('helpModal');
    var openBtn = $('helpBtn');
    var closeBtn = $('helpCloseBtn');
    var backdrop = $('helpBackdrop');

    function open() {
      if (!modal) return;
      modal.className = 'modal isOpen';
      modal.setAttribute('aria-hidden', 'false');
      safeSetLS('sdk_seen_help', '1');
    }

    function close() {
      if (!modal) return;
      modal.className = 'modal';
      modal.setAttribute('aria-hidden', 'true');
    }

    if (openBtn) addFastTap(openBtn, open);
    if (closeBtn) addFastTap(closeBtn, close);
    if (backdrop) addFastTap(backdrop, close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    if (safeGetLS('sdk_seen_help') !== '1') {
      window.setTimeout(open, 280);
    }
  };

  UI.prototype.setBusy = function (busy) {
    this.isBusy = busy;
    for (var i = 0; i < this.cells.length; i++) this.cells[i].disabled = !!busy;
    for (i = 0; i < this.keys.length; i++) this.keys[i].disabled = !!busy;
  };

  UI.prototype.startNewGame = function (diff, toastMsg) {
    var self = this;
    self.ensureNoteButton();
    if (self.noteBtnEl) {
      addFastTap(self.noteBtnEl, function () {
        var on = self.game.toggleNoteMode();
        self.updateNoteButton();
        toast(on ? '笔记：开' : '笔记：关');
        self.renderAll();
      });
    }
    if (self.isBusy) return;
    self.setBusy(true);
    self.statusEl.textContent = '⏳';
    if (toastMsg) toast(toastMsg);
    window.setTimeout(function () {
      self.game.newGame(diff);
      self.updateNoteButton();
      self.setDifficultyActive(self.game.diff);
      self.setBusy(false);
      self.renderAll();
    }, 30);
  };

  UI.prototype.buildBoard = function () {
    var self = this;
    this.boardEl.innerHTML = '';
    this.cells = [];
    this.cellNums = [];
    this.cellNoteItems = [];
    for (var i = 0; i < 81; i++) {
      (function (idx) {
        var cell = makeCellEl(idx);
        var numEl = cell.querySelector('.cell__num');
        var noteItems = Array.prototype.slice.call(cell.querySelectorAll('.cell__notes i'));
        addFastTap(cell, function () {
          self.game.select(idx);
          self.renderAll();
        });
        self.boardEl.appendChild(cell);
        self.cells.push(cell);
        self.cellNums.push(numEl);
        self.cellNoteItems.push(noteItems);
      })(i);
    }
  };

  UI.prototype.buildPad = function () {
    var self = this;
    this.padEl.innerHTML = '';
    this.keys = [];
    for (var i = 1; i <= 9; i++) {
      (function (num) {
        var key = makeKeyEl(num);
        addFastTap(key, function () {
          self.onNumber(num);
        });
        self.padEl.appendChild(key);
        self.keys.push(key);
      })(i);
    }
  };

  UI.prototype.ensureNoteButton = function () {
    var btn = $('noteBtn');
    if (!btn) {
      var quick = document.querySelector('.quick');
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn big';
      btn.id = 'noteBtn';
      btn.setAttribute('aria-label', '笔记模式');
      btn.title = '笔记模式';
      btn.textContent = '✏️';

      var after = $('newGameBtn');
      if (after && after.parentNode && after.parentNode === quick) after.insertAdjacentElement('afterend', btn);
      else if (quick) quick.appendChild(btn);
    }
    this.noteBtnEl = btn;
    this.updateNoteButton();
  };

  UI.prototype.updateNoteButton = function () {
    if (!this.noteBtnEl) return;
    if (this.game.noteMode) this.noteBtnEl.className = 'btn big isActive';
    else this.noteBtnEl.className = 'btn big';
  };

  UI.prototype.wireTopButtons = function () {
    var self = this;
    addFastTap($('newGameBtn'), function () {
      self.startNewGame(self.game.diff, '🔄');
    });
    addFastTap($('eraseBtn'), function () {
      if (!self.game.canEditSelected()) return;
      if (self.game.noteMode) self.game.clearSelectedNotes();
      else self.game.setSelectedValue(0);
      self.renderAll();
    });
    addFastTap($('hintBtn'), function () {
      if (self.isBusy) return;
      var idx = self.game.applyHint();
      if (idx == null) {
        toast('✅');
        return;
      }
      self.game.select(idx);
      self.renderAll();
      self.pulseHint(idx);
      toast('💡');
    });

    this.diffButtons.forEach(function (btn) {
      addFastTap(btn, function () {
        var diff = parseInt(btn.getAttribute('data-diff'), 10);
        self.startNewGame(diff, '💗×' + diff);
      });
    });
  };

  UI.prototype.setDifficultyActive = function (diff) {
    this.diffButtons.forEach(function (b) {
      var d = parseInt(b.getAttribute('data-diff'), 10);
      if (d === diff) b.className = 'diff isActive';
      else b.className = 'diff';
    });
  };

  UI.prototype.onNumber = function (num) {
    if (this.isBusy) return;

    if (this.game.noteMode) {
      if (!this.game.canEditSelected()) {
        for (var ii = 0; ii < 81; ii++) {
          if (!this.game.given[ii] && this.game.puzzle[ii] === 0) {
            this.game.select(ii);
            break;
          }
        }
      }
      if (!this.game.canEditSelected()) {
        toast('先选一个空格');
        this.renderAll();
        return;
      }
      if (!this.game.toggleNoteAtSelected(num)) {
        toast('先擦掉数字再记笔记');
        return;
      }
      this.renderAll();
      toast('记下啦');
      return;
    }
    if (!this.game.canEditSelected()) {
      // Kid-friendly: if not selected, auto-pick an empty cell.
      for (var i = 0; i < 81; i++) {
        if (!this.game.given[i] && this.game.puzzle[i] === 0) {
          this.game.select(i);
          break;
        }
      }
      if (!this.game.canEditSelected()) {
        toast('👉');
        this.renderAll();
        return;
      }
    }
    this.game.setSelectedValue(num);
    if (this.game.isSelectedWrong()) this.game.mistakes++;
    this.renderAll();

    if (this.game.isSelectedWrong()) toast('🩷');
    else toast('⭐');

    if (SudokuEngine.isSolved(this.game.puzzle, this.game.solution)) {
      toast('🏁');
      this.statusEl.textContent = '🏁';
    }
  };

  UI.prototype.pulseHint = function (idx) {
    var el = this.cells[idx];
    if (!el) return;
    el.className += ' isHint';
    window.setTimeout(function () {
      el.className = el.className.replace(' isHint', '');
    }, 420);
  };

  UI.prototype.renderAll = function () {
    this.renderCells();
    this.renderPad();
    this.renderStatus();
  };

  UI.prototype.renderStatus = function () {
    var g = this.game;
    // Icon-first for kids; no "lives" (unlimited mistakes).
    this.statusEl.textContent = '💡 ' + g.hintsUsed + '   ' + '❌ ' + g.mistakes;
  };

  UI.prototype.renderPad = function () {
    // Keep all enabled; unlimited mistakes means no lockout.
    for (var i = 0; i < this.keys.length; i++) {
      this.keys[i].className = 'key';
    }
  };

  UI.prototype.renderCells = function () {
    var g = this.game;
    var selected = g.selected;
    var selectedVal = selected >= 0 ? g.puzzle[selected] : 0;
    var selectedRC = selected >= 0 ? SudokuEngine.idxToRC(selected) : null;
    var selectedBox = selectedRC ? SudokuEngine.boxIndex(selectedRC.r, selectedRC.c) : -1;

    for (var i = 0; i < 81; i++) {
      var el = this.cells[i];
      var v = g.puzzle[i];
      var base = 'cell';

      if (g.given[i]) base += ' isGiven';
      if (i === selected) base += ' isSelected';

      // Peer highlight for touch guidance.
      if (selected >= 0) {
        var a = SudokuEngine.idxToRC(i);
        if (a.r === selectedRC.r || a.c === selectedRC.c || SudokuEngine.boxIndex(a.r, a.c) === selectedBox) {
          if (i !== selected) base += ' isPeer';
        }
      }

      // Same number highlight (kid-friendly matching).
      if (selectedVal && v === selectedVal) base += ' isSame';

      // Conflict highlight: violates row/col/box rules.
      if (!g.given[i] && v !== 0) {
        var rc2 = SudokuEngine.idxToRC(i);
        if (!SudokuEngine.isValidPlacement(g.puzzle, rc2.r, rc2.c, v)) base += ' isWrong';
      }

      // Borders
      var rc = SudokuEngine.idxToRC(i);
      if (rc.r % 3 === 0) base += ' bTop';
      if (rc.c % 3 === 0) base += ' bLeft';
      if (rc.r % 3 === 2) base += ' bBottom';
      if (rc.c % 3 === 2) base += ' bRight';

      el.className = base;
      var numEl = this.cellNums[i];
      if (numEl) numEl.textContent = v === 0 ? '' : String(v);

      var notesMask = g.notes[i] >>> 0;
      var hasNotes = !g.given[i] && v === 0 && notesMask !== 0;
      if (hasNotes) base += ' hasNotes';
      el.className = base;

      var items = this.cellNoteItems[i];
      if (items && items.length === 9) {
        for (var nn = 0; nn < 9; nn++) {
          if (hasNotes && (notesMask & (1 << nn))) items[nn].className = 'on';
          else items[nn].className = '';
        }
      }
      el.disabled = false;
      if (g.given[i]) el.setAttribute('aria-label', '固定数字 ' + v);
      else el.setAttribute('aria-label', v ? ('数字 ' + v) : '空格');
    }
  };

  function main() {
    var game = new Game();
    var ui = new UI(game);
    ui.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
