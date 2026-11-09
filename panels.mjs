import * as props from './props.mjs';
import * as utils from './utils.mjs';
import * as functions from './functions.mjs';
import * as operators from './operators.mjs';
// ----------------------------------------------------------------------------------

const NUMBER_LIMIT = 1000000000;
const TEXTURE_FILTER = 'Images (*.png *.jpg *.jpeg *.bmp)';
const PANEL_WIDTH = 920;
const LEFT_WIDTH = 360;
const LEFT_LABEL_WIDTH = 140;
const RIGHT_LABEL_WIDTH = 190;
const COLUMN_GAP = 16;

let dialog = null;
let drawPending = false;
const connectedMaps = [];
const foldouts = { Export: true, Create: true };

export function register() {
  tiled.registerAction('LegacyMakerPanel', openPanel).text = 'Legacy Game Maker: Panel';

  tiled.activeAssetChanged.connect(asset => {
    connectMap(asset);
    requestDraw();
  });

  if (tiled.mapEditor) {
    tiled.mapEditor.currentBrushChanged.connect(requestDraw);
  }
}

function openPanel() {
  if (!dialog) {
    const panel = new Dialog('Legacy Game Maker');
    panel.minimumWidth = PANEL_WIDTH;
    panel.newRowMode = Dialog.ManualRows;

    // Tiled deletes the dialogs when they are closed
    panel.finished.connect(() => {
      if (dialog === panel) {
        dialog = null;
      }
    });

    dialog = panel;
  }

  connectMap(tiled.activeAsset);
  dialog.show();
  draw();
}

function connectMap(asset) {
  if (!asset || !asset.isTileMap || connectedMaps.includes(asset)) {
    return;
  }

  asset.selectedObjectsChanged.connect(requestDraw);
  connectedMaps.push(asset);
}

/**
 * Widgets cannot be destroyed from their own signals, the panel is drawn again later.
 */
function requestDraw() {
  if (drawPending || !dialog || !dialog.visible) {
    return;
  }

  drawPending = true;
  Qt.callLater(() => {
    drawPending = false;
    draw();
  });
}

// ----------------------------------------------------------------------------------
// DRAW
// The dialog has a single grid, the two columns are emulated on each row:
// left cells with a fixed total width, a gap, then the right cells.
// A left row has at most two cells (label and control, or two buttons).
// ----------------------------------------------------------------------------------
function draw() {
  if (!dialog || !dialog.visible) {
    return;
  }

  dialog.clear();

  const map = tiled.activeAsset;
  if (!map || !map.isTileMap) {
    dialog.addLabel('Open a map to use Legacy Game Maker.');
    return;
  }

  const left = [];
  const right = [];

  // START EXPORT
  if (drawFoldout(left, 'Export', 'Export')) {
    drawFields(map, left, map, props.MAP_FIELDS, 'MAP');
    addRow(left, [
      () => button('Export Pack', () => operators.exportPack(false, map)),
      () => button('Export Selected Objects', () => operators.exportPack(true, map))
    ]);
  }
  // END EXPORT

  // START CREATE
  if (drawFoldout(left, 'Create', 'Create')) {
    for (let i = 0; i < operators.CREATE_OPERATORS.length; i += 2) {
      addRow(left, operators.CREATE_OPERATORS.slice(i, i + 2).map(operator => {
        return () => button(operator.text, () => operators.createObject(operator, map));
      }));
    }
  }
  // END CREATE

  const objects = map.selectedObjects;
  const object = objects.length == 1 ? objects[0] : null;
  const type = object ? utils.getObjectType(object) : '';

  // START TILE
  const tiles = tiled.mapEditor ? tiled.mapEditor.tilesetsView.selectedTiles : [];
  if (tiles.length == 1 && type != props.LAYER_JAS) {
    addHeading(right, `Tile ${tiles[0].id + 1} (${tiles[0].tileset.name})`);
    drawFields(map, right, tiles[0], props.TILE_FIELDS, 'TILE');
  }
  // END TILE

  // START OBJECT
  if (type != '') {
    addHeading(right, `${type}: ${utils.getExportName(object)}`);

    if (type == props.LAYER_JLM) {
      const text = object.polygon.length > 0 ? `${object.polygon.length} points` : 'Use a polyline or a polygon object';
      addRow(right, [() => dialog.addLabel(text)]);
    }

    drawFields(map, right, object, props.OBJECT_FIELDS[type], type);
  }
  // END OBJECT

  if (right.length == 0) {
    addRow(right, [() => dialog.addLabel('Select an object or a tile to edit its properties.')]);
  }

  drawRows(left, right);
  Qt.callLater(fitHeight);
}

/**
 * The panel cannot scroll, its height follows the opened foldouts.
 */
function fitHeight() {
  if (dialog && dialog.visible) {
    dialog.size = Qt.size(dialog.width, dialog.minimumSizeHint.height);
  }
}

// ----------------------------------------------------------------------------------
// ROWS
// ----------------------------------------------------------------------------------
function addRow(column, cells, label = null, fill = false) {
  column.push({ cells: cells, label: label, fill: fill });
}

function addHeading(column, text) {
  addRow(column, [() => {
    const heading = dialog.addLabel(text);
    heading.styleSheet = 'font-weight: bold; border-bottom: 1px solid palette(mid)';
    return heading;
  }]);
}

function drawRows(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    dialog.addNewRow();
    drawLeftRow(left[i]);
    setFixedWidth(dialog.addLabel(''), COLUMN_GAP);
    drawRightRow(right[i]);
  }
}

function drawLeftRow(row) {
  const cells = row ? row.cells.slice() : [];
  let widths = [LEFT_WIDTH / 2, LEFT_WIDTH / 2];

  if (row && row.label != null) {
    cells.unshift(() => dialog.addLabel(row.label));
    widths = [LEFT_LABEL_WIDTH, LEFT_WIDTH - LEFT_LABEL_WIDTH];
  }
  else if (cells.length == 1) {
    widths = [LEFT_WIDTH - 1, 1];
  }

  for (let i = 0; i < 2; i++) {
    setFixedWidth(cells[i] ? cells[i]() : dialog.addLabel(''), widths[i]);
  }
}

function drawRightRow(row) {
  if (!row) {
    dialog.addLabel('');
    return;
  }

  if (row.label != null) {
    setFixedWidth(dialog.addLabel(row.label), RIGHT_LABEL_WIDTH);
  }

  for (const cell of row.cells) {
    cell();
  }

  if (row.fill) {
    dialog.addLabel('');
  }
}

function setFixedWidth(widget, width) {
  widget.minimumWidth = width;
  widget.maximumWidth = width;
}

function button(text, onClicked) {
  const widget = dialog.addButton(text);
  widget.clicked.connect(onClicked);
  return widget;
}

// ----------------------------------------------------------------------------------
// FIELDS
// ----------------------------------------------------------------------------------
function drawFoldout(column, id, label) {
  const opened = foldouts[id] ?? false;

  addRow(column, [() => {
    const widget = button((opened ? '\u25BC ' : '\u25B6 ') + label, () => {
      foldouts[id] = !opened;
      requestDraw();
    });

    widget.flat = true;
    widget.styleSheet = 'text-align: left; font-weight: bold';
    return widget;
  }]);

  return opened;
}

function drawFields(map, column, owner, fields, scope = '') {
  let group = undefined;
  let opened = true;

  for (const field of fields) {
    if (field.visible && !field.visible(owner)) {
      continue;
    }

    if (field.group !== group) {
      group = field.group;
      opened = group ? drawFoldout(column, scope + '.' + group, group) : true;
    }

    if (!opened) {
      continue;
    }

    drawField(map, column, owner, fields, field);
  }
}

function drawField(map, column, owner, fields, field) {
  const value = field.type == 'slot' ? null : props.getValue(owner, field.key, fields);
  const set = v => props.setValue(owner, field.key, fields, v);

  switch (field.type) {
    case 'string': {
      addRow(column, [() => {
        const input = dialog.addTextInput('');
        input.text = value;
        input.editingFinished.connect(() => set(input.text));
        return input;
      }], field.label);
      break;
    }
    case 'int':
    case 'number': {
      addRow(column, [() => {
        const input = createNumberInput(field.type == 'int', value);
        input.valueChanged.connect(v => set(v));
        return input;
      }], field.label);
      break;
    }
    case 'bool': {
      addRow(column, [() => {
        const input = dialog.addCheckBox('');
        input.checked = value;
        input.stateChanged.connect(() => set(input.checked));
        return input;
      }], field.label);
      break;
    }
    case 'enum':
    case 'model': {
      const items = field.type == 'model' ? [''].concat(functions.getModelNames(map)) : field.items.slice();
      if (!items.includes(value)) {
        items.push(value);
      }

      addRow(column, [() => {
        const input = dialog.addComboBox('', items);
        input.currentIndex = items.indexOf(value);
        input.currentIndexChanged.connect(i => {
          set(items[i]);
          requestDraw();
        });
        return input;
      }], field.label);
      break;
    }
    case 'file':
    case 'directory': {
      addRow(column, [() => {
        const input = dialog.addFilePicker('');
        input.isDirectory = field.type == 'directory';
        if (field.type == 'file') {
          input.filter = TEXTURE_FILTER;
        }

        input.fileName = utils.resolvePath(map, value);
        input.fileUrlChanged.connect(() => set(utils.relativePath(map, input.fileName)));
        return input;
      }], field.label);
      break;
    }
    case 'vector': {
      const inputs = [];
      const cells = [];
      for (let i = 0; i < field.size; i++) {
        cells.push(() => {
          const input = createNumberInput(false, value[i]);
          input.valueChanged.connect(() => set(inputs.map(input => input.value)));
          inputs.push(input);
          return input;
        });
      }

      addRow(column, cells, field.label);
      break;
    }
    case 'color': {
      addRow(column, [() => {
        const input = dialog.addColorButton('');
        input.color = utils.rgbToColor(value);
        input.colorChanged.connect(() => set(utils.colorToRgb(input.color)));
        return input;
      }], field.label, true);
      break;
    }
    case 'slot': {
      const slot = props.getSlot(owner, field.key);
      addRow(column, [
        () => {
          const name = dialog.addTextInput('');
          name.text = slot.name;
          name.editingFinished.connect(() => owner.setProperty(field.key + 'Name', name.text));
          return name;
        },
        () => {
          const val = dialog.addTextInput('');
          val.text = slot.value;
          val.editingFinished.connect(() => owner.setProperty(field.key + 'Value', val.text));
          return val;
        }
      ], field.label);
      break;
    }
    case 'list': {
      const get = () => props.getValue(owner, field.key, fields);
      if (field.label != field.group) {
        addHeading(column, field.label);
      }

      addRow(column, [
        () => button('Add', () => {
          set(get().concat([props.createListItem(field)]));
          requestDraw();
        }),
        () => button('Remove', () => {
          set(get().slice(0, -1));
          requestDraw();
        })
      ]);

      for (let i = 0; i < value.length; i++) {
        addHeading(column, `${field.label} ${i + 1}`);
        drawFields(map, column, props.createListItemOwner(owner, field, i), field.fields);
      }
      break;
    }
  }
}

function createNumberInput(isInt, value) {
  const input = dialog.addNumberInput('');
  input.decimals = isInt ? 0 : 3;
  input.minimum = -NUMBER_LIMIT;
  input.maximum = NUMBER_LIMIT;
  input.value = value;
  return input;
}
