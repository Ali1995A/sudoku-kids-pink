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
  };

  Game.prototype.isSelectedWrong = function () {
    if (this.selected < 0) return false;
    var v = this.puzzle[this.selected];
    if (v === 0) return false;
    return v !== this.solution[this.selected];
  };

  Game.prototype.applyHint = function () {
    // If selected and editable, hint there; otherwise find first empty.
    var idx = -1;
    if (this.selected >= 0 && !this.given[this.selected]) idx = this.selected;
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
    this.hintsUsed++;
    return idx;
  };

  function UI(game) {
    this.game = game;
    this.boardEl = $('board');
    this.padEl = $('pad');
    this.statusEl = $('status');
    this.cells = [];
    this.keys = [];
    this.diffButtons = Array.prototype.slice.call(document.querySelectorAll('.diff'));
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
    this.setDifficultyActive(this.game.diff);

    // Default easiest
    this.startNewGame(DEFAULT_DIFF, '✨');
  };

  UI.prototype.setBusy = function (busy) {
    this.isBusy = busy;
    for (var i = 0; i < this.cells.length; i++) this.cells[i].disabled = !!busy;
    for (i = 0; i < this.keys.length; i++) this.keys[i].disabled = !!busy;
  };

  UI.prototype.startNewGame = function (diff, toastMsg) {
    var self = this;
    if (self.isBusy) return;
    self.setBusy(true);
    self.statusEl.textContent = '⏳';
    if (toastMsg) toast(toastMsg);
    window.setTimeout(function () {
      self.game.newGame(diff);
      self.setDifficultyActive(self.game.diff);
      self.setBusy(false);
      self.renderAll();
    }, 30);
  };

  UI.prototype.buildBoard = function () {
    var self = this;
    this.boardEl.innerHTML = '';
    this.cells = [];
    for (var i = 0; i < 81; i++) {
      (function (idx) {
        var cell = makeCellEl(idx);
        addFastTap(cell, function () {
          self.game.select(idx);
          self.renderAll();
        });
        self.boardEl.appendChild(cell);
        self.cells.push(cell);
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

  UI.prototype.wireTopButtons = function () {
    var self = this;
    addFastTap($('newGameBtn'), function () {
      self.startNewGame(self.game.diff, '🔄');
    });
    addFastTap($('eraseBtn'), function () {
      if (!self.game.canEditSelected()) return;
      self.game.setSelectedValue(0);
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

      // Wrong only for editable cells.
      if (!g.given[i] && v !== 0 && v !== g.solution[i]) base += ' isWrong';

      // Borders
      var rc = SudokuEngine.idxToRC(i);
      if (rc.r % 3 === 0) base += ' bTop';
      if (rc.c % 3 === 0) base += ' bLeft';
      if (rc.r % 3 === 2) base += ' bBottom';
      if (rc.c % 3 === 2) base += ' bRight';

      el.className = base;
      el.textContent = v === 0 ? '' : String(v);
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
