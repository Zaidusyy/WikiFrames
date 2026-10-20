// Loads Fabric once, in the browser, and applies the editor-wide defaults.

// Custom fields that must survive serialization — they are what tell the render
// pipeline which object is the photo hole, which is the badge zone, and what
// licence an imported image carries.
export const EXTRA_PROPS = [
  'wfRole',
  'wfName',
  'wfShape',
  'wfLocked',
  'wfAttribution',
  'wfAssetId',
  // The role badge's own colours, kept on the badge zone layer so they
  // survive every save (they used to be dropped on the first one).
  'wfBadgeBackground',
  'wfBadgeColor',
];

let fabricPromise = null;

export function loadFabric() {
  fabricPromise ??= import('fabric').then((fabric) => {
    // Fabric 7 moved the default origin to the centre. Every saved design and
    // every coordinate in this editor is top-left based, so restore that.
    fabric.BaseFabricObject.ownDefaults.originX = 'left';
    fabric.BaseFabricObject.ownDefaults.originY = 'top';

    // Selection handles in Codex progressive blue, sized for touch as well
    // as mouse; rotation snaps to 15° when close to it.
    Object.assign(fabric.InteractiveFabricObject.ownDefaults, {
      borderColor: '#3366cc',
      borderScaleFactor: 1.5,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#3366cc',
      cornerStyle: 'circle',
      cornerSize: 11,
      touchCornerSize: 28,
      transparentCorners: false,
      padding: 2,
      snapAngle: 15,
      snapThreshold: 4,
    });
    return fabric;
  });
  return fabricPromise;
}

let extensionsPromise = null;
export function loadFabricExtensions() {
  extensionsPromise ??= import('fabric/extensions');
  return extensionsPromise;
}

export function isText(obj) {
  return Boolean(obj) && typeof obj.isType === 'function' && obj.isType('Textbox', 'IText', 'Text', 'FabricText', 'i-text', 'textbox', 'text');
}

export function isImage(obj) {
  return Boolean(obj) && typeof obj.isType === 'function' && obj.isType('Image', 'FabricImage', 'image');
}

export function isGroupLike(obj) {
  return Boolean(obj) && typeof obj.isType === 'function' && obj.isType('Group', 'group');
}

export function isActiveSelection(obj) {
  return Boolean(obj) && typeof obj.isType === 'function' && obj.isType('ActiveSelection', 'activeselection', 'activeSelection');
}

/** What a layer is, for the layer panel, the inspector and the health check. */
export function layerKind(obj) {
  if (!obj) return 'shape';
  if (obj.wfRole === 'cutout' || obj.wfRole === 'badge' || obj.wfRole === 'base') return obj.wfRole;
  if (isText(obj)) return 'text';
  if (isImage(obj)) return 'image';
  if (isGroupLike(obj)) return 'group';
  return 'shape';
}

export function defaultLayerName(obj) {
  switch (layerKind(obj)) {
    case 'cutout':
      return 'Photo cutout';
    case 'badge':
      return 'Badge zone';
    case 'base':
      return 'Frame artwork';
    case 'text':
      return String(obj.text || 'Text').split('\n')[0].slice(0, 32) || 'Text';
    case 'image':
      return 'Image';
    case 'group':
      return 'Group';
    default:
      return obj?.isType?.('Circle', 'circle') ? 'Circle' : obj?.isType?.('Line', 'line') ? 'Line' : 'Shape';
  }
}
