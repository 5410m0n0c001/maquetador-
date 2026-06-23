// ============================================================
// editor2d.js — Universal Venue Floor Plan Builder
// Primavera Events Group
// Standalone, no ES modules. All globals.
// ============================================================

window.Editor2D = (function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────
  var SCALE = 15;          // pixels per meter
  var GRID_M = 1;          // grid spacing in meters
  var SNAP_M = 0.1;        // snap resolution in meters
  var RULER_SIZE = 24;     // ruler thickness px
  var CHAIR_R_M = 0.18;    // chair radius in meters
  var MIN_ZOOM = 0.2;
  var MAX_ZOOM = 5;

  // ─── Internal state ───────────────────────────────────────
  var _svg = null;
  var _getElements = null;
  var _getState = null;
  var _callbacks = {};

  var _zoom = 1;
  var _panX = RULER_SIZE;
  var _panY = RULER_SIZE;

  var _isDraggingElem = false;
  var _isDraggingPan = false;
  var _panMoved = false;    // tracks if pan dragged > threshold (prevents click-deselect)
  var _dragId = null;
  var _dragOffX = 0;
  var _dragOffY = 0;
  var _panStartX = 0;
  var _panStartY = 0;
  var _panStartPX = 0;
  var _panStartPY = 0;

  var _selectedId = null;
  var _useGrid = true;
  var _terrain = { w: 50, h: 60 };

  // SVG groups
  var _gZoom = null;
  var _gGrid = null;
  var _gBorder = null;
  var _gRulerH = null;
  var _gRulerV = null;
  var _layerGroups = {};

  var _pendingContextId = null;
  var _ctxMenu = null;
  var _inlineEdit = null;

  // ─── Namespace helper ────────────────────────────────────
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  function setAttrs(el, attrs) {
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
  }

  // ─── Coordinate helpers ───────────────────────────────────
  function mToPx(m) { return m * SCALE; }
  function pxToM(px) { return px / SCALE; }

  function snapVal(v) {
    if (!_useGrid) return v;
    return Math.round(v / SNAP_M) * SNAP_M;
  }

  /** Convert SVG-viewport point to terrain meters */
  function svgToMeters(svgX, svgY) {
    var mx = (svgX - _panX) / (_zoom * SCALE);
    var my = (svgY - _panY) / (_zoom * SCALE);
    return { x: mx, y: my };
  }

  /** Get mouse position in SVG coordinate space */
  function getMouseSVG(evt) {
    var rect = _svg.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
  }

  // ─── Color helpers ────────────────────────────────────────
  function lighten(hex, pct) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * pct));
    g = Math.min(255, Math.round(g + (255 - g) * pct));
    b = Math.min(255, Math.round(b + (255 - b) * pct));
    return '#' + [r, g, b].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // ─── Build SVG structure ──────────────────────────────────
  function _buildSVG() {
    _svg.innerHTML = '';

    var defs = svgEl('defs');

    // Grid pattern
    var gridPat = svgEl('pattern', {
      id: 'grid-pattern',
      width: mToPx(GRID_M),
      height: mToPx(GRID_M),
      patternUnits: 'userSpaceOnUse'
    });
    var gridLine1 = svgEl('line', { x1: 0, y1: 0, x2: mToPx(GRID_M), y2: 0, stroke: 'rgba(255,255,255,0.07)', 'stroke-width': 0.5 });
    var gridLine2 = svgEl('line', { x1: 0, y1: 0, x2: 0, y2: mToPx(GRID_M), stroke: 'rgba(255,255,255,0.07)', 'stroke-width': 0.5 });
    gridPat.appendChild(gridLine1);
    gridPat.appendChild(gridLine2);
    defs.appendChild(gridPat);

    // Selection glow filter
    var filter = svgEl('filter', { id: 'sel-glow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    var feGlow = svgEl('feDropShadow', { dx: 0, dy: 0, stdDeviation: 4, 'flood-color': '#f0c040', 'flood-opacity': 0.95 });
    filter.appendChild(feGlow);
    defs.appendChild(filter);

    _svg.appendChild(defs);

    // Background
    var bg = svgEl('rect', {
      id: 'svg-background',
      x: 0, y: 0,
      width: '100%', height: '100%',
      fill: '#0f172a'
    });
    _svg.appendChild(bg);

    // Zoom group
    _gZoom = svgEl('g', { id: 'svg-zoom-group' });

    // Terrain fill
    var terrainFill = svgEl('rect', {
      id: 'terrain-fill',
      x: 0, y: 0,
      width: mToPx(_terrain.w),
      height: mToPx(_terrain.h),
      fill: '#1a2c4a',
      rx: 2,
      cursor: 'grab'
    });
    _gZoom.appendChild(terrainFill);

    // Grid overlay
    _gGrid = svgEl('g', { id: 'svg-grid-overlay' });
    var gridRect = svgEl('rect', {
      x: 0, y: 0,
      width: mToPx(_terrain.w),
      height: mToPx(_terrain.h),
      fill: 'url(#grid-pattern)'
    });
    _gGrid.appendChild(gridRect);
    _gZoom.appendChild(_gGrid);

    // Layer groups (including flow layers)
    var layers = [
      'bg', 'estructuras', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores',
      'flujo_invitados', 'flujo_proveedores', 'flujo_staff'
    ];
    _layerGroups = {};
    layers.forEach(function (lyr) {
      var g = svgEl('g', { id: 'layer-' + lyr, 'data-layer': lyr });
      _layerGroups[lyr] = g;
      _gZoom.appendChild(g);
    });

    _svg.appendChild(_gZoom);

    // Terrain border (on top of zoom group)
    _gBorder = svgEl('g', { id: 'svg-terrain-border' });
    _svg.appendChild(_gBorder);

    // Ruler groups
    _gRulerH = svgEl('g', { id: 'svg-ruler-h' });
    _gRulerV = svgEl('g', { id: 'svg-ruler-v' });
    _svg.appendChild(_gRulerH);
    _svg.appendChild(_gRulerV);

    _applyZoomTransform();
    _drawBorder();
    _drawRulers();
  }

  function _applyZoomTransform() {
    if (!_gZoom) return;
    _gZoom.setAttribute('transform', 'translate(' + _panX + ',' + _panY + ') scale(' + _zoom + ')');
  }

  // ─── Border ───────────────────────────────────────────────
  function _drawBorder() {
    if (!_gBorder) return;
    _gBorder.innerHTML = '';
    var tw = mToPx(_terrain.w) * _zoom;
    var th = mToPx(_terrain.h) * _zoom;
    var bx = _panX;
    var by = _panY;
    var border = svgEl('rect', {
      x: bx, y: by,
      width: tw, height: th,
      fill: 'none',
      stroke: '#c9a96e',
      'stroke-width': 2,
      'stroke-dasharray': '8 4',
      rx: 2,
      'pointer-events': 'none'
    });
    _gBorder.appendChild(border);
  }

  // ─── Rulers ───────────────────────────────────────────────
  function _drawRulers() {
    if (!_gRulerH || !_gRulerV) return;
    _gRulerH.innerHTML = '';
    _gRulerV.innerHTML = '';

    var rulerBg = svgEl('rect', { x: 0, y: 0, width: '100%', height: RULER_SIZE, fill: '#1e293b' });
    _gRulerH.appendChild(rulerBg);
    var rulerBgV = svgEl('rect', { x: 0, y: 0, width: RULER_SIZE, height: '100%', fill: '#1e293b' });
    _gRulerV.appendChild(rulerBgV);

    // Horizontal marks every 5m
    for (var mx = 0; mx <= _terrain.w; mx += 5) {
      var px = _panX + mx * SCALE * _zoom;
      var tick = svgEl('line', { x1: px, y1: RULER_SIZE - 6, x2: px, y2: RULER_SIZE, stroke: '#94a3b8', 'stroke-width': 1 });
      _gRulerH.appendChild(tick);
      var lbl = svgEl('text', { x: px + 2, y: RULER_SIZE - 8, fill: '#94a3b8', 'font-size': 9, 'font-family': 'sans-serif' });
      lbl.textContent = mx + 'm';
      _gRulerH.appendChild(lbl);
    }

    // Vertical marks every 5m
    for (var my = 0; my <= _terrain.h; my += 5) {
      var py = _panY + my * SCALE * _zoom;
      var tickV = svgEl('line', { x1: RULER_SIZE - 6, y1: py, x2: RULER_SIZE, y2: py, stroke: '#94a3b8', 'stroke-width': 1 });
      _gRulerV.appendChild(tickV);
      var lblV = svgEl('text', {
        x: -(py + 2),
        y: RULER_SIZE - 8,
        fill: '#94a3b8',
        'font-size': 9,
        'font-family': 'sans-serif',
        transform: 'rotate(-90)'
      });
      lblV.textContent = my + 'm';
      _gRulerV.appendChild(lblV);
    }
  }

  // ─── Render elements ──────────────────────────────────────
  function _renderElement(elem) {
    var state = _getState ? _getState() : {};
    var layers = state.layers || {};

    // Layer visibility
    var layer = elem.layer || elem.category || 'mobiliario';
    if (layers[layer] === false) return;

    var group = _layerGroups[layer] || _layerGroups['mobiliario'];
    if (!group) return;

    var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
    var shape = (cat && cat.shape) ? cat.shape : 'rect';

    var isSelected = (elem.id === _selectedId);
    var color = elem.color || (cat ? cat.color : '#888888');
    var colorLight = lighten(color, 0.3);
    var px = mToPx(elem.x);
    var py = mToPx(elem.y);
    var pw = mToPx(elem.w || 1);
    var ph = mToPx(elem.h || 1);

    var g = svgEl('g', {
      'data-id': elem.id,
      'class': 'elem-group' + (isSelected ? ' selected' : ''),
      cursor: 'grab'
    });

    if (isSelected) {
      g.setAttribute('filter', 'url(#sel-glow)');
    }

    var rot = elem.rotation || 0;
    g.setAttribute('transform', 'rotate(' + rot + ',' + px + ',' + py + ')');

    // ── Shape rendering ───────────────────────────────────
    if (shape === 'circle') {
      var r = pw / 2;
      var circ = svgEl('circle', {
        cx: px, cy: py, r: r,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.92
      });
      g.appendChild(circ);

      // Chairs
      _appendChairs(g, elem, px, py, r, shape, isSelected);

    } else if (shape === 'square') {
      var srect = svgEl('rect', {
        x: px - pw / 2, y: py - ph / 2,
        width: pw, height: ph,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.92
      });
      g.appendChild(srect);
      _appendChairs(g, elem, px, py, pw / 2, 'square', isSelected);

    } else if (shape === 'dancefloor') {
      var df = svgEl('rect', {
        x: px - pw / 2, y: py - ph / 2,
        width: pw, height: ph,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.88
      });
      g.appendChild(df);
      // Checkerboard pattern
      var tileSize = Math.max(6, Math.min(pw / 5, 20));
      var numX = Math.floor(pw / tileSize);
      var numY = Math.floor(ph / tileSize);
      for (var tx = 0; tx < numX; tx++) {
        for (var ty = 0; ty < numY; ty++) {
          if ((tx + ty) % 2 === 0) {
            var tile = svgEl('rect', {
              x: px - pw / 2 + tx * tileSize,
              y: py - ph / 2 + ty * tileSize,
              width: tileSize, height: tileSize,
              fill: 'rgba(255,255,255,0.08)',
              'pointer-events': 'none'
            });
            g.appendChild(tile);
          }
        }
      }

    } else if (shape === 'door') {
      var doorRect = svgEl('rect', {
        x: px - pw / 2, y: py - ph / 2,
        width: pw, height: Math.max(ph, mToPx(0.3)),
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1
      });
      g.appendChild(doorRect);
      // Door arc
      var arcR = Math.min(pw * 0.4, mToPx(1));
      var arc = svgEl('path', {
        d: 'M ' + (px - pw / 2) + ' ' + (py + ph / 2) + ' A ' + arcR + ' ' + arcR + ' 0 0 1 ' + (px - pw / 2 + arcR) + ' ' + (py + ph / 2 - arcR),
        fill: 'none',
        stroke: colorLight,
        'stroke-width': 1,
        'stroke-dasharray': '3 2',
        'pointer-events': 'none'
      });
      g.appendChild(arc);

    } else if (shape === 'imperial') {
      var tablones = elem.tablones || 3;
      var impRect = svgEl('rect', {
        x: px - pw / 2, y: py - ph / 2,
        width: pw, height: ph,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.92
      });
      g.appendChild(impRect);
      // Tablon dividers
      var tabW = pw / tablones;
      for (var t = 1; t < tablones; t++) {
        var divLine = svgEl('line', {
          x1: px - pw / 2 + t * tabW, y1: py - ph / 2,
          x2: px - pw / 2 + t * tabW, y2: py + ph / 2,
          stroke: colorLight, 'stroke-width': 1, 'stroke-dasharray': '4 2',
          'pointer-events': 'none'
        });
        g.appendChild(divLine);
      }
      // Chairs along long edges
      var chairs = elem.chairs || 30;
      var chairsPerSide = Math.floor(chairs / 2);
      var chairSpacePx = pw / chairsPerSide;
      for (var ci = 0; ci < chairsPerSide; ci++) {
        var chairX = px - pw / 2 + chairSpacePx * (ci + 0.5);
        // Top
        var cTop = svgEl('circle', {
          cx: chairX, cy: py - ph / 2 - mToPx(CHAIR_R_M) - 1,
          r: mToPx(CHAIR_R_M),
          fill: lighten(color, 0.5),
          stroke: 'rgba(255,255,255,0.3)',
          'stroke-width': 0.5,
          'pointer-events': 'none'
        });
        g.appendChild(cTop);
        // Bottom
        var cBot = svgEl('circle', {
          cx: chairX, cy: py + ph / 2 + mToPx(CHAIR_R_M) + 1,
          r: mToPx(CHAIR_R_M),
          fill: lighten(color, 0.5),
          stroke: 'rgba(255,255,255,0.3)',
          'stroke-width': 0.5,
          'pointer-events': 'none'
        });
        g.appendChild(cBot);
      }

    } else if (shape === 'trapezoid') {
      // DJ booth trapezoid
      var inset = pw * 0.15;
      var pts = [
        (px - pw / 2) + ',' + (py + ph / 2),
        (px + pw / 2) + ',' + (py + ph / 2),
        (px + pw / 2 - inset) + ',' + (py - ph / 2),
        (px - pw / 2 + inset) + ',' + (py - ph / 2)
      ].join(' ');
      var trap = svgEl('polygon', {
        points: pts,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.92
      });
      g.appendChild(trap);

    } else if (shape === 'arch') {
      // Arco floral / globos
      var archW = pw;
      var archH = ph;
      var archPath = 'M ' + (px - archW / 2) + ' ' + (py + archH / 2) +
        ' Q ' + px + ' ' + (py - archH * 0.8) + ' ' + (px + archW / 2) + ' ' + (py + archH / 2);
      var archEl = svgEl('path', {
        d: archPath,
        fill: 'none',
        stroke: color,
        'stroke-width': Math.max(ph * 0.4, 6),
        'stroke-linecap': 'round',
        opacity: 0.85
      });
      g.appendChild(archEl);

    } else if (shape === 'flow') {
      // Flow paths are handled separately
      return;

    } else {
      // Default rect
      var rect = svgEl('rect', {
        x: px - pw / 2, y: py - ph / 2,
        width: pw, height: ph,
        fill: color,
        stroke: isSelected ? '#f0c040' : colorLight,
        'stroke-width': isSelected ? 2 : 1,
        opacity: 0.88
      });
      g.appendChild(rect);

      // Special rect interiors
      if (elem.type === 'salon') {
        // Wall lines inside
        var wallInset = Math.min(pw, ph) * 0.06;
        var innerRect = svgEl('rect', {
          x: px - pw / 2 + wallInset, y: py - ph / 2 + wallInset,
          width: pw - wallInset * 2, height: ph - wallInset * 2,
          fill: 'none',
          stroke: 'rgba(255,255,255,0.1)',
          'stroke-width': 1,
          'pointer-events': 'none'
        });
        g.appendChild(innerRect);
      } else if (elem.type === 'parking') {
        // Parking lines
        var numSpots = Math.floor(pw / mToPx(2.5));
        for (var s = 1; s < numSpots; s++) {
          var sLine = svgEl('line', {
            x1: px - pw / 2 + (pw / numSpots) * s, y1: py - ph / 2,
            x2: px - pw / 2 + (pw / numSpots) * s, y2: py + ph / 2,
            stroke: 'rgba(255,255,255,0.15)',
            'stroke-width': 0.8,
            'pointer-events': 'none'
          });
          g.appendChild(sLine);
        }
      } else if (elem.type === 'dancefloor' || elem.type === 'dancefloor_pixel' || elem.type === 'dancefloor_marble') {
        // already handled above
      }
    }

    // ── Label ─────────────────────────────────────────────
    var labelFontSize = Math.min(Math.max(mToPx(0.5) * _zoom, 7), 13) / _zoom;
    var labelEl = svgEl('text', {
      x: px,
      y: py + (shape === 'arch' ? ph * 0.15 : 0),
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: '#ffffff',
      'font-size': labelFontSize,
      'font-family': 'sans-serif',
      'font-weight': '600',
      'pointer-events': 'none',
      'paint-order': 'stroke',
      stroke: 'rgba(0,0,0,0.7)',
      'stroke-width': 2
    });
    // Shorten long names
    var displayName = elem.name || (cat ? cat.name : elem.type);
    if (displayName.length > 18) displayName = displayName.slice(0, 16) + '…';
    labelEl.textContent = displayName;
    g.appendChild(labelEl);

    // Chair / capacity badge
    if (elem.chairs && elem.chairs > 0 && shape !== 'imperial') {
      var badge = svgEl('text', {
        x: px,
        y: py + labelFontSize * 1.4,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: 'rgba(255,255,255,0.7)',
        'font-size': labelFontSize * 0.8,
        'font-family': 'sans-serif',
        'pointer-events': 'none'
      });
      badge.textContent = elem.chairs + 'p';
      g.appendChild(badge);
    }

    // ── Selection ring ────────────────────────────────────
    if (isSelected) {
      var selR = Math.max(pw, ph) / 2 + 4;
      var selRing = svgEl('circle', {
        cx: px, cy: py, r: selR,
        fill: 'none',
        stroke: '#f0c040',
        'stroke-width': 1.5,
        'stroke-dasharray': '6 3',
        'pointer-events': 'none',
        opacity: 0.8
      });
      g.appendChild(selRing);
    }

    // ── Events ────────────────────────────────────────────
    g.addEventListener('mousedown', function (e) {
      if (e.button === 2) return;
      e.stopPropagation();
      _startDragElem(elem.id, e);
    });
    g.addEventListener('click', function (e) {
      e.stopPropagation();
      _selectElem(elem.id);
    });
    g.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      _startInlineEdit(elem.id, px, py);
    });
    g.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _showContextMenu(elem.id, e.clientX, e.clientY);
    });

    group.appendChild(g);
  }

  function _appendChairs(g, elem, cx, cy, radius, shape, isSelected) {
    var chairs = elem.chairs || 0;
    if (chairs <= 0) return;
    var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
    var color = elem.color || (cat ? cat.color : '#888');
    var tableR = radius;
    var chairGap = mToPx(0.08);
    var chairDist = tableR + chairGap + mToPx(CHAIR_R_M);

    for (var i = 0; i < chairs; i++) {
      var angle = (i / chairs) * 2 * Math.PI - Math.PI / 2;
      var cX = cx + Math.cos(angle) * chairDist;
      var cY = cy + Math.sin(angle) * chairDist;
      var chair = svgEl('circle', {
        cx: cX, cy: cY, r: mToPx(CHAIR_R_M),
        fill: lighten(color, 0.45),
        stroke: 'rgba(255,255,255,0.25)',
        'stroke-width': 0.5,
        'pointer-events': 'none'
      });
      g.appendChild(chair);
    }
  }

  // ─── Public: update all ───────────────────────────────────
  function update(elements) {
    // Clear all layer groups
    Object.keys(_layerGroups).forEach(function (k) {
      _layerGroups[k].innerHTML = '';
    });
    if (!elements) return;
    elements.forEach(function (elem) {
      _renderElement(elem);
    });
  }

  // ─── Select / deselect ────────────────────────────────────
  function select(id) {
    _selectedId = id;
    var state = _getState ? _getState() : {};
    update(state.elements || []);
  }

  function deselect() {
    _selectedId = null;
    var state = _getState ? _getState() : {};
    update(state.elements || []);
  }

  function _selectElem(id) {
    _selectedId = id;
    var state = _getState ? _getState() : {};
    update(state.elements || []);
    if (_callbacks.onSelect) {
      var elem = (state.elements || []).find(function (e) { return e.id === id; });
      if (elem) _callbacks.onSelect(elem);
    }
  }

  // ─── Drag element ─────────────────────────────────────────
  function _startDragElem(id, e) {
    _isDraggingElem = true;
    _dragId = id;
    var ms = getMouseSVG(e);
    var m = svgToMeters(ms.x, ms.y);
    var state = _getState ? _getState() : {};
    var elem = (state.elements || []).find(function (el) { return el.id === id; });
    if (elem) {
      _dragOffX = m.x - elem.x;
      _dragOffY = m.y - elem.y;
    }
    _selectElem(id);
    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup', _onDragUp);
  }

  function _onDragMove(e) {
    if (!_isDraggingElem) return;
    var ms = getMouseSVG(e);
    var m = svgToMeters(ms.x, ms.y);
    var newX = snapVal(m.x - _dragOffX);
    var newY = snapVal(m.y - _dragOffY);
    if (_callbacks.onMove) {
      _callbacks.onMove(_dragId, newX, newY);
    }
  }

  function _onDragUp() {
    _isDraggingElem = false;
    _dragId = null;
    document.removeEventListener('mousemove', _onDragMove);
    document.removeEventListener('mouseup', _onDragUp);
  }

  // ─── Pan ──────────────────────────────────────────────────
  function _startPan(e) {
    _isDraggingPan = true;
    _panMoved = false;
    _panStartX = e.clientX;
    _panStartY = e.clientY;
    _panStartPX = _panX;
    _panStartPY = _panY;
    _svg.style.cursor = 'grabbing';
    document.addEventListener('mousemove', _onPanMove);
    document.addEventListener('mouseup', _onPanUp);
  }

  function _onPanMove(e) {
    if (!_isDraggingPan) return;
    var dx = e.clientX - _panStartX;
    var dy = e.clientY - _panStartY;
    // Mark as moved if drag distance exceeds 3px threshold
    if (!_panMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      _panMoved = true;
    }
    _panX = _panStartPX + dx;
    _panY = _panStartPY + dy;
    _applyZoomTransform();
    _drawBorder();
    _drawRulers();
  }

  function _onPanUp() {
    _isDraggingPan = false;
    _svg.style.cursor = (_getState && _getState().pendingType) ? 'crosshair' : 'grab';
    document.removeEventListener('mousemove', _onPanMove);
    document.removeEventListener('mouseup', _onPanUp);
  }

  // ─── Zoom ─────────────────────────────────────────────────
  function _onWheel(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    var ms = getMouseSVG(e);
    _zoomAt(delta, ms.x, ms.y);
  }

  function _zoomAt(factor, cx, cy) {
    var newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, _zoom * factor));
    var scale = newZoom / _zoom;
    _panX = cx - (cx - _panX) * scale;
    _panY = cy - (cy - _panY) * scale;
    _zoom = newZoom;
    _applyZoomTransform();
    _drawBorder();
    _drawRulers();
  }

  function zoomIn() {
    var rect = _svg.getBoundingClientRect();
    _zoomAt(1.2, rect.width / 2, rect.height / 2);
  }

  function zoomOut() {
    var rect = _svg.getBoundingClientRect();
    _zoomAt(0.8, rect.width / 2, rect.height / 2);
  }

  function resetZoom() {
    var rect = _svg.getBoundingClientRect();
    // Add 100px padding around terrain so elements can be placed outside the plan
    var OUTER_PAD = 100;
    var fw = (rect.width - RULER_SIZE * 2 - OUTER_PAD * 2) / mToPx(_terrain.w);
    var fh = (rect.height - RULER_SIZE * 2 - OUTER_PAD * 2) / mToPx(_terrain.h);
    _zoom = Math.min(fw, fh, 1);
    _panX = RULER_SIZE + ((rect.width - RULER_SIZE) - mToPx(_terrain.w) * _zoom) / 2;
    _panY = RULER_SIZE + ((rect.height - RULER_SIZE) - mToPx(_terrain.h) * _zoom) / 2;
    _applyZoomTransform();
    _drawBorder();
    _drawRulers();
  }

  // ─── Canvas click (placement) ─────────────────────────────
  function _onCanvasClick(e) {
    _hideContextMenu();
    // If pan moved significantly, this was a drag not a click — ignore
    if (_panMoved) { _panMoved = false; return; }
    var state = _getState ? _getState() : {};
    if (state.pendingType) {
      var ms = getMouseSVG(e);
      var m = svgToMeters(ms.x, ms.y);
      var x = snapVal(m.x);
      var y = snapVal(m.y);
      if (_callbacks.onPlaceElement) {
        _callbacks.onPlaceElement(state.pendingType, x, y);
      }
      return;
    }
    // Deselect
    if (!_isDraggingElem) {
      _selectedId = null;
      update(state.elements || []);
      if (_callbacks.onDeselect) _callbacks.onDeselect();
    }
  }

  // ─── Context menu ─────────────────────────────────────────
  function _showContextMenu(id, clientX, clientY) {
    _hideContextMenu();
    _pendingContextId = id;

    var menu = document.createElement('div');
    menu.id = 'editor2d-ctx-menu';
    menu.style.cssText = [
      'position:fixed',
      'left:' + clientX + 'px',
      'top:' + clientY + 'px',
      'background:#1e293b',
      'border:1px solid #334155',
      'border-radius:6px',
      'padding:4px 0',
      'z-index:9000',
      'box-shadow:0 8px 24px rgba(0,0,0,0.5)',
      'min-width:150px',
      'font-family:sans-serif',
      'font-size:13px'
    ].join(';');

    var items = [
      { label: '↻ Rotar 45°',    action: 'rotate' },
      { label: '⧉ Duplicar',     action: 'duplicate' },
      { label: '✕ Eliminar',     action: 'delete', danger: true }
    ];

    items.forEach(function (item) {
      var btn = document.createElement('div');
      btn.style.cssText = 'padding:7px 14px;cursor:pointer;color:' + (item.danger ? '#ef4444' : '#e2e8f0') + ';transition:background 0.15s;';
      btn.textContent = item.label;
      btn.addEventListener('mouseenter', function () { btn.style.background = '#334155'; });
      btn.addEventListener('mouseleave', function () { btn.style.background = ''; });
      btn.addEventListener('click', function () {
        _hideContextMenu();
        if (_callbacks['onContext_' + item.action]) {
          _callbacks['onContext_' + item.action](_pendingContextId);
        }
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    _ctxMenu = menu;

    setTimeout(function () {
      document.addEventListener('click', _hideContextMenu, { once: true });
    }, 10);
  }

  function _hideContextMenu() {
    if (_ctxMenu && _ctxMenu.parentNode) {
      _ctxMenu.parentNode.removeChild(_ctxMenu);
    }
    _ctxMenu = null;
  }

  // ─── Inline edit ──────────────────────────────────────────
  function _startInlineEdit(id, svgX, svgY) {
    if (_inlineEdit && _inlineEdit.parentNode) {
      _inlineEdit.parentNode.removeChild(_inlineEdit);
    }
    var state = _getState ? _getState() : {};
    var elem = (state.elements || []).find(function (e) { return e.id === id; });
    if (!elem) return;

    var rect = _svg.getBoundingClientRect();
    var screenX = rect.left + _panX + svgX * _zoom;
    var screenY = rect.top + _panY + svgY * _zoom - 14;

    var inp = document.createElement('input');
    inp.value = elem.name || '';
    inp.style.cssText = [
      'position:fixed',
      'left:' + screenX + 'px',
      'top:' + screenY + 'px',
      'transform:translate(-50%,-100%)',
      'background:#1e293b',
      'color:#fff',
      'border:1px solid #c9a96e',
      'border-radius:4px',
      'padding:3px 6px',
      'font-size:12px',
      'z-index:8000',
      'min-width:100px'
    ].join(';');

    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (_callbacks.onRename) _callbacks.onRename(id, inp.value);
        inp.remove();
        _inlineEdit = null;
      } else if (e.key === 'Escape') {
        inp.remove();
        _inlineEdit = null;
      }
    });
    inp.addEventListener('blur', function () {
      if (_callbacks.onRename) _callbacks.onRename(id, inp.value);
      if (inp.parentNode) inp.remove();
      _inlineEdit = null;
    });

    document.body.appendChild(inp);
    inp.focus();
    inp.select();
    _inlineEdit = inp;
  }

  // ─── Layer visibility ─────────────────────────────────────
  function setLayerVisibility(layerName, visible) {
    if (_layerGroups[layerName]) {
      _layerGroups[layerName].style.display = visible ? '' : 'none';
    }
  }

  // ─── Terrain ──────────────────────────────────────────────
  function setTerrain(w, h) {
    _terrain = { w: w, h: h };
    _buildSVG();
    var state = _getState ? _getState() : {};
    update(state.elements || []);
    resetZoom();
  }

  // ─── Grid snap ────────────────────────────────────────────
  function setGridSnap(val) {
    _useGrid = !!val;
  }

  // ─── Flow paths (future: polyline drawing) ────────────────
  function addFlowPath(type) {
    // Stub: future implementation for polyline drawing
    console.log('[Editor2D] addFlowPath:', type);
  }

  // ─── Keyboard shortcuts ───────────────────────────────────
  function _onKeyDown(e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_selectedId && _callbacks.onContext_delete) {
        _callbacks.onContext_delete(_selectedId);
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (_selectedId && _callbacks.onContext_rotate) {
        _callbacks.onContext_rotate(_selectedId);
      }
    } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      if (_selectedId && _callbacks.onContext_duplicate) {
        _callbacks.onContext_duplicate(_selectedId);
      }
    } else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (_callbacks.onUndo) _callbacks.onUndo();
    } else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      if (_callbacks.onRedo) _callbacks.onRedo();
    } else if (e.key === 'Escape') {
      if (_callbacks.onDeselect) _callbacks.onDeselect();
      deselect();
    }
  }

  // ─── Init ─────────────────────────────────────────────────
  function init(svgElement, getElements, getState, callbacks) {
    _svg = svgElement;
    _getElements = getElements;
    _getState = getState;
    _callbacks = callbacks || {};

    var state = getState ? getState() : {};
    _terrain = state.terrain || { w: 50, h: 60 };
    _useGrid = (state.useGrid !== undefined) ? state.useGrid : true;

    _buildSVG();

    // SVG events
    _svg.addEventListener('wheel', _onWheel, { passive: false });
    _svg.addEventListener('click', _onCanvasClick);
    _svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    _svg.style.cursor = 'grab'; // default cursor on canvas background

    // Pan: right-click, middle-click, OR left-click on background
    // (element mousedown calls stopPropagation, so only background clicks reach here)
    _svg.addEventListener('mousedown', function (e) {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        _startPan(e);
      } else if (e.button === 0 && !(_getState && _getState().pendingType)) {
        // Left-click on background → pan (elements use stopPropagation so won't reach here)
        _startPan(e);
      }
    });

    document.addEventListener('keydown', _onKeyDown);

    resetZoom();
    update(getElements ? getElements() : []);

    console.log('[Editor2D] Initialized. Terrain:', _terrain.w + 'x' + _terrain.h + 'm');
  }

  function destroy() {
    document.removeEventListener('keydown', _onKeyDown);
    _hideContextMenu();
    if (_inlineEdit && _inlineEdit.parentNode) _inlineEdit.remove();
    if (_svg) _svg.innerHTML = '';
    console.log('[Editor2D] Destroyed.');
  }

  // ─── Public API ───────────────────────────────────────────
  return {
    init: init,
    update: update,
    select: select,
    deselect: deselect,
    setGridSnap: setGridSnap,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    resetZoom: resetZoom,
    setLayerVisibility: setLayerVisibility,
    setTerrain: setTerrain,
    addFlowPath: addFlowPath,
    destroy: destroy,
    // Expose snap helper for app use
    snapToGrid: snapVal
  };
})();

console.log('[editor2d] Editor2D module loaded.');
