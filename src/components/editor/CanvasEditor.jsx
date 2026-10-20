'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { ASPECT_RATIOS, ratioDims } from '@/lib/geometry';
import { ARTIFACTS } from '@/lib/presets';
import { analyzeFrame } from '@/lib/editor/health';
import { planMagicResize } from '@/lib/editor/magic-resize';
import Icon from '@/components/Icon';
import { Alert, Button, IconButton, cx, useToast } from '@/components/ui';
import {
  EXTRA_PROPS,
  defaultLayerName,
  isActiveSelection,
  isGroupLike,
  isText,
  layerKind,
  loadFabric,
  loadFabricExtensions,
} from './fabric-setup';
import * as ops from './operations';
import {
  badgeGeometry,
  collectCredits,
  cutoutGeometry,
  describeScene,
  exportFrameDataUrl,
  renderJsonToFrame,
  resizeItems,
} from './scene';
import MediaLibrary from './MediaLibrary';
import { HealthPanel, Inspector, LayerPanel, ToolPanel } from './panels';
import { MagicResizeDialog, PreviewDialog, SafeZoneOverlay, SAFE_ZONES, ShortcutsDialog } from './dialogs';

const HISTORY_LIMIT = 60; // ED-8
const AUTOSAVE_MS = 30000; // ED-13
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];

let layerKeySeq = 0;

/**
 * The canvas editor.
 *
 * Fabric renders at display size and zooms into the 1080-px design space, so
 * handles stay a constant, touchable size and the browser paints a quarter of
 * the pixels a full-resolution, CSS-shrunk canvas would; the frame is still
 * exported at full resolution.
 *
 * Beyond the basics (layers, undo, text, shapes, artwork) it adds:
 *   - a Wikimedia Commons media library with automatic licence credits,
 *   - smart guides and snapping, alignment and distribution,
 *   - platform safe-zone overlays,
 *   - the Frame Health Check (legibility and licence linting with fixes),
 *   - Magic Resize to every other social format,
 *   - a preview drawn by the participants' own compositor.
 */
export default function CanvasEditor({ template, campaign }) {
  const editable = template.editable !== false;

  const viewportRef = useRef(null);
  const canvasElRef = useRef(null);
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const baseRef = useRef(null);
  const guidesRef = useRef(null);
  const guideRectsRef = useRef(null);
  const historyRef = useRef({ stack: [], index: -1, suspended: false, timer: null });
  const clipboardRef = useRef(null);
  const changesRef = useRef(0);
  const latest = useRef({});

  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState(template.aspectRatio);
  const [name, setName] = useState(template.name);
  const [userZoom, setUserZoom] = useState(1);
  const [fitScale, setFitScale] = useState(0.4);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [leftTab, setLeftTab] = useState('elements');
  const [rightTab, setRightTab] = useState('design');
  const [health, setHealth] = useState(null);
  const [snapOn, setSnapOn] = useState(true);
  const [zone, setZone] = useState('none');
  const [dialog, setDialog] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [toast, setToast] = useToast();

  const dims = ratioDims(ratio);
  const scale = fitScale * userZoom;
  latest.current = { name, ratio, dims, dirty, saving };

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // ── history ───────────────────────────────────────────────────────────────

  const serialize = useCallback(() => {
    const canvas = canvasRef.current;
    return JSON.stringify({ ratio: latest.current.ratio, fabric: canvas.toObject(EXTRA_PROPS) });
  }, []);

  const snapshotNow = useCallback(() => {
    const h = historyRef.current;
    clearTimeout(h.timer);
    h.timer = null;
    if (h.suspended || !canvasRef.current) return;
    const json = serialize();
    if (json === h.stack[h.index]) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
    bump();
  }, [serialize, bump]);

  const markChanged = useCallback(() => {
    const h = historyRef.current;
    if (h.suspended) return;
    changesRef.current += 1;
    setDirty(true);
    clearTimeout(h.timer);
    // Coalesce drags and slider scrubs into one undo step.
    h.timer = setTimeout(snapshotNow, 250);
    bump();
  }, [snapshotNow, bump]);

  const restore = useCallback(
    async (entry) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const h = historyRef.current;
      const { ratio: savedRatio, fabric } = JSON.parse(entry);
      h.suspended = true;
      try {
        await canvas.loadFromJSON(fabric);
        if (baseRef.current) canvas.insertAt(0, baseRef.current);
        if (!editable) canvas.backgroundColor = '';
        if (savedRatio && savedRatio !== latest.current.ratio) setRatio(savedRatio);
        canvas.requestRenderAll();
      } finally {
        h.suspended = false;
      }
      changesRef.current += 1;
      setDirty(true);
      bump();
    },
    [editable, bump]
  );

  const undo = useCallback(async () => {
    const h = historyRef.current;
    if (h.timer) snapshotNow();
    if (h.index <= 0) return;
    h.index -= 1;
    await restore(h.stack[h.index]);
  }, [restore, snapshotNow]);

  const redo = useCallback(async () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    await restore(h.stack[h.index]);
  }, [restore]);

  // ── boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let disposed = false;
    let canvas;

    (async () => {
      // Fabric touches `window` at import time, so it can only be loaded in the
      // browser — hence the dynamic import rather than a top-level one.
      const fabric = await loadFabric();
      if (disposed) return;
      fabricRef.current = fabric;

      const d = ratioDims(template.aspectRatio);
      const saved = template.canvasJson || {};
      canvas = new fabric.Canvas(canvasElRef.current, {
        width: Math.round(d.w * 0.4),
        height: Math.round(d.h * 0.4),
        backgroundColor: editable ? saved.background || '#ffffff' : '',
        preserveObjectStacking: true,
        selection: true,
        controlsAboveOverlay: true,
        stopContextMenu: true,
        targetFindTolerance: 6,
      });
      canvas.setZoom(0.4);
      canvasRef.current = canvas;

      try {
        if (saved.fabric) {
          await canvas.loadFromJSON(saved.fabric);
          if (editable) canvas.backgroundColor = saved.fabric.background || saved.background || '#ffffff';
        } else if (editable) {
          await seedStarter(fabric, canvas, saved, d);
        } else {
          canvas.add(ops.createBadgeZone(fabric, d, saved.badge));
        }
      } catch (err) {
        console.error('[editor] could not load the design', err);
        setError('Part of this design could not be loaded. Saving will keep whatever is shown.');
      }

      // A finished frame (upload or Commons) is edited on top of its original
      // artwork, which is kept on the server as the template's base.
      if (!editable) {
        canvas.backgroundColor = '';
        const baseId = saved.baseFrameAssetId || template.frameAssetId;
        if (baseId) {
          try {
            const base = await ops.createBaseLayer(fabric, d, `/api/v1/assets/${baseId}`);
            if (disposed) return;
            baseRef.current = base;
            canvas.insertAt(0, base);
          } catch {
            setError('The frame artwork could not be loaded.');
          }
        }
      }

      // Older templates stored the badge colours only in canvasJson.badge.
      const zoneLayer = canvas.getObjects().find((o) => o.wfRole === 'badge');
      if (zoneLayer && !zoneLayer.wfBadgeBackground && saved.badge?.background) {
        zoneLayer.set({ wfBadgeBackground: saved.badge.background, wfBadgeColor: saved.badge.color || '#ffffff' });
      }
      if (zoneLayer) ops.paintBadgeZone(zoneLayer);

      canvas.requestRenderAll();

      const onChange = () => markChanged();
      canvas.on('object:added', onChange);
      canvas.on('object:removed', onChange);
      canvas.on('object:modified', onChange);
      canvas.on('text:changed', onChange);
      let frame = 0;
      const live = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(bump);
      };
      canvas.on('object:moving', live);
      canvas.on('object:scaling', live);
      canvas.on('object:rotating', live);
      canvas.on('selection:created', bump);
      canvas.on('selection:updated', bump);
      canvas.on('selection:cleared', bump);

      historyRef.current = { stack: [serialize()], index: 0, suspended: false, timer: null };

      const frameRect = new fabric.Rect({ left: 0, top: 0, width: d.w, height: d.h, strokeWidth: 0 });
      const safeRect = new fabric.Rect({ left: d.w * 0.05, top: d.h * 0.05, width: d.w * 0.9, height: d.h * 0.9, strokeWidth: 0 });
      guideRectsRef.current = { frameRect, safeRect };

      setReady(true);
      bump();
    })();

    return () => {
      disposed = true;
      guidesRef.current?.dispose();
      guidesRef.current = null;
      canvas?.dispose();
      canvasRef.current = null;
    };
    // Boot once; ratio and zoom changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the canvas to the space available, and follow window resizes.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const { w, h } = latest.current.dims;
      const availW = Math.max(200, el.clientWidth - 48);
      const availH = Math.max(240, Math.min(window.innerHeight - 220, 980));
      setFitScale(Math.min(availW / w, availH / h, 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ratio]);

  // Apply zoom and dimensions to Fabric.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    canvas.setDimensions({ width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) });
    canvas.setZoom(scale);
    const rects = guideRectsRef.current;
    if (rects) {
      rects.frameRect.set({ width: dims.w, height: dims.h }).setCoords();
      rects.safeRect.set({ left: dims.w * 0.05, top: dims.h * 0.05, width: dims.w * 0.9, height: dims.h * 0.9 }).setCoords();
    }
    canvas.requestRenderAll();
  }, [ready, scale, dims.w, dims.h]);

  // Smart guides: snap to other layers, the frame's edges and centre, and the
  // safe margin — Fabric's own aligning-guidelines extension.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || !snapOn) return undefined;
    let cancelled = false;
    loadFabricExtensions().then(({ AligningGuidelines }) => {
      if (cancelled || !canvasRef.current) return;
      const { frameRect, safeRect } = guideRectsRef.current;
      // While Fabric exports (toCanvasElement) it detaches the top context;
      // the extension's render hooks must then do nothing, or they throw
      // mid-export and leave the canvas with the export's viewport.
      class ExportSafeGuidelines extends AligningGuidelines {
        beforeRender() {
          if (this.canvas.contextTop) super.beforeRender();
        }

        afterRender() {
          if (this.canvas.contextTop) super.afterRender();
        }
      }
      guidesRef.current = new ExportSafeGuidelines(canvas, {
        margin: 6,
        width: 1,
        color: '#d73333',
        getObjectsByTarget(target) {
          const moving = new Set(isActiveSelection(target) ? target.getObjects() : [target]);
          const set = new Set();
          for (const o of canvas.getObjects()) {
            if (!moving.has(o) && o.visible !== false) set.add(o);
          }
          set.add(frameRect);
          set.add(safeRect);
          return set;
        },
      });
    });
    return () => {
      cancelled = true;
      guidesRef.current?.dispose();
      guidesRef.current = null;
    };
  }, [ready, snapOn]);

  // ── the Frame Health Check runs quietly after every change ────────────────

  const runHealth = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const scene = describeScene(canvas, { dims: latest.current.dims, aspectRatio: latest.current.ratio, editable });
    const report = analyzeFrame(scene, { palette: ops.WIKI_PALETTE });
    setHealth(report);
    return report;
  }, [editable]);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(runHealth, 700);
    return () => clearTimeout(timer);
  }, [ready, version, ratio, runHealth]);

  // ── save ──────────────────────────────────────────────────────────────────

  const save = useCallback(
    async ({ silent } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || latest.current.saving) return;
      const { name: currentName, ratio: currentRatio, dims: d } = latest.current;
      const startedAt = changesRef.current;
      setSaving(true);
      setError(null);
      try {
        const report = runHealth();
        // ED-10: the layer state is stored whole and never flattened, so
        // editing can resume at any time. The flat PNG is an additional
        // artefact, not a replacement.
        await api.patch(`/templates/${template.id}`, {
          name: currentName,
          aspectRatio: currentRatio,
          canvasJson: {
            background: editable ? canvas.backgroundColor || '#ffffff' : 'transparent',
            fabric: canvas.toObject(EXTRA_PROPS),
            cutout: editable ? cutoutGeometry(canvas, d) : undefined,
            badge: badgeGeometry(canvas, d, template.canvasJson?.badge),
            credits: collectCredits(canvas),
            health: report
              ? { errors: report.errors, warnings: report.warnings, score: report.score, checkedAt: new Date().toISOString() }
              : undefined,
          },
        });
        await api.post(`/templates/${template.id}/frame`, { dataUrl: exportFrameDataUrl(canvas, d) });
        // Edits made while the save was in flight are still unsaved.
        setDirty(changesRef.current !== startedAt);
        if (!silent) setToast('Template saved.');
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [editable, runHealth, setToast, template.canvasJson?.badge, template.id]
  );

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const timer = setInterval(() => {
      if (latest.current.dirty && !latest.current.saving) saveRef.current({ silent: true });
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  // ED-13: unsaved-changes warning on exit.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── operations ────────────────────────────────────────────────────────────

  const withCanvas = useCallback((fn) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return undefined;
    const result = fn(canvas, fabric);
    canvas.requestRenderAll();
    return result;
  }, []);

  const addAndSelect = useCallback((canvas, obj) => {
    canvas.add(obj);
    canvas.setActiveObject(obj);
  }, []);

  const editor = {
    get active() {
      return canvasRef.current?.getActiveObject() || null;
    },
    get background() {
      return typeof canvasRef.current?.backgroundColor === 'string' ? canvasRef.current.backgroundColor : '';
    },
    layers: [],

    addText: () => withCanvas((c, f) => addAndSelect(c, ops.createText(f, dims))),
    addShape: (kind) => withCanvas((c, f) => addAndSelect(c, ops.createShape(f, dims, kind))),
    async addArtifact(artifact, color) {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      addAndSelect(canvas, await ops.createArtifact(fabric, dims, artifact, color));
      canvas.requestRenderAll();
    },
    setCutout(shape) {
      withCanvas((c, f) => {
        const existing = c.getObjects().find((o) => o.wfRole === 'cutout');
        const geometry = existing ? cutoutGeometry(c, dims) : undefined;
        const index = existing ? c.getObjects().indexOf(existing) : c.getObjects().length;
        if (existing) c.remove(existing);
        const next = ops.createCutout(f, dims, shape, geometry && { ...geometry, radius: shape === 'rounded' ? geometry.radius || 40 : 0 });
        c.insertAt(index, next);
        c.setActiveObject(next);
      });
    },
    addBadgeZone() {
      withCanvas((c, f) => {
        const existing = c.getObjects().find((o) => o.wfRole === 'badge');
        if (existing) {
          existing.set({ visible: true });
          c.setActiveObject(existing);
          setToast('This template already has a badge zone — selected it for you.');
          return;
        }
        addAndSelect(c, ops.createBadgeZone(f, dims, template.canvasJson?.badge));
      });
    },
    setBackground(color) {
      withCanvas((c) => {
        c.backgroundColor = color;
      });
      markChanged();
    },
    apply(patch) {
      withCanvas((c) => {
        const obj = c.getActiveObject();
        if (!obj) return;
        obj.set(patch);
        obj.setCoords();
        c.fire('object:modified', { target: obj });
      });
    },
    setShadow(on) {
      withCanvas((c, f) => {
        const obj = c.getActiveObject();
        if (!obj) return;
        obj.set({ shadow: on ? new f.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 18, offsetX: 0, offsetY: 6 }) : null });
        c.fire('object:modified', { target: obj });
      });
    },
    setBox({ x, y, w, h }) {
      withCanvas((c) => {
        const obj = c.getActiveObject();
        if (!obj || obj.wfLocked) return;
        const r = obj.getBoundingRect();
        if (w && r.width) obj.set({ scaleX: obj.scaleX * (w / r.width) });
        if (h && r.height) obj.set({ scaleY: obj.scaleY * (h / r.height) });
        obj.setCoords();
        const after = obj.getBoundingRect();
        ops.moveBoxTo(obj, x ?? after.left, y ?? after.top);
        c.fire('object:modified', { target: obj });
      });
    },
    align(how) {
      withCanvas((c) => ops.alignSelection(c, dims, how) && markChanged());
    },
    distribute(axis) {
      withCanvas((c) => {
        if (ops.distributeSelection(c, axis)) markChanged();
        else setToast('Select three or more layers to distribute them.');
      });
    },
    duplicate() {
      const canvas = canvasRef.current;
      const obj = canvas?.getActiveObject();
      if (!obj || obj.wfRole === 'cutout' || obj.wfRole === 'base' || obj.wfRole === 'badge') return;
      obj.clone(EXTRA_PROPS).then((clone) => {
        clone.set({ left: obj.left + 24, top: obj.top + 24 });
        if (isActiveSelection(clone)) {
          clone.canvas = canvas;
          clone.forEachObject((child) => canvas.add(child));
          clone.setCoords();
        } else {
          canvas.add(clone);
        }
        canvas.setActiveObject(clone);
        canvas.requestRenderAll();
      });
    },
    remove() {
      withCanvas((c) => {
        const targets = c.getActiveObjects().filter((o) => o.wfRole !== 'base');
        c.discardActiveObject();
        targets.forEach((o) => c.remove(o));
      });
    },
    toggleLock() {
      withCanvas((c) => {
        const obj = c.getActiveObject();
        if (!obj) return;
        setLocked(obj, !obj.wfLocked);
        if (obj.wfLocked) c.discardActiveObject();
        markChanged();
      });
    },
    group() {
      withCanvas((c, f) => {
        const sel = c.getActiveObject();
        if (!isActiveSelection(sel)) return;
        const objects = sel.getObjects().filter((o) => !['cutout', 'badge', 'base'].includes(o.wfRole));
        if (objects.length < 2) {
          setToast('The cutout and badge zone stay on their own — select two other layers to group.');
          return;
        }
        c.discardActiveObject();
        c.remove(...objects);
        const group = new f.Group(objects, { originX: 'left', originY: 'top', wfRole: 'group', wfName: 'Group' });
        addAndSelect(c, group);
      });
    },
    ungroup() {
      withCanvas((c, f) => {
        const group = c.getActiveObject();
        if (!isGroupLike(group)) return;
        const index = c.getObjects().indexOf(group);
        const objects = group.removeAll();
        c.remove(group);
        objects.forEach((o, i) => c.insertAt(index + i, o));
        c.setActiveObject(new f.ActiveSelection(objects, { canvas: c }));
      });
    },

    // Layer panel
    selectLayer(index) {
      withCanvas((c) => {
        const obj = c.getObjects()[index];
        if (obj && !obj.wfLocked && obj.selectable !== false) c.setActiveObject(obj);
      });
      bump();
    },
    toggleLayer(index, key) {
      withCanvas((c) => {
        const obj = c.getObjects()[index];
        if (!obj) return;
        if (key === 'visible') obj.set({ visible: obj.visible === false });
        if (key === 'locked') {
          setLocked(obj, !obj.wfLocked);
          if (obj.wfLocked && c.getActiveObjects().includes(obj)) c.discardActiveObject();
        }
        c.fire('object:modified', { target: obj });
      });
    },
    rename(index, value) {
      withCanvas((c) => {
        const obj = c.getObjects()[index];
        if (!obj) return;
        obj.set({ wfName: String(value).trim().slice(0, 60) || defaultLayerName(obj) });
        markChanged();
      });
    },
    reorderLayer(index, direction) {
      withCanvas((c) => {
        const obj = c.getObjects()[index];
        if (!obj || obj.wfRole === 'base') return;
        ops.reorder(c, obj, direction);
        markChanged();
      });
    },
    moveLayer(from, to) {
      withCanvas((c) => {
        const obj = c.getObjects()[from];
        if (!obj || obj.wfRole === 'base') return;
        const floor = baseRef.current ? 1 : 0;
        c.moveObjectTo(obj, Math.max(floor, to));
        markChanged();
      });
    },
  };

  editor.layers = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    const selected = new Set(canvas.getActiveObjects());
    return canvas
      .getObjects()
      .map((obj, index) => {
        obj.__wfKey ??= `layer-${++layerKeySeq}`;
        const kind = layerKind(obj);
        const named = obj.wfName && !(kind === 'text' && obj.wfName === 'Text');
        return {
          key: obj.__wfKey,
          index,
          kind,
          name: named ? obj.wfName : defaultLayerName(obj),
          visible: obj.visible !== false,
          locked: Boolean(obj.wfLocked),
          fixed: obj.wfRole === 'base',
          selected: selected.has(obj),
        };
      })
      .reverse(); // topmost layer first, as designers expect
    // `version` is the change signal for the live canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready]);

  function nudge(dx, dy) {
    withCanvas((c) => {
      const obj = c.getActiveObject();
      if (!obj || obj.wfLocked) return;
      obj.set({ left: obj.left + dx, top: obj.top + dy });
      obj.setCoords();
      c.fire('object:modified', { target: obj });
    });
  }

  function copy() {
    const obj = canvasRef.current?.getActiveObject();
    if (!obj || ['cutout', 'base', 'badge'].includes(obj.wfRole)) return;
    obj.clone(EXTRA_PROPS).then((clone) => {
      clipboardRef.current = clone;
    });
  }

  async function paste() {
    const canvas = canvasRef.current;
    const source = clipboardRef.current;
    if (!canvas || !source) return;
    const clone = await source.clone(EXTRA_PROPS);
    canvas.discardActiveObject();
    clone.set({ left: clone.left + 24, top: clone.top + 24, evented: true });
    if (isActiveSelection(clone)) {
      clone.canvas = canvas;
      clone.forEachObject((obj) => canvas.add(obj));
      clone.setCoords();
    } else {
      canvas.add(clone);
    }
    source.set({ left: source.left + 24, top: source.top + 24 });
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
  }

  function selectAll() {
    withCanvas((c, f) => {
      const objects = c.getObjects().filter((o) => !o.wfLocked && o.selectable !== false && o.visible !== false);
      c.discardActiveObject();
      if (objects.length === 1) c.setActiveObject(objects[0]);
      if (objects.length > 1) c.setActiveObject(new f.ActiveSelection(objects, { canvas: c }));
    });
  }

  function zoomBy(direction) {
    setUserZoom((z) => {
      const i = ZOOM_STEPS.findIndex((s) => s >= z - 0.001);
      const next = direction > 0 ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, i + 1)] : ZOOM_STEPS[Math.max(0, i - 1)];
      return next;
    });
  }

  /** ED-9: switching ratio re-lays the design out (Magic Resize, in place). */
  function changeRatio(next) {
    const canvas = canvasRef.current;
    if (!canvas || next === ratio) return;
    if (!editable) {
      setToast('A finished frame cannot change shape. Upload a version at the other ratio instead.');
      return;
    }
    const plan = planMagicResize(resizeItems(canvas), dims, ratioDims(next));
    canvas.getObjects().forEach((obj, i) => {
      obj.set(plan[i]);
      obj.setCoords();
    });
    latest.current.ratio = next;
    setRatio(next);
    markChanged();
    setToast(`Re-laid out for ${next} — check everything is where you want it.`);
  }

  // ── images: Commons, upload, paste and drop ───────────────────────────────

  async function importImage(body, nameHint) {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    const res = await api.post('/assets/import', body);
    const title = res.attribution?.title?.replace(/\.[a-z0-9]{2,5}$/i, '') || nameHint || 'Image';
    const img = await ops.createImage(fabric, latest.current.dims, {
      url: res.asset.url,
      assetId: res.asset.id,
      name: title,
      attribution: res.attribution,
    });
    addAndSelect(canvas, img);
    canvas.requestRenderAll();
    return res;
  }

  async function insertFromCommons({ commons }) {
    setImporting(true);
    setError(null);
    try {
      const res = await importImage({ commons });
      setToast(
        res.attribution?.attributionRequired === false
          ? 'Image added.'
          : 'Image added — its licence asks for credit. The Health Check can add a credit line.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function uploadFiles(files) {
    const images = files.filter((f) => /^image\//.test(f.type)).slice(0, 6);
    if (!images.length) return;
    setImporting(true);
    setError(null);
    try {
      for (const file of images) {
        const data = new FormData();
        data.append('file', file);
        await importImage(data, file.name.replace(/\.[^.]+$/, ''));
      }
      setToast(images.length === 1 ? 'Image added.' : `${images.length} images added.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // ── keyboard, clipboard and drop ──────────────────────────────────────────

  useEffect(() => {
    function typingInField(target) {
      const tag = target?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
    }

    function onKeyDown(event) {
      if (typingInField(event.target) || dialog) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (active?.isEditing) return; // typing inside a text layer
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') return run(event, event.shiftKey ? redo : undo);
      if (mod && key === 'y') return run(event, redo);
      if (mod && key === 's') return run(event, () => saveRef.current());
      if (mod && key === 'd') return run(event, editor.duplicate);
      if (mod && key === 'c') return copy();
      if (mod && key === 'a') return run(event, selectAll);
      if (mod && key === 'g') return run(event, event.shiftKey ? editor.ungroup : editor.group);
      if (mod && (key === '=' || key === '+')) return run(event, () => zoomBy(1));
      if (mod && key === '-') return run(event, () => zoomBy(-1));
      if (mod && key === '0') return run(event, () => setUserZoom(1));
      if (mod && (event.key === ']' || event.key === '}')) {
        return run(event, () => editor.reorderLayer(canvas.getObjects().indexOf(active), event.shiftKey ? 'front' : 'forward'));
      }
      if (mod && (event.key === '[' || event.key === '{')) {
        return run(event, () => editor.reorderLayer(canvas.getObjects().indexOf(active), event.shiftKey ? 'back' : 'backward'));
      }
      if (!mod && event.key === '?') return run(event, () => setDialog('shortcuts'));
      if (event.key === 'Escape') return run(event, () => withCanvas((c) => c.discardActiveObject()));
      if (!active) return undefined;
      if (event.key === 'Delete' || event.key === 'Backspace') return run(event, editor.remove);

      const step = event.shiftKey ? 10 : 1;
      const moves = { arrowup: [0, -step], arrowdown: [0, step], arrowleft: [-step, 0], arrowright: [step, 0] };
      if (moves[key]) return run(event, () => nudge(...moves[key]));
      return undefined;
    }

    function run(event, fn) {
      event.preventDefault();
      fn();
    }

    function onPaste(event) {
      if (typingInField(event.target) || dialog) return;
      const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      event.preventDefault();
      if (files.length) uploadFiles(files);
      else paste();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  });

  // ── dialogs ───────────────────────────────────────────────────────────────

  function openPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPreview({
      frameUrl: exportFrameDataUrl(canvas, dims),
      cutout: editable ? cutoutGeometry(canvas, dims) : template.canvasJson?.cutout,
      badge: badgeGeometry(canvas, dims, template.canvasJson?.badge),
    });
    setDialog('preview');
  }

  async function runMagicResize(targets) {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return [];
    if (latest.current.dirty) await saveRef.current({ silent: true });

    const source = canvas.toObject(EXTRA_PROPS);
    const items = resizeItems(canvas);
    const credits = collectCredits(canvas);
    const results = [];
    for (const target of targets) {
      try {
        const to = ratioDims(target);
        const plan = planMagicResize(items, dims, to);
        const json = structuredClone(source);
        json.objects = json.objects.map((o, i) => ({ ...o, ...plan[i] }));
        const rendered = await renderJsonToFrame(fabric, json, to, template.canvasJson?.badge);
        const res = await api.post('/templates', {
          name: `${name} — ${ASPECT_RATIOS[target].label}`.slice(0, 80),
          aspectRatio: target,
          campaignId: campaign?.id,
          canvasJson: {
            background: canvas.backgroundColor || '#ffffff',
            fabric: json,
            cutout: rendered.cutout,
            badge: rendered.badge,
            credits,
          },
        });
        await api.post(`/templates/${res.template.id}/frame`, { dataUrl: rendered.dataUrl });
        results.push({ ratio: target, ok: true, id: res.template.id });
      } catch (err) {
        results.push({ ratio: target, ok: false, error: err.message });
      }
    }
    return results;
  }

  function applyFix(fix) {
    const changed = withCanvas((c, f) =>
      ops.applyHealthFix(fix, { fabric: f, canvas: c, dims, credits: collectCredits(c) })
    );
    if (changed) {
      markChanged();
      setTimeout(runHealth, 50);
      setToast('Fixed.');
    }
  }

  function selectFromIssue(index) {
    setRightTab('design');
    editor.selectLayer(index);
  }

  // ── render ────────────────────────────────────────────────────────────────

  const issueCount = health ? health.errors + health.warnings : 0;
  const backHref = campaign ? `/dashboard/campaigns/${campaign.id}?step=templates` : '/dashboard/templates';
  const zones = Object.entries(SAFE_ZONES).filter(([, z]) => !z.ratios || z.ratios.includes(ratio));

  return (
    <div className="space-y-3">
      {toast}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-bold text-wiki-blue hover:underline">
            <Icon name="cdxIconArrowPrevious" size="sm" /> {campaign ? campaign.name : 'Templates'}
          </Link>
          <input
            className="mt-1 block w-full max-w-md rounded border border-transparent bg-transparent px-1 font-serif text-2xl hover:border-wiki-line focus:border-wiki-blue focus:outline-none"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              changesRef.current += 1;
              setDirty(true);
            }}
            aria-label="Template name"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-wiki-slate" aria-live="polite">
            <Icon name={saving ? 'cdxIconClock' : dirty ? 'cdxIconEdit' : 'cdxIconCheck'} size="xs" />
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <Button variant="secondary" icon="cdxIconEye" onClick={openPreview} disabled={!ready}>
            Preview
          </Button>
          <a href={`/api/v1/templates/${template.id}/download`} className="wf-btn-secondary">
            <Icon name="cdxIconDownload" size="sm" /> Download
          </a>
          <Button icon="cdxIconCheck" onClick={() => save()} disabled={!ready || saving}>
            Save
          </Button>
        </div>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      {!editable ? (
        <Alert tone="info">
          This template is a finished image, so its artwork cannot be taken apart into layers. Add
          text, images and a badge zone on top — the original artwork is always kept underneath.
        </Alert>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[272px_minmax(0,1fr)_300px]">
        {/* ── left: elements & media ── */}
        <aside className="order-2 space-y-3 lg:order-1" aria-label="Add to the frame">
          <div className="flex border-b border-wiki-line" role="tablist">
            {[
              ['elements', 'Elements', 'wfIconLayers'],
              ['media', 'Media', 'cdxIconImageAdd'],
            ].map(([key, label, icon]) => (
              <button key={key} type="button" role="tab" aria-selected={leftTab === key} onClick={() => setLeftTab(key)} className={cx('wf-tab', leftTab === key && 'wf-tab-active')}>
                <Icon name={icon} size="sm" /> {label}
              </button>
            ))}
          </div>
          {leftTab === 'elements' ? (
            <ToolPanel editor={editor} artifacts={ARTIFACTS} editable={editable} />
          ) : (
            <div className="wf-card p-3">
              <MediaLibrary onInsert={insertFromCommons} onUploadFiles={uploadFiles} busy={importing} />
            </div>
          )}
        </aside>

        {/* ── centre: toolbar & canvas ── */}
        <section className="order-1 min-w-0 space-y-2 lg:order-2" aria-label="Canvas">
          <div className="flex flex-wrap items-center gap-1 rounded border border-wiki-line bg-white px-2 py-1.5" role="toolbar" aria-label="Canvas tools">
            <IconButton icon="cdxIconUndo" label="Undo (Ctrl+Z)" onClick={undo} disabled={!ready || historyRef.current.index <= 0} />
            <IconButton icon="cdxIconRedo" label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!ready || historyRef.current.index >= historyRef.current.stack.length - 1} />
            <span className="mx-1 h-5 w-px bg-wiki-line" />
            <IconButton icon="cdxIconZoomOut" label="Zoom out" onClick={() => zoomBy(-1)} />
            <button type="button" className="w-12 rounded py-1 text-center text-xs tabular-nums text-wiki-slate hover:bg-wiki-paper" onClick={() => setUserZoom(1)} title="Fit to screen (Ctrl+0)">
              {Math.round(scale * 100)}%
            </button>
            <IconButton icon="cdxIconZoomIn" label="Zoom in" onClick={() => zoomBy(1)} />
            <span className="mx-1 h-5 w-px bg-wiki-line" />
            <IconButton icon="wfIconMagnet" label={snapOn ? 'Smart guides on' : 'Smart guides off'} active={snapOn} onClick={() => setSnapOn((s) => !s)} />
            <label className="flex items-center gap-1 text-xs text-wiki-slate">
              <Icon name="wfIconSafeArea" size="sm" />
              <span className="sr-only">Safe zones</span>
              <select className="rounded border border-wiki-line bg-white px-1 py-1 text-xs" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Safe zones">
                {zones.map(([key, z]) => (
                  <option key={key} value={key}>
                    {key === 'none' ? 'Safe zones: off' : z.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="mx-1 h-5 w-px bg-wiki-line" />
            <label className="flex items-center gap-1 text-xs text-wiki-slate">
              <span className="sr-only">Aspect ratio</span>
              <select className="rounded border border-wiki-line bg-white px-1 py-1 text-xs" value={ratio} onChange={(e) => changeRatio(e.target.value)} aria-label="Aspect ratio" disabled={!editable}>
                {Object.entries(ASPECT_RATIOS).map(([value, info]) => (
                  <option key={value} value={value}>
                    {value} {info.label}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="quiet" icon="cdxIconMagicWand" className="min-h-0 px-2 py-1 text-xs" onClick={() => setDialog('resize')} disabled={!ready}>
              Magic resize
            </Button>
            <span className="flex-1" />
            <IconButton icon="cdxIconKeyboard" label="Keyboard shortcuts (?)" onClick={() => setDialog('shortcuts')} />
          </div>

          <div
            ref={viewportRef}
            className={cx(
              'relative flex justify-center overflow-auto rounded border bg-wiki-neutral p-6',
              dropping ? 'border-wiki-blue ring-2 ring-wiki-blue/40' : 'border-wiki-line'
            )}
            style={{ maxHeight: 'calc(100vh - 170px)' }}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes('Files')) {
                e.preventDefault();
                setDropping(true);
              }
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              setDropping(false);
              if (e.dataTransfer.files?.length) {
                e.preventDefault();
                uploadFiles([...e.dataTransfer.files]);
              }
            }}
          >
            <div className="wf-checker relative shrink-0 shadow-float" style={{ width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) }}>
              <canvas ref={canvasElRef} />
              <SafeZoneOverlay zone={zone} dims={dims} />
              {!ready ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-wiki-slate">
                  Loading the editor…
                </div>
              ) : null}
            </div>
          </div>

          <p className="text-center text-[11px] text-wiki-slate">
            {dims.w} × {dims.h} px · drag to move, arrows to nudge (Shift for 10 px), drop or paste images to add them
          </p>
        </section>

        {/* ── right: design & health ── */}
        <aside className="order-3 space-y-3" aria-label="Properties">
          <div className="flex border-b border-wiki-line" role="tablist">
            <button type="button" role="tab" aria-selected={rightTab === 'design'} onClick={() => setRightTab('design')} className={cx('wf-tab', rightTab === 'design' && 'wf-tab-active')}>
              <Icon name="cdxIconPalette" size="sm" /> Design
            </button>
            <button type="button" role="tab" aria-selected={rightTab === 'health'} onClick={() => setRightTab('health')} className={cx('wf-tab', rightTab === 'health' && 'wf-tab-active')}>
              <Icon name="cdxIconUniversalDesign" size="sm" /> Health check
              {issueCount ? (
                <span className={cx('rounded-full px-1.5 text-[10px] font-bold text-white', health?.errors ? 'bg-wiki-error' : 'bg-wiki-warning')}>
                  {issueCount}
                </span>
              ) : null}
            </button>
          </div>
          {rightTab === 'design' ? (
            <>
              <Inspector editor={editor} />
              <LayerPanel editor={editor} />
            </>
          ) : (
            <div className="wf-card p-3">
              <HealthPanel report={health} onFix={applyFix} onSelect={selectFromIssue} onRecheck={runHealth} />
            </div>
          )}
        </aside>
      </div>

      <MagicResizeDialog
        open={dialog === 'resize'}
        onClose={() => setDialog(null)}
        currentRatio={ratio}
        editable={editable}
        inCampaign={Boolean(campaign)}
        onRun={runMagicResize}
      />
      <PreviewDialog
        open={dialog === 'preview'}
        onClose={() => setDialog(null)}
        frameUrl={preview?.frameUrl}
        aspectRatio={ratio}
        cutout={preview?.cutout}
        badge={preview?.badge}
      />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
    </div>
  );
}

function setLocked(obj, locked) {
  obj.set({
    wfLocked: locked,
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
  });
}

/**
 * Builds the starting design for a template created from one of the six
 * platform starters (T2), or a bare cutout for a blank one (T1).
 */
async function seedStarter(fabric, canvas, saved, dims) {
  canvas.backgroundColor = saved?.background || '#ffffff';

  if (saved?.headline) {
    canvas.add(
      ops.createText(fabric, dims, {
        text: saved.headline,
        left: dims.w * 0.1,
        top: dims.h * 0.06,
        width: dims.w * 0.8,
        fontSize: Math.round(Math.min(dims.w, dims.h) * 0.07),
        fontFamily: '"Linux Libertine", Georgia, Times, serif',
        fill: saved.accent || '#ffffff',
        wfName: 'Headline',
      })
    );
  }

  canvas.add(ops.createCutout(fabric, dims, saved?.cutout?.shape === 'rounded' ? 'rounded' : 'circle', saved?.cutout));
  canvas.add(ops.createBadgeZone(fabric, dims, saved?.badge));

  // The starter's decorative artwork, tucked into two corners.
  const decorations = (saved?.artifacts || []).map((key) => ARTIFACTS.find((a) => a.key === key)).filter(Boolean);
  const corners = [
    [0.06, 0.2],
    [0.8, 0.62],
  ];
  for (const [i, artifact] of decorations.slice(0, 2).entries()) {
    const art = await ops.createArtifact(fabric, dims, artifact, saved.accent || '#ffcc33');
    art.set({ left: dims.w * corners[i][0], top: dims.h * corners[i][1], opacity: 0.9 });
    art.setCoords();
    canvas.add(art);
  }

  // Keep the badge zone on top so it is easy to find and move.
  const zone = canvas.getObjects().find((o) => o.wfRole === 'badge');
  if (zone) canvas.bringObjectToFront(zone);
}

// Exported for the page component and tests that only need to know text-ness.
export { isText };
