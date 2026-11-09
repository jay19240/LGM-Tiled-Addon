// ----------------------------------------------------------------------------------
// LAYERS (equivalent of the Blender collections)
// ----------------------------------------------------------------------------------
export const LAYER_ENT = 'ENT';
export const LAYER_JLM = 'JLM';
export const LAYER_JSS = 'JSS';
export const LAYER_JAS = 'JAS';
export const LAYER_PRT = 'PRT';
export const LAYER_CAM = 'CAM';
export const TYPED_LAYERS = [LAYER_ENT, LAYER_JLM, LAYER_JSS, LAYER_JAS, LAYER_PRT, LAYER_CAM];

// ----------------------------------------------------------------------------------
// FIELDS
// Field types: string, int, number, bool, enum, file, directory, model, vector, color, list.
// Consecutive fields with the same group are drawn in a foldout of the panel.
// Vectors and colors are stored as "a, b, c" strings, lists as JSON strings.
// ----------------------------------------------------------------------------------
const OFFSET_FIELDS = [
  { key: 'OffsetX', label: 'Offset X', type: 'number', default: 0, group: 'Offset' },
  { key: 'OffsetY', label: 'Offset Y', type: 'number', default: 0, group: 'Offset' },
  { key: 'OffsetFactorX', label: 'Offset Factor X', type: 'number', default: 0, group: 'Offset' },
  { key: 'OffsetFactorY', label: 'Offset Factor Y', type: 'number', default: 0, group: 'Offset' },
  { key: 'OffsetFactorEnabled', label: 'Offset Factor Enabled', type: 'bool', default: false, group: 'Offset' },
  { key: 'FlipX', label: 'Flip X', type: 'bool', default: false, group: 'Offset' },
  { key: 'FlipY', label: 'Flip Y', type: 'bool', default: false, group: 'Offset' }
];

const ENTITY_SLOT_FIELDS = [];
for (let i = 0; i < 16; i++) {
  const slot = 'S' + String(i).padStart(2, '0');
  ENTITY_SLOT_FIELDS.push({ key: slot, label: slot, type: 'slot', default: slot, group: 'Custom Params' });
}

export const MAP_FIELDS = [
  { key: 'ExportPath', label: 'Output Path', type: 'directory', default: '' },
  { key: 'TextureDir', label: 'Texture Dir', type: 'string', default: '' },
  { key: 'FrameDuration', label: 'Frame Duration (ms)', type: 'int', default: 0 }
];

export const TILE_FIELDS = [
  { key: 'Animation', label: 'Animation (tile ids)', type: 'string', default: '' },
  { key: 'SlopeLeft', label: 'Slope Left', type: 'int', default: 0 },
  { key: 'SlopeRight', label: 'Slope Right', type: 'int', default: 0 }
];

export const OBJECT_FIELDS = {
  [LAYER_ENT]: [
    { key: 'Type', label: 'Type', type: 'string', default: '' },
    { key: 'Model', label: 'Model', type: 'model', default: '' },
    { key: 'ModelBehavior', label: 'Model Behavior', type: 'enum', items: ['INSTANCE', 'DUPLICATE'], default: 'INSTANCE', visible: obj => getValue(obj, 'Model', OBJECT_FIELDS[LAYER_ENT]) != '' },
    ...ENTITY_SLOT_FIELDS
  ],
  [LAYER_JLM]: [],
  [LAYER_JSS]: [
    { key: 'Texture', label: 'Texture', type: 'file', default: '' },
    { key: 'X', label: 'X', type: 'int', default: 0 },
    { key: 'Y', label: 'Y', type: 'int', default: 0 },
    { key: 'Width', label: 'Width', type: 'int', default: 0 },
    { key: 'Height', label: 'Height', type: 'int', default: 0 },
    ...OFFSET_FIELDS
  ],
  [LAYER_JAS]: [
    { key: 'Texture', label: 'Texture', type: 'file', default: '' },
    { key: 'FrameWidth', label: 'Frame Width', type: 'int', default: 0 },
    { key: 'FrameHeight', label: 'Frame Height', type: 'int', default: 0 },
    ...OFFSET_FIELDS,
    {
      key: 'Animations', label: 'Animations', type: 'list', group: 'Animations', fields: [
        { key: 'Name', label: 'Name', type: 'string', default: '' },
        { key: 'StartFrame', label: 'Start Frame', type: 'int', default: 0 },
        { key: 'EndFrame', label: 'End Frame', type: 'int', default: 0 },
        { key: 'FrameDuration', label: 'Frame Duration', type: 'int', default: 0 }
      ]
    }
  ],
  [LAYER_PRT]: [
    { key: 'Texture', label: 'Texture', type: 'file', default: '' },
    { key: 'PositionStyle', label: 'Position Style', type: 'enum', items: ['SQUARE', 'CIRCLE'], default: 'SQUARE', group: 'Position' },
    { key: 'PositionBase', label: 'Position Base', type: 'vector', size: 2, default: [0, 0], group: 'Position' },
    { key: 'PositionSpread', label: 'Position Spread', type: 'vector', size: 2, default: [0, 0], group: 'Position' },
    { key: 'PositionCircleRadiusBase', label: 'Position Circle Radius Base', type: 'number', default: 0, group: 'Position' },
    { key: 'PositionRadiusSpread', label: 'Position Radius Spread', type: 'number', default: 0, group: 'Position' },
    { key: 'VelocityStyle', label: 'Velocity Style', type: 'enum', items: ['CLASSIC', 'EXPLODE'], default: 'CLASSIC', group: 'Velocity' },
    { key: 'VelocityBase', label: 'Velocity Base', type: 'vector', size: 2, default: [0, 0], group: 'Velocity' },
    { key: 'VelocitySpread', label: 'Velocity Spread', type: 'vector', size: 2, default: [0, 0], group: 'Velocity' },
    { key: 'VelocityExplodeSpeedBase', exportKey: 'VelocityExploseSpeedBase', label: 'Velocity Explode Speed Base', type: 'number', default: 0, group: 'Velocity' },
    { key: 'VelocityExplodeSpeedSpread', exportKey: 'VelocityExploseSpeedSpread', label: 'Velocity Explode Speed Spread', type: 'number', default: 0, group: 'Velocity' },
    { key: 'ColorBase', label: 'Color Base', type: 'color', default: [0, 1, 0.5], group: 'Color' },
    { key: 'ColorSpread', label: 'Color Spread', type: 'color', default: [0, 0, 0], group: 'Color' },
    { key: 'ColorTween', label: 'Color Tween', type: 'list', tween: true, group: 'Color', fields: [
      { key: 'Time', label: 'Time', type: 'number', default: 0 },
      { key: 'Value', label: 'Value', type: 'color', default: [1, 1, 1] }
    ] },
    { key: 'SizeBase', label: 'Size Base', type: 'number', default: 1, group: 'Size' },
    { key: 'SizeSpread', label: 'Size Spread', type: 'number', default: 0, group: 'Size' },
    { key: 'SizeTween', label: 'Size Tween', type: 'list', tween: true, group: 'Size', fields: [
      { key: 'Time', label: 'Time', type: 'number', default: 0 },
      { key: 'Value', label: 'Value', type: 'number', default: 0 }
    ] },
    { key: 'OpacityBase', label: 'Opacity Base', type: 'number', default: 1, group: 'Opacity' },
    { key: 'OpacitySpread', label: 'Opacity Spread', type: 'number', default: 0, group: 'Opacity' },
    { key: 'OpacityTween', label: 'Opacity Tween', type: 'list', tween: true, group: 'Opacity', fields: [
      { key: 'Time', label: 'Time', type: 'number', default: 0 },
      { key: 'Value', label: 'Value', type: 'number', default: 0 }
    ] },
    { key: 'AccelerationBase', label: 'Acceleration Base', type: 'vector', size: 2, default: [0, 0], group: 'Acceleration' },
    { key: 'AccelerationSpread', label: 'Acceleration Spread', type: 'vector', size: 2, default: [0, 0], group: 'Acceleration' },
    { key: 'AccelerationTween', label: 'Acceleration Tween', type: 'list', tween: true, group: 'Acceleration', fields: [
      { key: 'Time', label: 'Time', type: 'number', default: 0 },
      { key: 'Value', label: 'Value', type: 'vector', size: 2, default: [0, 0] }
    ] },
    { key: 'AngleBase', label: 'Angle Base', type: 'number', default: 0, group: 'Angle' },
    { key: 'AngleSpread', label: 'Angle Spread', type: 'number', default: 0, group: 'Angle' },
    { key: 'AngleVelocityBase', label: 'Angle Velocity Base', type: 'number', default: 0, group: 'Angle' },
    { key: 'AngleVelocitySpread', label: 'Angle Velocity Spread', type: 'number', default: 0, group: 'Angle' },
    { key: 'AngleAccelerationBase', label: 'Angle Acceleration Base', type: 'number', default: 0, group: 'Angle' },
    { key: 'AngleAccelerationSpread', label: 'Angle Acceleration Spread', type: 'number', default: 0, group: 'Angle' },
    { key: 'ParticleDeathAge', label: 'Particle Death Age', type: 'number', default: 1, group: 'Emitter' },
    { key: 'ParticlesPerSecond', label: 'Particles Per Second', type: 'number', default: 30, group: 'Emitter' },
    { key: 'ParticleQuantity', label: 'Particles Quantity', type: 'number', default: 100, group: 'Emitter' },
    { key: 'EmitterDeathAge', label: 'Emitter Death Age', type: 'number', default: 60, group: 'Emitter' }
  ],
  [LAYER_CAM]: [
    { key: 'ScaleX', label: 'Scale X', type: 'number', default: 1 },
    { key: 'ScaleY', label: 'Scale Y', type: 'number', default: 1 }
  ]
};

// ----------------------------------------------------------------------------------
// VALUES
// ----------------------------------------------------------------------------------
export function findField(fields, key) {
  return fields.find(field => field.key == key);
}

export function decodeValue(field, raw) {
  if (raw === undefined || raw === null || raw === '') {
    if (field.type == 'list') {
      return [];
    }

    return Array.isArray(field.default) ? field.default.slice() : field.default;
  }

  switch (field.type) {
    case 'int':
    case 'number':
      return Number(raw);
    case 'bool':
      return raw === true || raw === 'true';
    case 'vector':
    case 'color':
      return String(raw).split(',').map(v => Number(v.trim()));
    case 'list':
      return JSON.parse(String(raw));
    default:
      return String(raw);
  }
}

export function encodeValue(field, value) {
  switch (field.type) {
    case 'int':
      return Math.round(Number(value));
    case 'number':
      return Number(value);
    case 'bool':
      return Boolean(value);
    case 'vector':
    case 'color':
      return value.join(', ');
    case 'list':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

/**
 * Read a field value from a Tiled object (map, tile, map object) or from a list item.
 */
export function getValue(owner, key, fields) {
  const field = findField(fields, key);
  return decodeValue(field, owner.property(key));
}

export function setValue(owner, key, fields, value) {
  const field = findField(fields, key);
  owner.setProperty(key, encodeValue(field, value));
}

export function getSlot(owner, slot) {
  return {
    name: owner.property(slot + 'Name') ?? slot,
    value: owner.property(slot + 'Value') ?? ''
  };
}

/**
 * Initialize all the fields of a new object with their default values.
 */
export function setDefaultValues(owner, fields) {
  for (const field of fields) {
    if (field.type == 'slot') {
      owner.setProperty(field.key + 'Name', field.default);
      owner.setProperty(field.key + 'Value', '');
    }
    else {
      owner.setProperty(field.key, encodeValue(field, decodeValue(field, undefined)));
    }
  }
}

/**
 * Create a new list item with the default values of the list fields.
 */
export function createListItem(listField) {
  const item = {};
  for (const field of listField.fields) {
    item[field.key] = encodeValue(field, decodeValue(field, undefined));
  }

  return item;
}

/**
 * Wrap a list item so that it can be read and written like a Tiled object.
 */
export function createListItemOwner(owner, listField, index) {
  return {
    property(key) {
      return getValue(owner, listField.key, [listField])[index][key];
    },
    setProperty(key, value) {
      const items = getValue(owner, listField.key, [listField]);
      items[index][key] = value;
      setValue(owner, listField.key, [listField], items);
    }
  };
}
