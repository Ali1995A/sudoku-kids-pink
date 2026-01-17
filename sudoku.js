/* global window */
(function () {
  'use strict';

  function cloneGrid(grid) {
    return grid.slice(0);
  }

  function idxToRC(idx) {
    return { r: Math.floor(idx / 9), c: idx % 9 };
  }

  function rcToIdx(r, c) {
    return r * 9 + c;
  }

  function boxIndex(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
  }

  function shuffledDigits(rng) {
    var a = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function makeRng(seed) {
    // Simple LCG; stable across browsers, no crypto needed.
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      // NOTE: Bitwise ops in JS return signed 32-bit ints; using `& 0xffffffff`
      // can yield negative numbers and break shuffles/indices (producing undefined
      // cells). Keep it unsigned in [0, 1).
      return s / 4294967296;
    };
  }

  function computeCandidates(grid, r, c) {
    if (grid[rcToIdx(r, c)] !== 0) return [];

    var used = {};
    var i;
    for (i = 0; i < 9; i++) {
      used[grid[rcToIdx(r, i)]] = true;
      used[grid[rcToIdx(i, c)]] = true;
    }
    var br = Math.floor(r / 3) * 3;
    var bc = Math.floor(c / 3) * 3;
    for (var rr = br; rr < br + 3; rr++) {
      for (var cc = bc; cc < bc + 3; cc++) {
        used[grid[rcToIdx(rr, cc)]] = true;
      }
    }
    var out = [];
    for (i = 1; i <= 9; i++) if (!used[i]) out.push(i);
    return out;
  }

  function findBestEmptyCell(grid) {
    var bestIdx = -1;
    var bestCount = 10;
    for (var idx = 0; idx < 81; idx++) {
      if (grid[idx] !== 0) continue;
      var rc = idxToRC(idx);
      var candidates = computeCandidates(grid, rc.r, rc.c);
      if (candidates.length < bestCount) {
        bestCount = candidates.length;
        bestIdx = idx;
        if (bestCount <= 1) break;
      }
    }
    return bestIdx;
  }

  function solveOne(grid, rng) {
    var work = cloneGrid(grid);
    function dfs() {
      var idx = findBestEmptyCell(work);
      if (idx === -1) return true;
      var rc = idxToRC(idx);
      var candidates = computeCandidates(work, rc.r, rc.c);
      if (candidates.length === 0) return false;
      // Randomize order
      if (rng) {
        for (var i = candidates.length - 1; i > 0; i--) {
          var j = Math.floor(rng() * (i + 1));
          var t = candidates[i];
          candidates[i] = candidates[j];
          candidates[j] = t;
        }
      }
      for (var k = 0; k < candidates.length; k++) {
        work[idx] = candidates[k];
        if (dfs()) return true;
        work[idx] = 0;
      }
      return false;
    }
    if (!dfs()) return null;
    return work;
  }

  function countSolutions(grid, limit) {
    var work = cloneGrid(grid);
    var count = 0;
    function dfs() {
      if (count >= limit) return;
      var idx = findBestEmptyCell(work);
      if (idx === -1) {
        count++;
        return;
      }
      var rc = idxToRC(idx);
      var candidates = computeCandidates(work, rc.r, rc.c);
      if (candidates.length === 0) return;
      for (var k = 0; k < candidates.length; k++) {
        work[idx] = candidates[k];
        dfs();
        work[idx] = 0;
        if (count >= limit) return;
      }
    }
    dfs();
    return count;
  }

  function generateSolved(seed) {
    var rng = makeRng(seed);
    var empty = [];
    for (var i = 0; i < 81; i++) empty.push(0);
    // Fill a random first row to speed up variety.
    var first = shuffledDigits(rng);
    for (i = 0; i < 9; i++) empty[i] = first[i];
    return solveOne(empty, rng);
  }

  function difficultyToClues(diff) {
    // More clues => easier.
    if (diff === 1) return 45;
    if (diff === 2) return 38;
    if (diff === 3) return 32;
    if (diff === 4) return 28;
    return 24; // diff 5
  }

  function makePuzzleFromSolution(solution, diff, seed) {
    var rng = makeRng(seed ^ 0x9e3779b9);
    var puzzle = cloneGrid(solution);
    var targetClues = difficultyToClues(diff);
    var toRemove = 81 - targetClues;

    // Random removal order
    var order = [];
    for (var i = 0; i < 81; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = order[i];
      order[i] = order[j];
      order[j] = t;
    }

    var removed = 0;
    var tries = 0;
    var maxTries = 1200;
    for (var p = 0; p < order.length && removed < toRemove && tries < maxTries; p++) {
      var idx = order[p];
      if (puzzle[idx] === 0) continue;
      var backup = puzzle[idx];
      puzzle[idx] = 0;
      tries++;

      // Keep unique solution.
      var solutions = countSolutions(puzzle, 2);
      if (solutions !== 1) {
        puzzle[idx] = backup;
        continue;
      }
      removed++;
    }

    return puzzle;
  }

  function isValidPlacement(grid, r, c, val) {
    if (val === 0) return true;
    for (var i = 0; i < 9; i++) {
      if (i !== c && grid[rcToIdx(r, i)] === val) return false;
      if (i !== r && grid[rcToIdx(i, c)] === val) return false;
    }
    var br = Math.floor(r / 3) * 3;
    var bc = Math.floor(c / 3) * 3;
    for (var rr = br; rr < br + 3; rr++) {
      for (var cc = bc; cc < bc + 3; cc++) {
        if (rr === r && cc === c) continue;
        if (grid[rcToIdx(rr, cc)] === val) return false;
      }
    }
    return true;
  }

  function isSolved(puzzle, solution) {
    for (var i = 0; i < 81; i++) {
      if (puzzle[i] !== solution[i]) return false;
    }
    return true;
  }

  window.SudokuEngine = {
    generateSolved: generateSolved,
    makePuzzleFromSolution: makePuzzleFromSolution,
    solveOne: solveOne,
    isValidPlacement: isValidPlacement,
    isSolved: isSolved,
    rcToIdx: rcToIdx,
    idxToRC: idxToRC,
    boxIndex: boxIndex
  };
})();
