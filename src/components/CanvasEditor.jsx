'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Button, cx, useToast } from '@/components/ui';

// ED-9: the full range from portrait story to landscape.
const RATIO_DIMS = {
  '9:16': { w: 1080, h: 1920, label: 'Story / Reel' },
  '4:5': { w: 1080, h: 1350, label: 'Feed portrait' },
  '1:1': { w: 1080, h: 1080, label: 'Square' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape' },
};

// ED-4: curated open-licence font stacks. Every one of these is either a system
// face or an OFL family, so nothing here creates a licensing problem (§23.2).
const FONTS = [
  ['system-ui, sans-serif', 'System sans'],
  ['Georgia, serif', 'Georgia serif'],
  ['"Times New Roman", serif', 'Times serif'],
  ['"Courier New", monospace', 'Monospace'],
  ['Verdana, sans-serif', 'Verdana'],
  ['Impact, sans-serif', 'Impact'],
];

const PALETTE = [
  '#3366cc', '#2a4b8d', '#00af89', '#ffcc33', '#d73333',
  '#6b4ba1', '#202122', '#54595d', '#c8ccd1', '#ffffff',
];

// Custom fields that must survive serialization — they are what tell the render
// pipeline which object is the photo hole and which is the badge zone.
const EXTRA_PROPS = ['wfRole', 'wfName', 'wfShape', 'wfLocked'];

const HISTORY_LIMIT = 50; // ED-8

export default function CanvasEditor({ template, campaign }) {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const fabricLibRef = useRef(null);
  const historyRef = useRef({ stack: [], index: -1, suspended: false });
  const autosaveRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState(template.aspectRatio);
  const [name, setName] = useState(template.name);
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useToast();

  const dims = RATIO_DIMS[ratio] || RATIO_DIMS['1:1'];

  // ── history ───────────────────────────────────────────────────────────────

  const snapshot = useCallback(() => {
    const canvas = fabricRef.current;
    const history = historyRef.current;
    if (!canvas || history.suspended) return;

    const json = JSON.stringify(canvas.toObject(EXTRA_PROPS));
    // Drop any redo branch — editing after an undo forks the timeline.
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(json);
    if (history.stack.length > HISTORY_LIMIT) history.stack.shift();
    history.index = history.stack.length - 1;
    setDirty(true);
  }, []);

  const restore = useCallback(async (json) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const history = historyRef.current;
    history.suspended = true;
    await canvas.loadFromJSON(JSON.parse(json));
    canvas.requestRenderAll();
    history.suspended = false;
    refreshLayers();
  }, []);

  const undo = useCallback(async () => {
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    await restore(history.stack[history.index]);
  }, [restore]);

  const redo = useCallback(async () => {
    const history = historyRef.current;
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    await restore(history.stack[history.index]);
  }, [restore]);

  // ── layer panel (ED-7) ────────────────────────────────────────────────────

  const refreshLayers = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setLayers(
      canvas
        .getObjects()
        .map((obj, index) => ({
          index,
          name: obj.wfName || defaultLayerName(obj),
          role: obj.wfRole || 'shape',
          visible: obj.visible !== false,
          locked: Boolean(obj.wfLocked),
        }))
        .reverse() // topmost layer first, as designers expect
    );
  }, []);

  // ── boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let disposed = false;
    let canvas;

    (async () => {
      // Fabric touches `window` at import time, so it can only be loaded in the
      // browser — hence the dynamic import rather than a top-level one.
      const fabric = await import('fabric');
      if (disposed) return;
      fabricLibRef.current = fabric;

      canvas = new fabric.Canvas(canvasElRef.current, {
        width: dims.w,
        height: dims.h,
        backgroundColor: template.canvasJson?.background || '#ffffff',
        preserveObjectStacking: true,
        selection: true,
      });
      fabricRef.current = canvas;

      const saved = template.canvasJson;
      if (saved?.fabric) {
        await canvas.loadFromJSON(saved.fabric);
      } else {
        await seedStarter(fabric, canvas, saved, dims);
      }
      canvas.requestRenderAll();

      const onChange = () => {
        snapshot();
        refreshLayers();
      };
      canvas.on('object:added', onChange);
      canvas.on('object:removed', onChange);
      canvas.on('object:modified', onChange);
      canvas.on('selection:created', (e) => setSelected(e.selected?.[0] ?? null));
      canvas.on('selection:updated', (e) => setSelected(e.selected?.[0] ?? null));
      canvas.on('selection:cleared', () => setSelected(null));

      historyRef.current.stack = [JSON.stringify(canvas.toObject(EXTRA_PROPS))];
      historyRef.current.index = 0;
      refreshLayers();
      setReady(true);
    })();

    return () => {
      disposed = true;
      canvas?.dispose();
      fabricRef.current = null;
    };
    // Boot once; ratio changes are handled by resizeCanvas below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ED-13: autosave every 30 seconds while editing.
  useEffect(() => {
    autosaveRef.current = setInterval(() => {
      if (dirty && !saving) save({ silent: true });
    }, 30000);
    return () => clearInterval(autosaveRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving]);

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

  // ED-3 (c) / ED-8: physical keyboard arrows nudge, shortcuts for undo, redo,
  // duplicate and delete. Arrow-key movement is an accessibility feature as much
  // as a precision one (§21).
  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate();
        return;
      }
      if (!active) return;
      if (active.isEditing) return; // typing inside a textbox

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelected();
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      const moves = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      if (moves[event.key]) {
        event.preventDefault();
        nudge(...moves[event.key]);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  // ── operations ────────────────────────────────────────────────────────────

  function withCanvas(fn) {
    const canvas = fabricRef.current;
    const fabric = fabricLibRef.current;
    if (!canvas || !fabric) return;
    fn(canvas, fabric);
    canvas.requestRenderAll();
  }

  /** ED-3: the on-screen arrow controller and the keyboard share this path. */
  function nudge(dx, dy) {
    withCanvas((canvas) => {
      const obj = canvas.getActiveObject();
      if (!obj || obj.wfLocked) return;
      obj.set({ left: obj.left + dx, top: obj.top + dy });
      obj.setCoords();
      canvas.fire('object:modified', { target: obj });
    });
  }

  function addText() {
    withCanvas((canvas, fabric) => {
      const text = new fabric.Textbox('Double-click to edit', {
        left: dims.w * 0.15,
        top: dims.h * 0.12,
        width: dims.w * 0.7,
        fontSize: Math.round(dims.h * 0.06),
        fill: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 'bold',
        textAlign: 'center',
        wfRole: 'text',
        wfName: 'Text',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
    });
  }

  function addShape(kind) {
    withCanvas((canvas, fabric) => {
      const size = Math.min(dims.w, dims.h) * 0.2;
      const common = {
        left: dims.w * 0.4,
        top: dims.h * 0.4,
        fill: '#ffcc33',
        wfRole: 'shape',
        wfName: kind === 'circle' ? 'Circle' : kind === 'line' ? 'Line' : 'Rectangle',
      };
      const obj =
        kind === 'circle'
          ? new fabric.Circle({ ...common, radius: size / 2 })
          : kind === 'line'
            ? new fabric.Line([0, 0, size * 2, 0], {
                ...common,
                stroke: '#ffcc33',
                strokeWidth: 8,
              })
            : new fabric.Rect({ ...common, width: size * 1.6, height: size * 0.5, rx: 12, ry: 12 });
      canvas.add(obj);
      canvas.setActiveObject(obj);
    });
  }

  async function addArtifact(artifact, color) {
    const fabric = fabricLibRef.current;
    const canvas = fabricRef.current;
    if (!fabric || !canvas) return;

    const svg = artifact.svg.replaceAll('CURRENT', color || '#3366cc');
    const { objects, options } = await fabric.loadSVGFromString(svg);
    const group = fabric.util.groupSVGElements(objects.filter(Boolean), options);
    const target = Math.min(dims.w, dims.h) * 0.18;
    group.set({
      left: dims.w * 0.5 - target / 2,
      top: dims.h * 0.6,
      wfRole: 'artifact',
      wfName: artifact.name,
    });
    group.scaleToWidth(target);
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
  }

  /**
   * ED-2 — the photo cutout: the "missing part" the participant's photo shows
   * through. Exactly one per template in v1, so adding replaces any existing one.
   *
   * `globalCompositeOperation: destination-out` is what makes it a real hole in
   * the exported PNG rather than a coloured circle: at export time it erases the
   * pixels beneath it.
   */
  function setCutout(shape) {
    withCanvas((canvas, fabric) => {
      canvas.getObjects().filter((o) => o.wfRole === 'cutout').forEach((o) => canvas.remove(o));

      const size = Math.min(dims.w, dims.h) * 0.52;
      const base = {
        left: dims.w / 2 - size / 2,
        top: dims.h * 0.42 - size / 2,
        fill: 'rgba(0,0,0,1)',
        stroke: '#3366cc',
        strokeWidth: 6,
        strokeDashArray: [14, 10],
        wfRole: 'cutout',
        wfShape: shape,
        wfName: 'Photo cutout',
      };
      const obj =
        shape === 'circle'
          ? new fabric.Circle({ ...base, radius: size / 2 })
          : new fabric.Rect({ ...base, width: size, height: size, rx: 40, ry: 40 });

      canvas.add(obj);
      canvas.setActiveObject(obj);
    });
  }

  /**
   * BADGE-1 — the designated badge zone. It is a placeholder in the editor; the
   * server draws the real chip into this rectangle at render time, which is why
   * it is excluded from the exported frame.
   */
  function addBadgeZone() {
    withCanvas((canvas, fabric) => {
      canvas.getObjects().filter((o) => o.wfRole === 'badge').forEach((o) => canvas.remove(o));

      const width = dims.w * 0.7;
      const height = dims.h * 0.09;
      const zone = new fabric.Rect({
        left: dims.w / 2 - width / 2,
        top: dims.h * 0.86 - height / 2,
        width,
        height,
        rx: height / 2,
        ry: height / 2,
        fill: 'rgba(51,102,204,0.25)',
        stroke: '#3366cc',
        strokeWidth: 4,
        strokeDashArray: [12, 8],
        wfRole: 'badge',
        wfName: 'Badge zone',
      });
      canvas.add(zone);
      canvas.setActiveObject(zone);
    });
  }

  function duplicate() {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    obj.clone(EXTRA_PROPS).then((clone) => {
      clone.set({ left: obj.left + 24, top: obj.top + 24 });
      canvas.add(clone);
      canvas.setActiveObject(clone);
      canvas.requestRenderAll();
    });
  }

  function removeSelected() {
    withCanvas((canvas) => {
      canvas.getActiveObjects().forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    });
  }

  function reorder(index, direction) {
    withCanvas((canvas) => {
      const obj = canvas.getObjects()[index];
      if (!obj) return;
      direction === 'up' ? canvas.bringObjectForward(obj) : canvas.sendObjectBackwards(obj);
      canvas.fire('object:modified', { target: obj });
    });
  }

  function toggleLayer(index, key) {
    withCanvas((canvas) => {
      const obj = canvas.getObjects()[index];
      if (!obj) return;
      if (key === 'visible') obj.set({ visible: obj.visible === false });
      if (key === 'locked') {
        const locked = !obj.wfLocked;
        obj.set({ wfLocked: locked, selectable: !locked, evented: !locked });
      }
      canvas.fire('object:modified', { target: obj });
    });
  }

  function styleSelected(patch) {
    withCanvas((canvas) => {
      const obj = canvas.getActiveObject();
      if (!obj) return;
      obj.set(patch);
      canvas.fire('object:modified', { target: obj });
      setSelected({ ...obj });
    });
  }

  function setBackground(color) {
    withCanvas((canvas) => {
      canvas.backgroundColor = color;
      canvas.fire('object:modified', { target: null });
    });
  }

  /** ED-9: switching ratio keeps every layer and asks the admin to re-check. */
  function changeRatio(next) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const target = RATIO_DIMS[next];
    canvas.setDimensions({ width: target.w, height: target.h });
    setRatio(next);
    snapshot();
    setToast('Ratio changed — check that every layer is still where you want it.');
  }

  // ── export & save ─────────────────────────────────────────────────────────

  /**
   * Flattens the design to the PNG the render pipeline uses.
   *
   * Two things are temporarily changed and then restored: the cutout switches to
   * `destination-out` so it punches a genuine transparent hole, and the badge
   * zone is hidden because the server draws the real badge there per participant.
   */
  async function exportFrameDataUrl() {
    const canvas = fabricRef.current;
    if (!canvas) return null;

    const cutout = canvas.getObjects().find((o) => o.wfRole === 'cutout');
    const badge = canvas.getObjects().find((o) => o.wfRole === 'badge');
    const restoreState = [];

    if (cutout) {
      restoreState.push([cutout, { globalCompositeOperation: cutout.globalCompositeOperation, stroke: cutout.stroke, strokeWidth: cutout.strokeWidth }]);
      cutout.set({ globalCompositeOperation: 'destination-out', stroke: null, strokeWidth: 0 });
    }
    if (badge) {
      restoreState.push([badge, { visible: badge.visible }]);
      badge.set({ visible: false });
    }
    canvas.discardActiveObject();
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier: dims.w / canvas.getWidth(),
      enableRetinaScaling: false,
    });

    for (const [obj, props] of restoreState) obj.set(props);
    canvas.requestRenderAll();
    return dataUrl;
  }

  function cutoutGeometry() {
    const canvas = fabricRef.current;
    const cutout = canvas?.getObjects().find((o) => o.wfRole === 'cutout');
    if (!cutout) return undefined;
    const rect = cutout.getBoundingRect();
    return {
      shape: cutout.wfShape === 'rounded' ? 'rounded' : 'circle',
      radius: cutout.rx ?? 0,
      xPct: (rect.left + rect.width / 2) / dims.w,
      yPct: (rect.top + rect.height / 2) / dims.h,
      widthPx: rect.width,
      heightPx: rect.height,
    };
  }

  function badgeGeometry() {
    const canvas = fabricRef.current;
    const badge = canvas?.getObjects().find((o) => o.wfRole === 'badge');
    if (!badge) return undefined;
    const rect = badge.getBoundingRect();
    return {
      xPct: (rect.left + rect.width / 2) / dims.w,
      yPct: (rect.top + rect.height / 2) / dims.h,
      fontPct: (rect.height * 0.45) / dims.h,
    };
  }

  async function save({ silent } = {}) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setSaving(true);
    setError(null);
    try {
      // ED-10: the layer state is stored whole and never flattened, so editing
      // can resume at any time. The flat PNG below is an additional artefact,
      // not a replacement.
      await api.patch(`/templates/${template.id}`, {
        name,
        aspectRatio: ratio,
        canvasJson: {
          ...(template.canvasJson || {}),
          background: canvas.backgroundColor,
          fabric: canvas.toObject(EXTRA_PROPS),
          cutout: cutoutGeometry(),
          badge: badgeGeometry(),
        },
      });

      const dataUrl = await exportFrameDataUrl();
      if (dataUrl) await api.post(`/templates/${template.id}/frame`, { dataUrl });

      setDirty(false);
      if (!silent) setToast('Template saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  /** ED-12: preview with a sample photo, exactly as a participant would see it. */
  async function openPreview() {
    const dataUrl = await exportFrameDataUrl();
    setPreview(dataUrl);
  }

  const displayScale = Math.min(1, 520 / dims.w) * zoom;

  return (
    <div className="space-y-4">
      {toast}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={campaign ? `/dashboard/campaigns/${campaign.id}?step=templates` : '/dashboard/templates'}
            className="text-sm font-semibold text-wiki-blue hover:underline"
          >
            ← {campaign ? campaign.name : 'Templates'}
          </Link>
          <input
            className="mt-1 block w-full max-w-md border-b border-transparent bg-transparent font-serif text-2xl focus:border-wiki-line focus:outline-none"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            aria-label="Template name"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-wiki-slate">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <Button variant="secondary" onClick={openPreview} disabled={!ready}>
            👁 Preview
          </Button>
          <a
            href={`/api/v1/templates/${template.id}/download`}
            className="wf-btn-secondary"
          >
            ⬇ Download
          </a>
          <Button onClick={() => save()} disabled={!ready || saving}>
            Save template
          </Button>
        </div>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      {!template.editable ? (
        <div className="wf-note">
          This template is a finished image, so its artwork cannot be taken apart into layers —
          the canvas cannot un-flatten a PNG. You can still add text, artwork and a badge zone on
          top of it. If you want full control, clone it and rebuild it in the canvas.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px]">
        <ToolPanel
          onAddText={addText}
          onAddShape={addShape}
          onAddArtifact={addArtifact}
          onSetCutout={setCutout}
          onAddBadge={addBadgeZone}
          onBackground={setBackground}
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-wiki-line bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-wiki-slate" htmlFor="wf-ratio">
                Ratio
              </label>
              <select
                id="wf-ratio"
                className="rounded border border-wiki-line px-2 py-1 text-sm"
                value={ratio}
                onChange={(e) => changeRatio(e.target.value)}
              >
                {Object.entries(RATIO_DIMS).map(([value, info]) => (
                  <option key={value} value={value}>
                    {value} — {info.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <IconButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                −
              </IconButton>
              <span className="w-14 text-center text-xs tabular-nums text-wiki-slate">
                {Math.round(zoom * 100)}%
              </span>
              <IconButton label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                +
              </IconButton>
              <IconButton label="Undo" onClick={undo}>
                ↶
              </IconButton>
              <IconButton label="Redo" onClick={redo}>
                ↷
              </IconButton>
              <IconButton label="Duplicate" onClick={duplicate}>
                ⧉
              </IconButton>
              <IconButton label="Delete" onClick={removeSelected}>
                🗑
              </IconButton>
            </div>
          </div>

          <div className="flex justify-center overflow-auto rounded-lg border border-wiki-line bg-wiki-paper p-4">
            <div
              className="wf-checker shadow-card"
              style={{
                width: dims.w * displayScale,
                height: dims.h * displayScale,
              }}
            >
              <div
                style={{
                  width: dims.w,
                  height: dims.h,
                  transform: `scale(${displayScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <canvas ref={canvasElRef} />
              </div>
            </div>
          </div>

          <ArrowController onNudge={nudge} disabled={!selected} />
        </div>

        <div className="space-y-4">
          <InspectorPanel selected={selected} onStyle={styleSelected} />
          <LayerPanel
            layers={layers}
            onReorder={reorder}
            onToggle={toggleLayer}
            onSelect={(index) =>
              withCanvas((canvas) => {
                const obj = canvas.getObjects()[index];
                if (obj && !obj.wfLocked) canvas.setActiveObject(obj);
              })
            }
          />
        </div>
      </div>

      {preview ? <PreviewModal frame={preview} dims={dims} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-8 w-8 rounded border border-wiki-line text-sm hover:bg-wiki-paper"
    >
      {children}
    </button>
  );
}

/** ED-3 (b): the on-screen arrow controller — 1 px per tap, 10 px with Shift. */
function ArrowController({ onNudge, disabled }) {
  const [step, setStep] = useState(1);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border border-wiki-line bg-white px-4 py-3">
      <div className="grid grid-cols-3 gap-1">
        <span />
        <NudgeButton label="Move up" onClick={() => onNudge(0, -step)} disabled={disabled}>
          ↑
        </NudgeButton>
        <span />
        <NudgeButton label="Move left" onClick={() => onNudge(-step, 0)} disabled={disabled}>
          ←
        </NudgeButton>
        <NudgeButton label="Move down" onClick={() => onNudge(0, step)} disabled={disabled}>
          ↓
        </NudgeButton>
        <NudgeButton label="Move right" onClick={() => onNudge(step, 0)} disabled={disabled}>
          →
        </NudgeButton>
      </div>

      <div className="text-xs text-wiki-slate">
        <p className="font-semibold">Precise movement</p>
        <p>Select a layer, then nudge it. Your keyboard arrows do the same thing.</p>
        <label className="mt-1.5 flex items-center gap-2">
          <input type="checkbox" checked={step === 10} onChange={(e) => setStep(e.target.checked ? 10 : 1)} />
          Big steps (10 px) — same as holding Shift
        </label>
      </div>
    </div>
  );
}

function NudgeButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-9 w-9 rounded border border-wiki-line text-sm font-bold hover:bg-wiki-paper disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ToolPanel({ onAddText, onAddShape, onAddArtifact, onSetCutout, onAddBadge, onBackground }) {
  const [artifacts, setArtifacts] = useState([]);
  const [artifactColor, setArtifactColor] = useState('#3366cc');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get('/presets')
      .then((res) => setArtifacts(res.artifacts || []))
      .catch(() => setArtifacts([]));
  }, []);

  const filtered = query
    ? artifacts.filter(
        (a) =>
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.tags.some((t) => t.includes(query.toLowerCase()))
      )
    : artifacts;

  return (
    <div className="space-y-4">
      <Section title="Essentials">
        <div className="grid grid-cols-2 gap-2">
          <ToolButton onClick={() => onSetCutout('circle')}>⭕ Circle cutout</ToolButton>
          <ToolButton onClick={() => onSetCutout('rounded')}>🔲 Square cutout</ToolButton>
          <ToolButton onClick={onAddBadge}>🏅 Badge zone</ToolButton>
          <ToolButton onClick={onAddText}>🔤 Text</ToolButton>
        </div>
        <p className="wf-hint">
          The cutout is the hole your participant&apos;s photo shows through. One per template — add
          it again to move to a different shape.
        </p>
      </Section>

      <Section title="Shapes">
        <div className="grid grid-cols-3 gap-2">
          <ToolButton onClick={() => onAddShape('rect')}>▭</ToolButton>
          <ToolButton onClick={() => onAddShape('circle')}>●</ToolButton>
          <ToolButton onClick={() => onAddShape('line')}>─</ToolButton>
        </div>
      </Section>

      <Section title="Background">
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onBackground(color)}
              aria-label={`Background ${color}`}
              className="h-7 w-7 rounded border border-wiki-line"
              style={{ background: color }}
            />
          ))}
        </div>
      </Section>

      <Section title="Artwork">
        <input
          className="wf-input mb-2 py-1.5 text-xs"
          placeholder="Search artwork…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PALETTE.slice(0, 7).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setArtifactColor(color)}
              aria-label={`Artwork colour ${color}`}
              className={cx(
                'h-6 w-6 rounded-full border-2',
                artifactColor === color ? 'border-wiki-ink' : 'border-transparent'
              )}
              style={{ background: color }}
            />
          ))}
        </div>
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {filtered.map((artifact) => (
            <button
              key={artifact.key}
              type="button"
              onClick={() => onAddArtifact(artifact, artifactColor)}
              title={artifact.name}
              className="rounded border border-wiki-line p-2 hover:bg-wiki-paper"
              dangerouslySetInnerHTML={{
                // Inline, hand-authored SVG from our own preset list — never
                // user input, so this is safe (uploads go through sanitizeSvg).
                __html: artifact.svg.replaceAll('CURRENT', artifactColor),
              }}
            />
          ))}
        </div>
        <p className="wf-hint">All artwork here is original and openly licensed.</p>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="wf-card p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-wiki-slate">{title}</h3>
      {children}
    </div>
  );
}

function ToolButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-wiki-line px-2 py-2 text-xs font-medium hover:bg-wiki-paper"
    >
      {children}
    </button>
  );
}

/** ED-4/ED-6: styling for whatever is selected. */
function InspectorPanel({ selected, onStyle }) {
  if (!selected) {
    return (
      <div className="wf-card p-4 text-sm text-wiki-slate">
        Select a layer on the canvas to style it.
      </div>
    );
  }

  const isText = selected.type === 'textbox' || selected.type === 'text';

  return (
    <div className="wf-card space-y-3 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-wiki-slate">
        {selected.wfName || selected.type}
      </h3>

      {isText ? (
        <>
          <label className="block text-xs font-semibold">
            Text
            <textarea
              className="wf-input mt-1 min-h-[64px] text-sm"
              value={selected.text || ''}
              onChange={(e) => onStyle({ text: e.target.value })}
            />
          </label>

          <label className="block text-xs font-semibold">
            Font
            <select
              className="wf-input mt-1 py-1.5 text-sm"
              value={selected.fontFamily}
              onChange={(e) => onStyle({ fontFamily: e.target.value })}
            >
              {FONTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold">
            Size {Math.round(selected.fontSize || 0)}px
            <input
              type="range"
              min="12"
              max="220"
              className="w-full"
              value={selected.fontSize || 40}
              onChange={(e) => onStyle({ fontSize: Number(e.target.value) })}
            />
          </label>

          <div className="flex gap-1.5">
            <ToggleButton
              active={selected.fontWeight === 'bold'}
              onClick={() => onStyle({ fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}
            >
              B
            </ToggleButton>
            <ToggleButton
              active={selected.fontStyle === 'italic'}
              onClick={() => onStyle({ fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}
            >
              I
            </ToggleButton>
            <ToggleButton active={selected.underline} onClick={() => onStyle({ underline: !selected.underline })}>
              U
            </ToggleButton>
            {['left', 'center', 'right'].map((align) => (
              <ToggleButton
                key={align}
                active={selected.textAlign === align}
                onClick={() => onStyle({ textAlign: align })}
              >
                {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
              </ToggleButton>
            ))}
          </div>

          <label className="block text-xs font-semibold">
            Letter spacing
            <input
              type="range"
              min="-100"
              max="600"
              className="w-full"
              value={selected.charSpacing || 0}
              onChange={(e) => onStyle({ charSpacing: Number(e.target.value) })}
            />
          </label>
        </>
      ) : null}

      <div>
        <p className="mb-1 text-xs font-semibold">Colour</p>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onStyle(isText ? { fill: color } : { fill: color })}
              aria-label={`Colour ${color}`}
              className="h-6 w-6 rounded border border-wiki-line"
              style={{ background: color }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom colour"
            className="h-6 w-8 cursor-pointer rounded border border-wiki-line"
            onChange={(e) => onStyle({ fill: e.target.value })}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold">Outline</p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Outline colour"
            className="h-6 w-8 cursor-pointer rounded border border-wiki-line"
            onChange={(e) => onStyle({ stroke: e.target.value })}
          />
          <input
            type="range"
            min="0"
            max="24"
            className="flex-1"
            value={selected.strokeWidth || 0}
            onChange={(e) => onStyle({ strokeWidth: Number(e.target.value) })}
            aria-label="Outline width"
          />
        </div>
      </div>

      <label className="block text-xs font-semibold">
        Rotation {Math.round(selected.angle || 0)}°
        <input
          type="range"
          min="-180"
          max="180"
          className="w-full"
          value={selected.angle || 0}
          onChange={(e) => onStyle({ angle: Number(e.target.value) })}
        />
      </label>

      <label className="block text-xs font-semibold">
        Opacity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          className="w-full"
          value={selected.opacity ?? 1}
          onChange={(e) => onStyle({ opacity: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'h-8 w-8 rounded border text-sm font-bold',
        active ? 'border-wiki-blue bg-wiki-blue-light' : 'border-wiki-line hover:bg-wiki-paper'
      )}
    >
      {children}
    </button>
  );
}

/** ED-7: ordered layer list with rename-free identity, lock, hide and reorder. */
function LayerPanel({ layers, onReorder, onToggle, onSelect }) {
  return (
    <div className="wf-card p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-wiki-slate">
        Layers ({layers.length})
      </h3>
      {layers.length === 0 ? (
        <p className="text-sm text-wiki-slate">Nothing on the canvas yet.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {layers.map((layer) => (
            <li key={layer.index} className="flex items-center gap-1.5 rounded border border-wiki-line px-2 py-1.5">
              <button
                type="button"
                onClick={() => onSelect(layer.index)}
                className="flex-1 truncate text-left text-xs font-medium"
              >
                {layer.name}
              </button>
              <IconButton label="Bring forward" onClick={() => onReorder(layer.index, 'up')}>
                ▲
              </IconButton>
              <IconButton label="Send backward" onClick={() => onReorder(layer.index, 'down')}>
                ▼
              </IconButton>
              <IconButton
                label={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => onToggle(layer.index, 'visible')}
              >
                {layer.visible ? '👁' : '🚫'}
              </IconButton>
              <IconButton
                label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => onToggle(layer.index, 'locked')}
              >
                {layer.locked ? '🔒' : '🔓'}
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ED-12: the frame over a sample photo — what participants will actually get. */
function PreviewModal({ frame, dims, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Template preview"
      onClick={onClose}
    >
      <div className="wf-card max-h-full w-full max-w-md overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg">Preview with a sample photo</h3>
          <button type="button" onClick={onClose} aria-label="Close preview" className="text-xl">
            ×
          </button>
        </div>

        <div
          className="relative mt-4 overflow-hidden rounded-lg"
          style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-sky-200 via-indigo-200 to-violet-200" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frame} alt="Frame preview" className="absolute inset-0 h-full w-full object-contain" />
          <div className="absolute inset-x-6 bottom-[10%] flex justify-center">
            <span className="rounded-full bg-wiki-blue px-4 py-2 text-xs font-bold text-white">
              I&apos;m a Wikipedia Editor ✏️
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-wiki-slate">
          The photo and badge here are stand-ins. Participants see their own photo through the
          cutout, and the badge text comes from the role they pick.
        </p>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function defaultLayerName(obj) {
  return (
    {
      textbox: 'Text',
      'i-text': 'Text',
      rect: 'Rectangle',
      circle: 'Circle',
      line: 'Line',
      group: 'Artwork',
      image: 'Image',
    }[obj.type] || 'Layer'
  );
}

/**
 * Builds the starting design for a template created from one of the six
 * platform starters (T2), or a bare cutout for a blank one (T1).
 */
async function seedStarter(fabric, canvas, saved, dims) {
  canvas.backgroundColor = saved?.background || '#ffffff';

  if (saved?.headline) {
    const headline = new fabric.Textbox(saved.headline, {
      left: dims.w * 0.1,
      top: dims.h * 0.06,
      width: dims.w * 0.8,
      fontSize: Math.round(dims.h * 0.055),
      fontFamily: 'Georgia, serif',
      fontWeight: 'bold',
      fill: saved.accent || '#ffffff',
      textAlign: 'center',
      wfRole: 'text',
      wfName: 'Headline',
    });
    canvas.add(headline);
  }

  const cutout = saved?.cutout || { shape: 'circle', xPct: 0.5, yPct: 0.42, sizePct: 0.52 };
  const size = Math.min(dims.w, dims.h) * (cutout.sizePct ?? 0.52);
  const base = {
    left: (cutout.xPct ?? 0.5) * dims.w - size / 2,
    top: (cutout.yPct ?? 0.42) * dims.h - size / 2,
    fill: 'rgba(0,0,0,1)',
    stroke: '#3366cc',
    strokeWidth: 6,
    strokeDashArray: [14, 10],
    wfRole: 'cutout',
    wfShape: cutout.shape === 'rounded' ? 'rounded' : 'circle',
    wfName: 'Photo cutout',
  };
  canvas.add(
    cutout.shape === 'rounded'
      ? new fabric.Rect({ ...base, width: size, height: size, rx: cutout.radius ?? 40, ry: cutout.radius ?? 40 })
      : new fabric.Circle({ ...base, radius: size / 2 })
  );

  const badge = saved?.badge || { xPct: 0.5, yPct: 0.86 };
  const badgeWidth = dims.w * 0.7;
  const badgeHeight = dims.h * 0.09;
  canvas.add(
    new fabric.Rect({
      left: (badge.xPct ?? 0.5) * dims.w - badgeWidth / 2,
      top: (badge.yPct ?? 0.86) * dims.h - badgeHeight / 2,
      width: badgeWidth,
      height: badgeHeight,
      rx: badgeHeight / 2,
      ry: badgeHeight / 2,
      fill: 'rgba(51,102,204,0.25)',
      stroke: '#3366cc',
      strokeWidth: 4,
      strokeDashArray: [12, 8],
      wfRole: 'badge',
      wfName: 'Badge zone',
    })
  );
}
