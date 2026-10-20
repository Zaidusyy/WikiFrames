'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { IconButton, cx } from '@/components/ui';
import { isActiveSelection, isImage, isText, layerKind } from './fabric-setup';
import { WIKI_PALETTE } from './operations';

// ED-4: curated font stacks. Every one is a system face or ships with the
// major operating systems, so nothing here creates a licensing problem (§23.2)
// and nothing has to be downloaded from a third party.
export const FONTS = [
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'System sans'],
  ['"Linux Libertine", Georgia, Times, serif', 'Wiki serif'],
  ['Georgia, serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Trebuchet MS", Helvetica, sans-serif', 'Trebuchet'],
  ['"Arial Black", "Helvetica Neue", Arial, sans-serif', 'Heavy sans'],
  ['Impact, "Arial Narrow Bold", sans-serif', 'Impact'],
  ['"Courier New", Courier, monospace', 'Monospace'],
];

export function Section({ title, children, actions }) {
  return (
    <section className="wf-card p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-wiki-slate">{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

function ToolButton({ icon, children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded border border-wiki-line bg-white px-2 py-2 text-left text-xs font-bold text-wiki-ink hover:border-wiki-border hover:bg-wiki-paper disabled:opacity-50"
    >
      <Icon name={icon} size="sm" className="text-wiki-slate" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function Swatches({ colors = WIKI_PALETTE, value, onPick, label }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`${label} ${color}`}
          aria-pressed={value === color}
          className={cx(
            'h-6 w-6 rounded-full border',
            value === color ? 'border-wiki-ink ring-2 ring-wiki-blue ring-offset-1' : 'border-wiki-line'
          )}
          style={{ background: color }}
        />
      ))}
      <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-wiki-line" title="Custom colour">
        <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" />
        <input
          type="color"
          aria-label={`Custom ${label.toLowerCase()}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#3366cc'}
          onChange={(e) => onPick(e.target.value)}
        />
      </label>
    </div>
  );
}

/** Left column: what can be added. */
export function ToolPanel({ editor, artifacts, editable }) {
  const [artifactColor, setArtifactColor] = useState('#3366cc');
  const [query, setQuery] = useState('');
  const filtered = query
    ? artifacts.filter(
        (a) => a.name.toLowerCase().includes(query.toLowerCase()) || a.tags.some((t) => t.includes(query.toLowerCase()))
      )
    : artifacts;

  return (
    <div className="space-y-3">
      <Section title="Essentials">
        <div className="grid grid-cols-2 gap-1.5">
          {editable ? (
            <>
              <ToolButton icon="wfIconCutoutCircle" onClick={() => editor.setCutout('circle')}>
                Circle cutout
              </ToolButton>
              <ToolButton icon="wfIconCutoutSquare" onClick={() => editor.setCutout('rounded')}>
                Square cutout
              </ToolButton>
            </>
          ) : null}
          <ToolButton icon="cdxIconTag" onClick={editor.addBadgeZone}>
            Badge zone
          </ToolButton>
          <ToolButton icon="cdxIconTextStyle" onClick={editor.addText}>
            Text
          </ToolButton>
        </div>
        <p className="wf-hint">
          {editable
            ? 'The cutout is the hole your participants’ photos show through. One per template.'
            : 'This frame’s photo hole is part of its artwork. Add text, images and a badge zone on top.'}
        </p>
      </Section>

      <Section title="Shapes">
        <div className="grid grid-cols-3 gap-1.5">
          <ToolButton icon="wfIconRectangle" onClick={() => editor.addShape('rect')}>
            Box
          </ToolButton>
          <ToolButton icon="wfIconCircle" onClick={() => editor.addShape('circle')}>
            Circle
          </ToolButton>
          <ToolButton icon="wfIconLine" onClick={() => editor.addShape('line')}>
            Line
          </ToolButton>
        </div>
      </Section>

      {editable ? (
        <Section title="Background">
          <Swatches label="Background" value={editor.background} onPick={editor.setBackground} />
        </Section>
      ) : null}

      <Section title="Artwork">
        <input
          className="wf-input mb-2 py-1.5 text-xs"
          placeholder="Search artwork…"
          aria-label="Search artwork"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mb-2">
          <Swatches colors={WIKI_PALETTE.slice(0, 7)} label="Artwork colour" value={artifactColor} onPick={setArtifactColor} />
        </div>
        <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
          {filtered.map((artifact) => (
            <button
              key={artifact.key}
              type="button"
              onClick={() => editor.addArtifact(artifact, artifactColor)}
              title={artifact.name}
              aria-label={`Add ${artifact.name}`}
              className="aspect-square rounded border border-wiki-line bg-white p-1.5 hover:border-wiki-blue"
              dangerouslySetInnerHTML={{
                // Inline, hand-authored SVG from our own preset list — never
                // user input.
                __html: artifact.svg.replaceAll('CURRENT', artifactColor),
              }}
            />
          ))}
        </div>
        <p className="wf-hint">Original artwork, free to use. For photos and illustrations, open Media.</p>
      </Section>
    </div>
  );
}

function NumberField({ label, value, onCommit, step = 1, suffix }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  return (
    <label className="block text-[11px] font-bold text-wiki-slate">
      {label}
      <span className="mt-0.5 flex items-center rounded border border-wiki-border bg-white focus-within:border-wiki-blue focus-within:ring-1 focus-within:ring-inset focus-within:ring-wiki-blue">
        <input
          type="number"
          step={step}
          className="w-full min-w-0 bg-transparent px-1.5 py-1 text-xs font-normal text-wiki-ink focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => Number.isFinite(Number(draft)) && onCommit(Number(draft))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && Number.isFinite(Number(draft))) onCommit(Number(draft));
          }}
        />
        {suffix ? <span className="pr-1.5 text-[10px] font-normal text-wiki-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, format = (v) => Math.round(v) }) {
  return (
    <label className="block text-[11px] font-bold text-wiki-slate">
      <span className="flex justify-between">
        {label}
        <span className="font-normal tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#3366cc]"
      />
    </label>
  );
}

/** ED-4/ED-6: properties of whatever is selected, read live from the canvas. */
export function Inspector({ editor }) {
  const obj = editor.active;

  if (!obj) {
    return (
      <Section title="Properties">
        <p className="text-sm text-wiki-slate">Select a layer to style it. Shift-click to select several.</p>
      </Section>
    );
  }

  if (isActiveSelection(obj)) {
    const count = obj.getObjects().length;
    return (
      <Section title={`${count} layers selected`}>
        <AlignButtons editor={editor} multiple />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button type="button" className="wf-btn-secondary text-xs" onClick={editor.group}>
            <Icon name="wfIconGroup" size="sm" /> Group
          </button>
          <button type="button" className="wf-btn-danger text-xs" onClick={editor.remove}>
            <Icon name="cdxIconTrash" size="sm" /> Delete
          </button>
        </div>
      </Section>
    );
  }

  const kind = layerKind(obj);
  const box = obj.getBoundingRect();
  const text = isText(obj);
  const isBadge = obj.wfRole === 'badge';
  const isCutout = obj.wfRole === 'cutout';
  const fill = typeof obj.fill === 'string' ? obj.fill : '#000000';

  return (
    <Section
      title={obj.wfName || kind}
      actions={
        <div className="flex">
          <IconButton size="sm" icon={obj.wfLocked ? 'cdxIconLock' : 'cdxIconUnLock'} label={obj.wfLocked ? 'Unlock' : 'Lock'} onClick={editor.toggleLock} active={Boolean(obj.wfLocked)} />
          <IconButton size="sm" icon="cdxIconCopy" label="Duplicate (Ctrl+D)" onClick={editor.duplicate} disabled={isCutout} />
          <IconButton size="sm" icon="cdxIconTrash" label="Delete" onClick={editor.remove} />
        </div>
      }
    >
      <div className="space-y-3">
        <AlignButtons editor={editor} />

        <div className="grid grid-cols-4 gap-1.5">
          <NumberField label="X" value={box.left} onCommit={(v) => editor.setBox({ x: v })} />
          <NumberField label="Y" value={box.top} onCommit={(v) => editor.setBox({ y: v })} />
          <NumberField label="W" value={box.width} onCommit={(v) => editor.setBox({ w: v })} />
          <NumberField label="H" value={box.height} onCommit={(v) => editor.setBox({ h: v })} />
        </div>

        {isBadge ? (
          <>
            <div>
              <p className="mb-1 text-[11px] font-bold text-wiki-slate">Badge colour</p>
              <Swatches label="Badge colour" value={obj.wfBadgeBackground} onPick={(c) => editor.apply({ wfBadgeBackground: c, fill: c })} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold text-wiki-slate">Badge text colour</p>
              <Swatches label="Badge text colour" colors={['#ffffff', '#202122', '#3366cc', '#ffcc33']} value={obj.wfBadgeColor} onPick={(c) => editor.apply({ wfBadgeColor: c, stroke: c })} />
            </div>
            <p className="wf-hint">
              Each participant’s role badge is drawn inside this zone, in these colours, sized to its height.
            </p>
          </>
        ) : null}

        {isCutout ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={cx('wf-btn-secondary text-xs', obj.wfShape !== 'rounded' && 'border-wiki-blue text-wiki-blue')} onClick={() => editor.setCutout('circle')}>
                <Icon name="wfIconCutoutCircle" size="sm" /> Circle
              </button>
              <button type="button" className={cx('wf-btn-secondary text-xs', obj.wfShape === 'rounded' && 'border-wiki-blue text-wiki-blue')} onClick={() => editor.setCutout('rounded')}>
                <Icon name="wfIconCutoutSquare" size="sm" /> Rounded
              </button>
            </div>
            {obj.wfShape === 'rounded' ? (
              <Slider label="Corner radius" value={obj.rx || 0} min={0} max={Math.min(obj.width, obj.height) / 2} onChange={(v) => editor.apply({ rx: v, ry: v })} />
            ) : null}
          </>
        ) : null}

        {text ? (
          <>
            <label className="block text-[11px] font-bold text-wiki-slate">
              Text
              <textarea
                className="wf-input mt-0.5 min-h-[60px] text-sm font-normal"
                value={obj.text || ''}
                onChange={(e) => editor.apply({ text: e.target.value })}
              />
            </label>
            <label className="block text-[11px] font-bold text-wiki-slate">
              Font
              <select className="wf-input mt-0.5 py-1.5 text-xs font-normal" value={obj.fontFamily} onChange={(e) => editor.apply({ fontFamily: e.target.value })}>
                {FONTS.some(([v]) => v === obj.fontFamily) ? null : <option value={obj.fontFamily}>Current font</option>}
                {FONTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="Size" value={obj.fontSize || 40} min={8} max={400} onChange={(v) => editor.apply({ fontSize: v })} format={(v) => `${Math.round(v)}px`} />
            <div className="flex flex-wrap gap-1">
              <IconButton size="sm" icon="cdxIconBold" label="Bold" active={obj.fontWeight === 'bold' || Number(obj.fontWeight) >= 600} onClick={() => editor.apply({ fontWeight: obj.fontWeight === 'bold' || Number(obj.fontWeight) >= 600 ? 'normal' : 'bold' })} />
              <IconButton size="sm" icon="cdxIconItalic" label="Italic" active={obj.fontStyle === 'italic'} onClick={() => editor.apply({ fontStyle: obj.fontStyle === 'italic' ? 'normal' : 'italic' })} />
              <IconButton size="sm" icon="cdxIconUnderline" label="Underline" active={Boolean(obj.underline)} onClick={() => editor.apply({ underline: !obj.underline })} />
              <span className="mx-1 w-px bg-wiki-line" />
              <IconButton size="sm" icon="cdxIconAlignLeft" label="Align text left" active={obj.textAlign === 'left'} onClick={() => editor.apply({ textAlign: 'left' })} />
              <IconButton size="sm" icon="cdxIconAlignCenter" label="Centre text" active={obj.textAlign === 'center'} onClick={() => editor.apply({ textAlign: 'center' })} />
              <IconButton size="sm" icon="cdxIconAlignRight" label="Align text right" active={obj.textAlign === 'right'} onClick={() => editor.apply({ textAlign: 'right' })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Letter spacing" value={obj.charSpacing || 0} min={-100} max={800} onChange={(v) => editor.apply({ charSpacing: v })} />
              <Slider label="Line height" value={obj.lineHeight || 1.16} min={0.7} max={2.5} step={0.01} onChange={(v) => editor.apply({ lineHeight: v })} format={(v) => v.toFixed(2)} />
            </div>
          </>
        ) : null}

        {!isBadge && !isCutout && !isImage(obj) && kind !== 'group' ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-wiki-slate">{text ? 'Text colour' : 'Fill'}</p>
            <Swatches label={text ? 'Text colour' : 'Fill'} value={fill} onPick={(c) => editor.apply(kind === 'shape' && obj.isType?.('Line', 'line') ? { stroke: c } : { fill: c })} />
          </div>
        ) : null}

        {!isBadge && !isCutout ? (
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-bold text-wiki-blue">Outline, shadow and more</summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 text-[11px] font-bold text-wiki-slate">Outline</p>
                <Swatches label="Outline" colors={['#ffffff', '#202122', '#3366cc', '#ffcc33']} value={obj.stroke} onPick={(c) => editor.apply({ stroke: c, strokeWidth: obj.strokeWidth || 4, paintFirst: 'stroke', strokeUniform: true })} />
                <Slider label="Outline width" value={obj.strokeWidth || 0} min={0} max={40} onChange={(v) => editor.apply({ strokeWidth: v, paintFirst: 'stroke', strokeUniform: true })} />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-wiki-ink">
                <input type="checkbox" checked={Boolean(obj.shadow)} onChange={(e) => editor.setShadow(e.target.checked)} />
                Soft shadow
              </label>
              <div className="flex gap-1.5">
                <button type="button" className="wf-btn-secondary flex-1 text-xs" onClick={() => editor.apply({ flipX: !obj.flipX })}>
                  Flip horizontal
                </button>
                <button type="button" className="wf-btn-secondary flex-1 text-xs" onClick={() => editor.apply({ flipY: !obj.flipY })}>
                  Flip vertical
                </button>
              </div>
            </div>
          </details>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Slider label="Rotation" value={obj.angle || 0} min={-180} max={180} onChange={(v) => editor.apply({ angle: v })} format={(v) => `${Math.round(v)}°`} />
          <Slider label="Opacity" value={obj.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => editor.apply({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>

        {obj.wfAttribution ? (
          <div className="rounded border border-wiki-line bg-wiki-paper p-2 text-[11px] leading-snug text-wiki-slate">
            <p className="font-bold text-wiki-ink">From Wikimedia Commons</p>
            <p className="mt-0.5">
              {obj.wfAttribution.author} · {obj.wfAttribution.license}
            </p>
            {obj.wfAttribution.filePage ? (
              <a href={obj.wfAttribution.filePage} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex items-center gap-1 font-bold text-wiki-blue hover:underline">
                File page <Icon name="cdxIconLinkExternal" size="xs" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function AlignButtons({ editor, multiple }) {
  const items = [
    ['left', 'wfIconAlignObjectsLeft', 'Align left'],
    ['center', 'wfIconAlignObjectsCenter', 'Align centres horizontally'],
    ['right', 'wfIconAlignObjectsRight', 'Align right'],
    ['top', 'wfIconAlignObjectsTop', 'Align top'],
    ['middle', 'wfIconAlignObjectsMiddle', 'Align middles vertically'],
    ['bottom', 'wfIconAlignObjectsBottom', 'Align bottom'],
  ];
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-wiki-slate">{multiple ? 'Align to each other' : 'Align to the frame'}</p>
      <div className="flex flex-wrap gap-0.5">
        {items.map(([how, icon, label]) => (
          <IconButton key={how} size="sm" icon={icon} label={label} onClick={() => editor.align(how)} />
        ))}
        {multiple ? (
          <>
            <span className="mx-1 w-px bg-wiki-line" />
            <IconButton size="sm" icon="wfIconDistributeHorizontal" label="Distribute horizontally" onClick={() => editor.distribute('horizontal')} />
            <IconButton size="sm" icon="wfIconDistributeVertical" label="Distribute vertically" onClick={() => editor.distribute('vertical')} />
          </>
        ) : null}
      </div>
    </div>
  );
}

const ROLE_ICON = {
  cutout: 'wfIconCutoutCircle',
  badge: 'cdxIconTag',
  base: 'wfIconFrame',
  text: 'cdxIconTextStyle',
  image: 'cdxIconImage',
  group: 'wfIconGroup',
  shape: 'wfIconRectangle',
};

/** ED-7: the layer list — rename, lock, hide, and drag (or arrow) to reorder. */
export function LayerPanel({ editor }) {
  const [renaming, setRenaming] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  return (
    <Section title={`Layers (${editor.layers.length})`}>
      {editor.layers.length === 0 ? (
        <p className="text-sm text-wiki-slate">Nothing on the canvas yet.</p>
      ) : (
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {editor.layers.map((layer) => (
            <li
              key={layer.key}
              draggable={!layer.fixed}
              onDragStart={() => setDragIndex(layer.index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== layer.index) editor.moveLayer(dragIndex, layer.index);
                setDragIndex(null);
              }}
              className={cx(
                'group flex items-center gap-1 rounded border px-1.5 py-1',
                layer.selected ? 'border-wiki-blue bg-wiki-blue-light' : 'border-transparent hover:border-wiki-line hover:bg-wiki-paper',
                !layer.visible && 'opacity-60'
              )}
            >
              <Icon name={ROLE_ICON[layer.kind] || 'wfIconRectangle'} size="sm" className="text-wiki-slate" />
              {renaming === layer.index ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  className="min-w-0 flex-1 rounded border border-wiki-blue px-1 py-0.5 text-xs"
                  onBlur={(e) => {
                    editor.rename(layer.index, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => editor.selectLayer(layer.index)}
                  onDoubleClick={() => !layer.fixed && setRenaming(layer.index)}
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-wiki-ink"
                  title={layer.fixed ? layer.name : 'Click to select · double-click to rename · drag to reorder'}
                >
                  {layer.name}
                </button>
              )}
              {!layer.fixed ? (
                <span className="flex opacity-70 group-hover:opacity-100">
                  <IconButton size="sm" icon="wfIconUpTriangle" label="Bring forward" onClick={() => editor.reorderLayer(layer.index, 'forward')} />
                  <IconButton size="sm" icon="cdxIconDownTriangle" label="Send backward" onClick={() => editor.reorderLayer(layer.index, 'backward')} />
                  <IconButton size="sm" icon={layer.visible ? 'cdxIconEye' : 'cdxIconEyeClosed'} label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => editor.toggleLayer(layer.index, 'visible')} />
                  <IconButton size="sm" icon={layer.locked ? 'cdxIconLock' : 'cdxIconUnLock'} label={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => editor.toggleLayer(layer.index, 'locked')} active={layer.locked} />
                </span>
              ) : (
                <Icon name="cdxIconLock" size="xs" className="text-wiki-muted" label="Fixed layer" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const SEVERITY = {
  error: ['cdxIconError', 'text-wiki-error', 'Error'],
  warning: ['cdxIconAlert', 'text-wiki-warning', 'Warning'],
  info: ['cdxIconInfoFilled', 'text-wiki-blue', 'Tip'],
};

/** Feature: the Frame Health Check. */
export function HealthPanel({ report, onFix, onSelect, onRecheck }) {
  if (!report) {
    return <p className="text-sm text-wiki-slate">Checking…</p>;
  }
  const { issues, score } = report;
  const tone = score >= 90 ? 'text-wiki-success' : score >= 60 ? 'text-wiki-warning' : 'text-wiki-error';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded border border-wiki-line bg-wiki-paper p-3">
        <span className={cx('text-3xl font-bold tabular-nums', tone)}>{score}</span>
        <div className="min-w-0 flex-1 text-xs text-wiki-slate">
          <p className="font-bold text-wiki-ink">
            {issues.length === 0 ? 'Ready for every phone' : `${issues.length} thing${issues.length === 1 ? '' : 's'} to look at`}
          </p>
          <p>Legibility (WCAG 2.1 AA), safe areas, the photo hole and licence credits.</p>
        </div>
        <IconButton icon="cdxIconReload" label="Check again" onClick={onRecheck} />
      </div>

      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-wiki-success">
          <Icon name="cdxIconSuccess" /> No problems found.
        </p>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => {
            const [icon, color, label] = SEVERITY[issue.severity];
            return (
              <li key={issue.id} className="rounded border border-wiki-line bg-white p-2.5">
                <div className="flex gap-2">
                  <Icon name={icon} size="sm" className={cx('mt-0.5', color)} label={label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-wiki-ink">{issue.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-wiki-slate">{issue.detail}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {issue.fix ? (
                        <button type="button" className="wf-btn-primary min-h-0 px-2 py-1 text-[11px]" onClick={() => onFix(issue.fix)}>
                          Fix it
                        </button>
                      ) : null}
                      {issue.objectIndex !== undefined ? (
                        <button type="button" className="wf-btn-secondary min-h-0 px-2 py-1 text-[11px]" onClick={() => onSelect(issue.objectIndex)}>
                          Show me
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
